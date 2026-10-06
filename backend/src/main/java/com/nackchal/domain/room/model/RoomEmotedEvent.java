package com.nackchal.domain.room.model;

import java.time.Instant;
import java.util.UUID;

/** 참가자가 모션을 시작했음을 알리는 순간 이벤트. 방 상태에는 남기지 않고 그 방 참가자에게만 전달한다. */
public record RoomEmotedEvent(String roomId, UUID userId, EmoteKind emote, Instant startedAt, Instant endsAt) {}
