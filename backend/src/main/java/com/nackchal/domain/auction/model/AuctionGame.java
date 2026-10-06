package com.nackchal.domain.auction.model;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.auction.dto.response.AuctionStateResponse;
import com.nackchal.domain.auction.dto.response.BidResponse;
import com.nackchal.domain.auction.dto.response.GamePlayerResponse;
import com.nackchal.domain.auction.dto.response.GameResponse;
import com.nackchal.domain.auction.dto.response.GameResultResponse;
import com.nackchal.domain.auction.dto.response.LotResponse;
import com.nackchal.domain.auction.dto.response.RankingResponse;
import com.nackchal.domain.auction.dto.response.RevealResponse;
import com.nackchal.domain.auction.dto.response.RoundResultResponse;
import com.nackchal.domain.auction.model.LotCatalog.Item;
import com.nackchal.domain.auction.model.LotCatalog.Lot;
import com.nackchal.domain.auction.model.LotCatalog.Secret;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.random.RandomGenerator;

/**
 * 경매 한 판의 상태와 규칙. 잠금을 갖지 않으므로 호출하는 쪽(RoomService)이 방 잠금 안에서만 사용한다.
 * 시각은 항상 인자로 받은 서버 시각을 쓰며, 실제 등급·가치는 공개 단계 전까지 응답에 넣지 않는다.
 */
public final class AuctionGame {

    public static final int TOTAL_ROUNDS = 10;
    static final int START_BALANCE = 100;
    static final int START_PRICE = 5;
    static final Duration AUCTION_TIME = Duration.ofSeconds(20);
    static final Duration SOLD_TIME = Duration.ofSeconds(5);
    static final Duration REVEAL_TIME = Duration.ofSeconds(3);
    static final Duration EXTEND_WINDOW = Duration.ofSeconds(3);
    static final Duration MAX_EXTENSION = Duration.ofSeconds(15);
    private static final int BID_LOG_SIZE = 10;

    /** 단계 순서: AUCTION → SOLD → REVEAL → (다음 라운드 AUCTION | FINISHED). 참가자가 부족하면 ABORTED. */
    public enum Status { AUCTION, SOLD, REVEAL, FINISHED, ABORTED }

    private final UUID id = UUID.randomUUID();
    private final RandomGenerator random;
    private final List<Item> items;
    private final Map<UUID, Player> players = new LinkedHashMap<>();
    private final List<RoundResultResponse> history = new ArrayList<>();
    private final Deque<BidResponse> bids = new ArrayDeque<>();
    private Status status;
    private int round;
    private Instant phaseEndsAt;
    private Lot lot;
    private Secret secret;
    private int price;
    private UUID leader;
    private long bidVersion;
    private Duration extended;
    private RevealResponse reveal;
    private List<RankingResponse> ranking;

    private AuctionGame(Collection<UUID> userIds, RandomGenerator random) {
        this.random = random;
        this.items = LotCatalog.shuffled(random);
        userIds.forEach(userId -> players.put(userId, new Player(START_BALANCE)));
    }

    /** 참가자 전원에게 시작 잔액을 주고 1라운드 경매를 연다. 시작 조건은 호출하는 쪽에서 확인한다. */
    public static AuctionGame start(Collection<UUID> userIds, Instant now, RandomGenerator random) {
        AuctionGame game = new AuctionGame(userIds, random);
        game.beginRound(now);
        return game;
    }

    public UUID id() {
        return id;
    }

    /** 입찰·이탈 처리가 필요한 진행 중 단계인지. 끝난 게임은 결과 표시용으로만 남는다. */
    public boolean inProgress() {
        return status != Status.FINISHED && status != Status.ABORTED;
    }

    /**
     * 입찰을 검사하고 수락한다. 검사 순서는 프로토콜 문서와 같으며, 남은 시간이 3초 이하면 마감을 연장한다.
     * 잔액은 낙찰 시점에 차감한다.
     * @throws CustomException GAME_NOT_FOUND
     * @throws BidRejectedException BID_CLOSED, BID_STALE, BID_ALREADY_LEADING, BID_TOO_LOW, BID_INSUFFICIENT_BALANCE
     */
    public void bid(UUID userId, UUID gameId, int round, long expectedBidVersion, int amount, Instant now) {
        Player player = players.get(userId);
        if (!id.equals(gameId) || player == null || player.left) throw new CustomException(ErrorCode.GAME_NOT_FOUND);
        if (status != Status.AUCTION || round != this.round || !now.isBefore(phaseEndsAt)) reject(ErrorCode.BID_CLOSED);
        if (expectedBidVersion != bidVersion) reject(ErrorCode.BID_STALE);
        if (userId.equals(leader)) reject(ErrorCode.BID_ALREADY_LEADING);
        if (amount < (leader == null ? START_PRICE : price + 1)) reject(ErrorCode.BID_TOO_LOW);
        if (amount > player.balance) reject(ErrorCode.BID_INSUFFICIENT_BALANCE);

        price = amount;
        leader = userId;
        bidVersion++;
        bids.addFirst(new BidResponse(userId, amount, now.toEpochMilli()));
        if (bids.size() > BID_LOG_SIZE) bids.removeLast();
        if (!Duration.between(now, phaseEndsAt).minus(EXTEND_WINDOW).isPositive()) {
            // 남은 시간을 3초로 되돌리되, 라운드당 연장 합계는 15초를 넘지 않는다.
            Duration added = Duration.between(phaseEndsAt, now.plus(EXTEND_WINDOW));
            Duration remaining = MAX_EXTENSION.minus(extended);
            if (added.compareTo(remaining) > 0) added = remaining;
            phaseEndsAt = phaseEndsAt.plus(added);
            extended = extended.plus(added);
        }
    }

    /**
     * 마감 시각이 지난 단계를 다음 단계로 넘긴다. 늦게 호출돼도 각 단계는 이전 단계의 마감 시각부터 계산하므로
     * 진행 일정이 밀리지 않는다.
     * @return 상태가 바뀌었는지
     */
    public boolean advance(Instant now) {
        boolean changed = false;
        while (inProgress() && !now.isBefore(phaseEndsAt)) {
            switch (status) {
                case AUCTION -> sell();
                case SOLD -> revealValue();
                case REVEAL -> {
                    if (round < TOTAL_ROUNDS) beginRound(phaseEndsAt);
                    else finish();
                }
                default -> throw new IllegalStateException("Unexpected status " + status);
            }
            changed = true;
        }
        return changed;
    }

    /**
     * 참가자의 이탈을 기록한다. 이탈자의 잔액과 입찰은 그대로 두고 순위에서만 뺀다.
     * 남은 참가자가 1명 이하가 되면 게임을 중단한다.
     * @return 상태가 바뀌었는지
     */
    public boolean leave(UUID userId) {
        Player player = players.get(userId);
        if (!inProgress() || player == null || player.left) return false;
        player.left = true;
        if (players.values().stream().filter(other -> !other.left).count() <= 1) {
            status = Status.ABORTED;
            phaseEndsAt = null;
            ranking = List.of();
        }
        return true;
    }

    public GameResponse snapshot() {
        return new GameResponse(id, status.name(), round, TOTAL_ROUNDS,
                phaseEndsAt == null ? null : phaseEndsAt.toEpochMilli(),
                new LotResponse(lot.kind(), lot.name(), lot.description(), lot.hint().label()),
                auctionState(),
                players.entrySet().stream()
                        .map(entry -> new GamePlayerResponse(entry.getKey(), entry.getValue().balance, entry.getValue().left))
                        .toList(),
                status == Status.REVEAL ? reveal : null,
                List.copyOf(history),
                ranking == null ? null : new GameResultResponse(ranking));
    }

    private void beginRound(Instant startsAt) {
        round++;
        LotCatalog.Draw draw = LotCatalog.draw(items.get((round - 1) % items.size()), random);
        lot = draw.lot();
        secret = draw.secret();
        status = Status.AUCTION;
        phaseEndsAt = startsAt.plus(AUCTION_TIME);
        price = START_PRICE;
        leader = null;
        bidVersion = 0;
        extended = Duration.ZERO;
        bids.clear();
        reveal = null;
    }

    private void sell() {
        if (leader != null) players.get(leader).balance -= price;
        status = Status.SOLD;
        phaseEndsAt = phaseEndsAt.plus(SOLD_TIME);
    }

    private void revealValue() {
        int paid = leader == null ? 0 : price;
        if (leader != null) players.get(leader).balance += secret.value();
        reveal = new RevealResponse(secret.grade().label(), secret.value(), leader, paid,
                leader == null ? 0 : secret.value() - paid);
        history.add(new RoundResultResponse(round, lot.kind(), lot.name(), leader, paid,
                secret.grade().label(), secret.value()));
        status = Status.REVEAL;
        phaseEndsAt = phaseEndsAt.plus(REVEAL_TIME);
    }

    private void finish() {
        List<Map.Entry<UUID, Player>> ranked = players.entrySet().stream()
                .filter(entry -> !entry.getValue().left)
                .sorted((a, b) -> Integer.compare(b.getValue().balance, a.getValue().balance))
                .toList();
        ranking = ranked.stream().map(entry -> {
            int balance = entry.getValue().balance;
            // 동점자는 같은 순위다. 1등이 두 명이면 다음 사람은 3등이다.
            int rank = 1 + (int) ranked.stream().filter(other -> other.getValue().balance > balance).count();
            return new RankingResponse(entry.getKey(), rank, balance, rank == 1 ? 10 : rank == 2 ? 5 : 2);
        }).toList();
        status = Status.FINISHED;
        phaseEndsAt = null;
        reveal = null;
    }

    private AuctionStateResponse auctionState() {
        return new AuctionStateResponse(price, leader, bidVersion, extended.toMillis(), List.copyOf(bids));
    }

    private void reject(ErrorCode code) {
        throw new BidRejectedException(code, auctionState());
    }

    private static final class Player {
        int balance;
        boolean left;

        Player(int balance) {
            this.balance = balance;
        }
    }
}
