package com.nackchal.domain.item.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/** 계정이 가진 아이템 수량. 증감은 저장소의 조건부 쿼리로만 한다. */
@Entity
@Table(name = "inventories")
@IdClass(Inventory.Key.class)
public class Inventory {

    @Id
    private UUID userId;

    @Id
    @Column(length = 32)
    private String itemCode;

    @Column(nullable = false)
    private long quantity;

    @Column(nullable = false)
    private Instant updatedAt;

    protected Inventory() {
    }

    public String getItemCode() {
        return itemCode;
    }

    public long getQuantity() {
        return quantity;
    }

    /** 복합 키 (user_id, item_code). */
    public static class Key implements Serializable {
        private UUID userId;
        private String itemCode;

        protected Key() {
        }

        public Key(UUID userId, String itemCode) {
            this.userId = userId;
            this.itemCode = itemCode;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Key key && userId.equals(key.userId) && itemCode.equals(key.itemCode);
        }

        @Override
        public int hashCode() {
            return 31 * userId.hashCode() + itemCode.hashCode();
        }
    }
}
