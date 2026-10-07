package com.nackchal.domain.item.event;

import java.util.UUID;

/** 아이템을 쓴 뒤(커밋 후) 본인에게만 남은 수량과 이번 판에 더 던질 수 있는 수를 알린다. */
public record InventoryChangedEvent(UUID userId, String itemCode, long quantity, int gameRemaining) {}
