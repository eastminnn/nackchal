package com.nackchal.domain.room.dto.response;

import java.util.UUID;

/** 채팅 한 건. id는 방 안에서 증가하는 순번, at은 서버 수신 시각(epoch ms). */
public record RoomChatResponse(long id, UUID userId, String nickname, String body, long at) {}
