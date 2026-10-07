package com.nackchal.domain.wallet.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * 캐시 변경 원장 한 줄. 만든 뒤에는 수정·삭제하지 않는다
 */
@Entity
@Table(name = "cash_transactions")
public class CashTransaction {

    /** 캐시가 바뀐 이유. 보상은 게임, 구매 차감은 구매에 연결된다 */
    public enum Reason { GAME_REWARD, PURCHASE }

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private long amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private Reason reason;

    private UUID gameId;

    private UUID purchaseId;

    @Column(nullable = false)
    private Instant createdAt;

    protected CashTransaction() {
    }

    private CashTransaction(UUID userId, long amount, Reason reason, UUID gameId, UUID purchaseId,
                            Instant createdAt) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.amount = amount;
        this.reason = reason;
        this.gameId = gameId;
        this.purchaseId = purchaseId;
        this.createdAt = createdAt;
    }

    public static CashTransaction gameReward(UUID userId, long amount, UUID gameId, Instant now) {
        return new CashTransaction(userId, amount, Reason.GAME_REWARD, gameId, null, now);
    }

    /** 구매 차감. amount는 양수로 받고 원장에는 음수로 남긴다. */
    public static CashTransaction purchase(UUID userId, long amount, UUID purchaseId, Instant now) {
        return new CashTransaction(userId, -amount, Reason.PURCHASE, null, purchaseId, now);
    }

    public UUID getUserId() {
        return userId;
    }

    public long getAmount() {
        return amount;
    }

    public UUID getGameId() {
        return gameId;
    }
}
