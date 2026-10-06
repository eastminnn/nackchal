package com.nackchal.domain.auction.model;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.auction.dto.response.GamePlayerResponse;
import com.nackchal.domain.auction.dto.response.GameResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

class AuctionGameTests {
    private static final Instant START = Instant.parse("2026-10-06T00:00:00Z");
    private final UUID a = UUID.randomUUID();
    private final UUID b = UUID.randomUUID();
    private final UUID c = UUID.randomUUID();
    private final AuctionGame game = AuctionGame.start(List.of(a, b, c), START, new Random(42));

    @Test
    void startsFirstRoundWithStartingBalancesAndNoHiddenValues() {
        GameResponse state = game.snapshot();
        assertThat(state.status()).isEqualTo("AUCTION");
        assertThat(state.round()).isEqualTo(1);
        assertThat(state.totalRounds()).isEqualTo(10);
        assertThat(state.phaseEndsAt()).isEqualTo(at(20_000).toEpochMilli());
        assertThat(state.auction().price()).isEqualTo(5);
        assertThat(state.auction().leaderUserId()).isNull();
        assertThat(state.players()).extracting(GamePlayerResponse::balance).containsOnly(100);
        assertThat(state.lot().hint()).isIn("일반", "레어", "에픽", "전설");
        assertThat(state.reveal()).isNull();
        assertThat(state.history()).isEmpty();
        assertThat(state.result()).isNull();
    }

    @Test
    void rejectsBidsInProtocolOrderAndReturnsCurrentAuction() {
        UUID id = game.id();
        assertThat(code(() -> game.bid(a, UUID.randomUUID(), 1, 0, 5, at(1000)))).isEqualTo(ErrorCode.GAME_NOT_FOUND);
        assertThat(code(() -> game.bid(UUID.randomUUID(), id, 1, 0, 5, at(1000)))).isEqualTo(ErrorCode.GAME_NOT_FOUND);
        assertThat(code(() -> game.bid(a, id, 2, 0, 5, at(1000)))).isEqualTo(ErrorCode.BID_CLOSED);
        assertThat(code(() -> game.bid(a, id, 1, 0, 4, at(1000)))).isEqualTo(ErrorCode.BID_TOO_LOW);
        assertThat(code(() -> game.bid(a, id, 1, 0, 101, at(1000)))).isEqualTo(ErrorCode.BID_INSUFFICIENT_BALANCE);

        game.bid(a, id, 1, 0, 5, at(1000));
        assertThat(code(() -> game.bid(a, id, 1, 1, 6, at(1100)))).isEqualTo(ErrorCode.BID_ALREADY_LEADING);
        assertThat(code(() -> game.bid(b, id, 1, 1, 5, at(1100)))).isEqualTo(ErrorCode.BID_TOO_LOW);
        var stale = catchThrowableOfType(BidRejectedException.class, () -> game.bid(b, id, 1, 0, 10, at(1100)));
        assertThat(stale.getErrorCode()).isEqualTo(ErrorCode.BID_STALE);
        assertThat(stale.getAuction().price()).isEqualTo(5);
        assertThat(stale.getAuction().leaderUserId()).isEqualTo(a);
        assertThat(stale.getAuction().bidVersion()).isEqualTo(1);
        assertThat(code(() -> game.bid(b, id, 1, 1, 10, at(20_000)))).isEqualTo(ErrorCode.BID_CLOSED);
    }

    @Test
    void lateBidsExtendToThreeSecondsUpToFifteenSecondsPerRound() {
        game.bid(a, game.id(), 1, 0, 5, at(18_500));
        assertThat(game.snapshot().phaseEndsAt()).isEqualTo(at(21_500).toEpochMilli());
        assertThat(game.snapshot().auction().extendedMs()).isEqualTo(1_500);
        game.bid(b, game.id(), 1, 1, 6, at(10_000));
        assertThat(game.snapshot().phaseEndsAt()).as("4초 이상 남은 입찰은 연장하지 않음").isEqualTo(at(21_500).toEpochMilli());

        Instant now = at(21_000);
        for (int version = 2; version < 30; version++) {
            UUID bidder = version % 2 == 0 ? a : b;
            game.bid(bidder, game.id(), 1, version, 5 + version, now);
            now = Instant.ofEpochMilli(game.snapshot().phaseEndsAt()).minusMillis(10);
        }
        assertThat(game.snapshot().auction().extendedMs()).isEqualTo(15_000);
        assertThat(game.snapshot().phaseEndsAt()).isEqualTo(at(35_000).toEpochMilli());
    }

    @Test
    void soldRoundChargesWinnerThenRevealPaysValue() {
        game.bid(b, game.id(), 1, 0, 30, at(1_000));
        assertThat(game.advance(at(19_999))).isFalse();
        assertThat(game.advance(at(20_000))).isTrue();
        GameResponse sold = game.snapshot();
        assertThat(sold.status()).isEqualTo("SOLD");
        assertThat(balance(sold, b)).isEqualTo(70);
        assertThat(sold.reveal()).as("공개 전에는 실제 가치를 보내지 않음").isNull();
        assertThat(sold.history()).isEmpty();

        game.advance(at(25_000));
        GameResponse revealed = game.snapshot();
        assertThat(revealed.status()).isEqualTo("REVEAL");
        int value = revealed.reveal().value();
        assertThat(revealed.reveal().winnerUserId()).isEqualTo(b);
        assertThat(revealed.reveal().price()).isEqualTo(30);
        assertThat(revealed.reveal().profit()).isEqualTo(value - 30);
        assertThat(balance(revealed, b)).isEqualTo(70 + value);
        assertThat(revealed.history()).singleElement().satisfies(result -> {
            assertThat(result.round()).isEqualTo(1);
            assertThat(result.winnerUserId()).isEqualTo(b);
            assertThat(result.value()).isEqualTo(value);
        });

        game.advance(at(28_000));
        GameResponse next = game.snapshot();
        assertThat(next.status()).isEqualTo("AUCTION");
        assertThat(next.round()).isEqualTo(2);
        assertThat(next.phaseEndsAt()).isEqualTo(at(48_000).toEpochMilli());
        assertThat(next.auction().bidVersion()).isZero();
        assertThat(next.reveal()).isNull();
    }

    @Test
    void unsoldRoundRevealsValueWithoutChangingBalances() {
        game.advance(at(25_000));
        GameResponse revealed = game.snapshot();
        assertThat(revealed.reveal().winnerUserId()).isNull();
        assertThat(revealed.reveal().price()).isZero();
        assertThat(revealed.reveal().profit()).isZero();
        assertThat(revealed.players()).extracting(GamePlayerResponse::balance).containsOnly(100);
    }

    @Test
    void lateAdvanceKeepsScheduleAndFinishesWithTiedRanks() {
        game.bid(c, game.id(), 1, 0, 5, at(1_000));
        assertThat(game.advance(at(28_000 * 10))).isTrue();
        GameResponse finished = game.snapshot();
        assertThat(finished.status()).isEqualTo("FINISHED");
        assertThat(finished.round()).isEqualTo(10);
        assertThat(finished.phaseEndsAt()).isNull();
        assertThat(finished.history()).hasSize(10);
        var ranking = finished.result().ranking();
        assertThat(ranking).hasSize(3);
        int cBalance = 100 - 5 + finished.history().getFirst().value();
        assertThat(balance(finished, c)).isEqualTo(cBalance);
        // a와 b는 항상 100으로 동점이다. c의 잔액에 따라 순위만 달라진다.
        int tieRank = cBalance > 100 ? 2 : 1;
        assertThat(ranking).filteredOn(entry -> !entry.userId().equals(c)).allSatisfy(entry -> {
            assertThat(entry.rank()).isEqualTo(tieRank);
            assertThat(entry.reward()).isEqualTo(tieRank == 1 ? 10 : 5);
        });
        int cRank = cBalance > 100 ? 1 : cBalance == 100 ? 1 : 3;
        assertThat(ranking).filteredOn(entry -> entry.userId().equals(c)).singleElement()
                .satisfies(entry -> assertThat(entry.rank()).isEqualTo(cRank));
        assertThat(ranking).extracting(entry -> entry.balance()).isSortedAccordingTo((x, y) -> y - x);
        assertThat(game.advance(at(28_000 * 20))).isFalse();
    }

    @Test
    void leavingLeaderKeepsBidButIsExcludedFromRanking() {
        game.bid(a, game.id(), 1, 0, 40, at(1_000));
        assertThat(game.leave(a)).isTrue();
        assertThat(game.leave(a)).isFalse();
        assertThat(code(() -> game.bid(a, game.id(), 1, 1, 50, at(2_000)))).isEqualTo(ErrorCode.GAME_NOT_FOUND);
        game.advance(at(20_000));
        GameResponse sold = game.snapshot();
        assertThat(sold.players()).filteredOn(GamePlayerResponse::left).singleElement()
                .satisfies(player -> assertThat(player.balance()).isEqualTo(60));
        game.advance(at(28_000 * 10));
        assertThat(game.snapshot().result().ranking()).extracting(entry -> entry.userId()).containsExactlyInAnyOrder(b, c);
    }

    @Test
    void abortsWithoutRankingWhenOnlyOnePlayerRemains() {
        game.leave(a);
        assertThat(game.inProgress()).isTrue();
        game.leave(b);
        GameResponse aborted = game.snapshot();
        assertThat(aborted.status()).isEqualTo("ABORTED");
        assertThat(aborted.phaseEndsAt()).isNull();
        assertThat(aborted.result().ranking()).isEmpty();
        assertThat(game.advance(at(60_000))).isFalse();
        assertThat(game.leave(c)).isFalse();
    }

    private static Instant at(long millis) {
        return START.plus(Duration.ofMillis(millis));
    }

    private static int balance(GameResponse state, UUID userId) {
        return state.players().stream().filter(player -> player.userId().equals(userId)).findFirst().orElseThrow().balance();
    }

    private static ErrorCode code(Runnable action) {
        return catchThrowableOfType(CustomException.class, action::run).getErrorCode();
    }
}
