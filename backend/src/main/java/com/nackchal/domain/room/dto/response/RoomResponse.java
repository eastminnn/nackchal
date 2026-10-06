package com.nackchal.domain.room.dto.response;

import com.nackchal.domain.auction.dto.response.GameResponse;
import java.util.List;
import java.util.UUID;

/** 참가자에게 보내는 방 전체 상태. version은 상태가 바뀔 때마다 증가하고, game은 게임을 시작한 적이 없으면 null이다. */
public record RoomResponse(String id, String name, UUID hostUserId, int capacity, long version,
                           List<RoomMemberResponse> players, List<RoomChatResponse> chats,
                           GameResponse game) {}
