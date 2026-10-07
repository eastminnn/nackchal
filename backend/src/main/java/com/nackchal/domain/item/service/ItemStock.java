package com.nackchal.domain.item.service;

import java.util.UUID;

/** 게임 중 아이템을 쓸 때 인벤토리에서 하나를 확정해 빼는 경로. 대기실은 메모리 잠금 밖에서 호출한다. */
public interface ItemStock {

    /**
     * 아이템 하나를 빼고 사용 기록을 남긴다.
     * @return 남은 보유 수량
     * @throws com.nackchal.common.exception.CustomException ITEM_OUT_OF_STOCK
     */
    long consume(UUID userId, String itemCode, UUID gameId, UUID targetUserId, UUID requestId);
}
