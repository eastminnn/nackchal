package com.nackchal.domain.room.dto.response;

import java.util.List;
import java.util.UUID;

/** 참가자에게 보내는 방 전체 상태. version은 상태가 바뀔 때마다 증가한다. */
public record RoomResponse(String id, String name, UUID hostUserId, int capacity, long version,
                           List<RoomMemberResponse> players, List<RoomChatResponse> chats) {}
