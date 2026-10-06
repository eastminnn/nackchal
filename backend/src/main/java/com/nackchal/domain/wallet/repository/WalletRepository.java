package com.nackchal.domain.wallet.repository;

import com.nackchal.domain.wallet.entity.Wallet;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

/** 지갑 조회와 잔액 증가. */
public interface WalletRepository extends JpaRepository<Wallet, UUID> {

    /** 잔액을 읽지 않고 DB에서 바로 더해 동시 지급이 서로를 덮어쓰지 않게 한다. 바뀐 행 수를 돌려준다. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Wallet wallet set wallet.balance = wallet.balance + :amount, wallet.updatedAt = :now "
            + "where wallet.userId = :userId")
    int add(UUID userId, long amount, Instant now);
}
