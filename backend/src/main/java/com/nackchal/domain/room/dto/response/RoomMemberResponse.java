package com.nackchal.domain.room.dto.response;

import java.util.UUID;

/** 방 참가자. seat는 0~3 좌석 번호, connected는 재접속 대기 중이면 false. */
public record RoomMemberResponse(UUID userId, String nickname, String avatarCode, int seat,
                                 boolean ready, boolean connected) {}
