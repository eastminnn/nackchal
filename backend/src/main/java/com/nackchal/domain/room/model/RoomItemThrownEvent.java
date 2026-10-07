package com.nackchal.domain.room.model;

import java.time.Instant;
import java.util.UUID;

/** DB에서 확정된 아이템 던지기. 방 상태에는 남기지 않고 그 방 참가자에게만 연출을 알린다. */
public record RoomItemThrownEvent(String roomId, UUID userId, UUID targetUserId, String item, Instant at) {}
