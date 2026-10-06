package com.nackchal.domain.game.service;

import com.nackchal.domain.auction.model.GameSettlement;
import com.nackchal.domain.auction.model.GameSettlement.Outcome;
import com.nackchal.domain.auction.model.GameSettlement.Participant;
import com.nackchal.domain.auction.model.GameSettlement.Round;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
@SpringBootTest
class GameRecordServiceTests {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    private static final Instant START = Instant.parse("2026-10-06T00:00:00Z");
    private static final Instant END = START.plusSeconds(400);

    @Autowired GameRecordService records;
    @Autowired JdbcTemplate jdbc;

    private final UUID a = UUID.randomUUID();
    private final UUID b = UUID.randomUUID();
    private final UUID c = UUID.randomUUID();
    private final UUID gameId = UUID.randomUUID();

    @Test
    void startStoresRunningGameAndActiveParticipants() {
        start();
        assertThat(jdbc.queryForObject("SELECT status FROM games WHERE id = ?", String.class, gameId))
                .isEqualTo("RUNNING");
        assertThat(jdbc.queryForList("SELECT participation_status FROM game_participants WHERE game_id = ?",
                String.class, gameId)).containsOnly("ACTIVE").hasSize(3);
        assertThat(jdbc.queryForObject("SELECT nickname_snapshot FROM game_participants WHERE game_id = ? "
                + "AND user_id = ?", String.class, gameId, b)).isEqualTo("곰2");
    }

    @Test
    void finishedGamePaysTiedRanksAndKeepsLedgerEqualToBalance() {
        start();
        Map<UUID, Long> balances = records.settle(finished());

        assertThat(balances).containsOnly(Map.entry(a, 10L), Map.entry(b, 10L));
        assertThat(wallet(a)).isEqualTo(10);
        assertThat(wallet(b)).isEqualTo(10);
        assertThat(wallet(c)).isZero();
        for (UUID user : List.of(a, b, c)) {
            assertThat(jdbc.queryForObject("SELECT coalesce(sum(amount), 0) FROM cash_transactions WHERE user_id = ?",
                    Long.class, user)).as("원장 합계 = 잔액").isEqualTo(wallet(user));
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM cash_transactions WHERE game_id = ?", Long.class, gameId))
                .as("보상 0인 이탈자는 원장에 쓰지 않음").isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT status FROM games WHERE id = ?", String.class, gameId))
                .isEqualTo("COMPLETED");
        assertThat(jdbc.queryForMap("SELECT participation_status, rank, reward_cash, final_balance, left_at "
                + "FROM game_participants WHERE game_id = ? AND user_id = ?", gameId, c))
                .containsEntry("participation_status", "LEFT").containsEntry("rank", null)
                .containsEntry("reward_cash", 0L).containsEntry("final_balance", 40L)
                .satisfies(row -> assertThat(row.get("left_at")).isNotNull());
        assertThat(jdbc.queryForList("SELECT rank FROM game_participants WHERE game_id = ? AND user_id IN (?, ?)",
                Integer.class, gameId, a, b)).containsOnly(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM round_results WHERE game_id = ?", Long.class, gameId))
                .isEqualTo(10);
    }

    @Test
    void settlingTheSameGameAgainChangesNothing() {
        start();
        records.settle(finished());
        assertThat(records.settle(finished())).isEmpty();
        assertThat(wallet(a)).isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM cash_transactions WHERE game_id = ?", Long.class, gameId))
                .isEqualTo(2);
    }

    @Test
    void concurrentSettlementsPayOnce() throws Exception {
        start();
        var ready = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(4)) {
            List<Future<Map<UUID, Long>>> results = new ArrayList<>();
            for (int i = 0; i < 4; i++) results.add(pool.submit(() -> {
                ready.await();
                return records.settle(finished());
            }));
            ready.countDown();
            long paid = 0;
            for (var result : results) if (!result.get(10, TimeUnit.SECONDS).isEmpty()) paid++;
            assertThat(paid).isEqualTo(1);
        }
        assertThat(wallet(a)).isEqualTo(10);
    }

    @Test
    void abortedGameRecordsNoRewardsOrRounds() {
        start();
        var aborted = new GameSettlement(gameId, Outcome.ABORTED, END, List.of(
                new Participant(a, 100, false, null, null, 0),
                new Participant(b, 100, true, END, null, 0),
                new Participant(c, 100, true, END, null, 0)), List.of());

        assertThat(records.settle(aborted)).isEmpty();
        assertThat(jdbc.queryForObject("SELECT status FROM games WHERE id = ?", String.class, gameId))
                .isEqualTo("ABORTED");
        assertThat(jdbc.queryForList("SELECT participation_status FROM game_participants WHERE game_id = ? "
                + "ORDER BY participation_status", String.class, gameId)).containsExactly("ABORTED", "LEFT", "LEFT");
        assertThat(jdbc.queryForList("SELECT reward_cash FROM game_participants WHERE game_id = ?", Long.class, gameId))
                .containsOnly(0L);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM round_results WHERE game_id = ?", Long.class, gameId))
                .isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM cash_transactions WHERE game_id = ?", Long.class, gameId))
                .isZero();
    }

    @Test
    void failedSettlementLeavesNothingBehind() {
        start();
        var finished = finished();
        var broken = new ArrayList<>(finished.rounds());
        // 참가자가 아닌 낙찰자는 외래 키에 걸려 트랜잭션 전체가 롤백돼야 한다.
        broken.set(9, new Round(10, "vase", "화병", "RARE", "EPIC", 90, UUID.randomUUID(), 20, END));
        var settlement = new GameSettlement(gameId, Outcome.FINISHED, END, finished.participants(), broken);

        assertThatThrownBy(() -> records.settle(settlement)).isInstanceOf(RuntimeException.class);
        assertThat(jdbc.queryForObject("SELECT status FROM games WHERE id = ?", String.class, gameId))
                .isEqualTo("RUNNING");
        assertThat(wallet(a)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM cash_transactions WHERE game_id = ?", Long.class, gameId))
                .isZero();
        assertThat(jdbc.queryForList("SELECT participation_status FROM game_participants WHERE game_id = ?",
                String.class, gameId)).containsOnly("ACTIVE");
    }

    @Test
    void settlementForDifferentParticipantsIsRejected() {
        start();
        var stranger = new GameSettlement(gameId, Outcome.ABORTED, END,
                List.of(new Participant(UUID.randomUUID(), 100, false, null, null, 0)), List.of());
        assertThatThrownBy(() -> records.settle(stranger)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void startupCleanupAbortsRunningGames() {
        start();
        assertThat(records.abortUnfinished(END)).isGreaterThanOrEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT status FROM games WHERE id = ?", String.class, gameId))
                .isEqualTo("ABORTED");
        assertThat(jdbc.queryForList("SELECT participation_status FROM game_participants WHERE game_id = ?",
                String.class, gameId)).containsOnly("ABORTED");
        assertThat(records.settle(finished())).as("정리된 판은 정산하지 않음").isEmpty();
        assertThat(wallet(a)).isZero();
    }

    private void start() {
        int seat = 0;
        List<GameStart.Seat> seats = new ArrayList<>();
        for (UUID user : List.of(a, b, c)) {
            jdbc.update("INSERT INTO users (id, nickname, avatar_code, created_at) VALUES (?, '곰', 'plush-bear', now())",
                    user);
            jdbc.update("INSERT INTO wallets (user_id, balance, updated_at) VALUES (?, 0, now())", user);
            seats.add(new GameStart.Seat(user, seat, "곰" + (seat + 1), "plush-bear"));
            seat++;
        }
        records.recordStart(new GameStart(gameId, "ABC123", "auction-v1", START, seats));
    }

    /** a와 b가 잔액 120으로 공동 1등, c는 중도 이탈. */
    private GameSettlement finished() {
        List<Round> rounds = new ArrayList<>();
        for (int round = 1; round <= 10; round++) {
            UUID winner = round == 1 ? a : round == 2 ? b : null;
            rounds.add(new Round(round, "radio", "라디오", "COMMON", "RARE", 40, winner, winner == null ? 0 : 20,
                    START.plusSeconds(round * 28L)));
        }
        return new GameSettlement(gameId, Outcome.FINISHED, END, List.of(
                new Participant(a, 120, false, null, 1, 10),
                new Participant(b, 120, false, null, 1, 10),
                new Participant(c, 40, true, START.plusSeconds(100), null, 0)), rounds);
    }

    private long wallet(UUID user) {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, user);
    }
}
