package com.nackchal.domain.room.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.item.service.ItemStock;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

/** 메모리 재고. 다음 사용을 재고 부족으로 실패시켜 대기실의 선점 되돌리기를 검사한다. */
class FakeItemStock implements ItemStock {
    record Use(UUID userId, String itemCode, UUID gameId, UUID targetUserId) {}

    final List<Use> uses = new CopyOnWriteArrayList<>();
    volatile long remaining = 9;
    volatile boolean outOfStock;

    @Override
    public long consume(UUID userId, String itemCode, UUID gameId, UUID targetUserId, UUID requestId) {
        if (outOfStock) throw new CustomException(ErrorCode.ITEM_OUT_OF_STOCK);
        uses.add(new Use(userId, itemCode, gameId, targetUserId));
        return --remaining;
    }
}
