package com.nackchal.domain.wallet.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * 계정의 현재 캐시 잔액. 잔액은 cash_transactions 합계와 같아야 하며 WalletService만 바꾼다
 */
@Entity
@Table(name = "wallets")
public class Wallet {

    @Id
    private UUID userId;

    @Column(nullable = false)
    private long balance;

    @Column(nullable = false)
    private Instant updatedAt;

    protected Wallet() {
    }

    public Wallet(UUID userId, Instant now) {
        this.userId = userId;
        this.balance = 0;
        this.updatedAt = now;
    }

    public UUID getUserId() {
        return userId;
    }

    public long getBalance() {
        return balance;
    }
}
