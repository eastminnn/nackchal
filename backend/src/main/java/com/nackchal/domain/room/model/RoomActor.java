package com.nackchal.domain.room.model;

import java.util.UUID;

/** 방 명령을 보낸 사용자와 연결. 같은 계정이라도 connectionId가 다르면 다른 탭으로 본다. */
public record RoomActor(UUID userId, String connectionId, String nickname, String avatarCode) {}
