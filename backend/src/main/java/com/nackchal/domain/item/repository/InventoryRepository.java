package com.nackchal.domain.item.repository;

import com.nackchal.domain.item.entity.Inventory;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

/** 보유 수량 조회와 증감. 증감은 DB에서 바로 계산해 동시 요청이 서로를 덮어쓰지 않게 한다. */
public interface InventoryRepository extends JpaRepository<Inventory, Inventory.Key> {

    List<Inventory> findByUserId(UUID userId);

    /** 없던 아이템이면 새로 만들고 있으면 더한다. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "INSERT INTO inventories (user_id, item_code, quantity, updated_at) VALUES (:userId, :itemCode, "
            + ":quantity, :now) ON CONFLICT (user_id, item_code) DO UPDATE SET quantity = inventories.quantity "
            + "+ EXCLUDED.quantity, updated_at = EXCLUDED.updated_at", nativeQuery = true)
    void add(UUID userId, String itemCode, long quantity, Instant now);

    /** 1개 이상 있을 때만 1개 줄인다. 바뀐 행 수를 돌려준다. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update Inventory inventory set inventory.quantity = inventory.quantity - 1, inventory.updatedAt = :now "
            + "where inventory.userId = :userId and inventory.itemCode = :itemCode and inventory.quantity > 0")
    int takeOne(UUID userId, String itemCode, Instant now);
}
