package com.nackchal.domain.item.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.item.entity.Inventory;
import com.nackchal.domain.item.entity.ItemUse;
import com.nackchal.domain.item.repository.InventoryRepository;
import com.nackchal.domain.item.repository.ItemUseRepository;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 게임 중 아이템 사용을 DB에 확정한다. 1개 이상 있을 때만 줄여 동시에 마지막 하나를 써도 한 번만 성공한다
 */
@Service
@Transactional
public class ItemService implements ItemStock {

    private final InventoryRepository inventoryRepository;
    private final ItemUseRepository itemUseRepository;
    private final Clock clock;

    public ItemService(InventoryRepository inventoryRepository, ItemUseRepository itemUseRepository, Clock clock) {
        this.inventoryRepository = inventoryRepository;
        this.itemUseRepository = itemUseRepository;
        this.clock = clock;
    }

    @Override
    public long consume(UUID userId, String itemCode, UUID gameId, UUID targetUserId, UUID requestId) {
        if (inventoryRepository.takeOne(userId, itemCode, clock.instant()) != 1) {
            throw new CustomException(ErrorCode.ITEM_OUT_OF_STOCK);
        }
        itemUseRepository.saveAndFlush(new ItemUse(gameId, userId, targetUserId, itemCode, requestId, clock.instant()));
        return inventoryRepository.findById(new Inventory.Key(userId, itemCode)).orElseThrow().getQuantity();
    }
}
