package com.nackchal.domain.wallet.repository;

import com.nackchal.domain.wallet.entity.CashTransaction;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 캐시 원장 기록. */
public interface CashTransactionRepository extends JpaRepository<CashTransaction, UUID> {
}
