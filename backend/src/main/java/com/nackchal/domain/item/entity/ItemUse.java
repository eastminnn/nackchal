package com.nackchal.domain.item.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** 확정된 아이템 사용 한 건. 성공한 던지기만 남긴다. */
@Entity
@Table(name = "item_uses")
public class ItemUse {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID gameId;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private UUID targetUserId;

    @Column(nullable = false, length = 32)
    private String itemCode;

    @Column(nullable = false)
    private UUID requestId;

    @Column(nullable = false)
    private Instant createdAt;

    protected ItemUse() {
    }

    public ItemUse(UUID gameId, UUID userId, UUID targetUserId, String itemCode, UUID requestId, Instant now) {
        this.id = UUID.randomUUID();
        this.gameId = gameId;
        this.userId = userId;
        this.targetUserId = targetUserId;
        this.itemCode = itemCode;
        this.requestId = requestId;
        this.createdAt = now;
    }
}
