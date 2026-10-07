package com.nackchal.domain.shop.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** 확정된 구매. 같은 사용자의 같은 requestId는 한 번만 저장된다. */
@Entity
@Table(name = "shop_purchases")
public class ShopPurchase {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private UUID requestId;

    @Column(nullable = false, length = 32)
    private String itemCode;

    @Column(nullable = false)
    private int quantity;

    @Column(nullable = false)
    private long unitPriceCash;

    @Column(nullable = false)
    private long totalCash;

    @Column(nullable = false)
    private Instant createdAt;

    protected ShopPurchase() {
    }

    public ShopPurchase(UUID userId, UUID requestId, String itemCode, int quantity, long unitPriceCash, Instant now) {
        this.id = UUID.randomUUID();
        this.userId = userId;
        this.requestId = requestId;
        this.itemCode = itemCode;
        this.quantity = quantity;
        this.unitPriceCash = unitPriceCash;
        this.totalCash = unitPriceCash * quantity;
        this.createdAt = now;
    }

    public UUID getId() {
        return id;
    }

    public String getItemCode() {
        return itemCode;
    }

    public int getQuantity() {
        return quantity;
    }

    public long getTotalCash() {
        return totalCash;
    }
}
