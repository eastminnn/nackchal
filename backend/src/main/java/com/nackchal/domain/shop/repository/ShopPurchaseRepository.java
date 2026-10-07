package com.nackchal.domain.shop.repository;

import com.nackchal.domain.shop.entity.ShopPurchase;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 구매 기록. */
public interface ShopPurchaseRepository extends JpaRepository<ShopPurchase, UUID> {

    Optional<ShopPurchase> findByUserIdAndRequestId(UUID userId, UUID requestId);
}
