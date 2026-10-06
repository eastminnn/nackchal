package com.nackchal.domain.room.dto.response;

import java.util.UUID;

/** 방 목록 한 줄. status는 waiting, full 또는 playing(게임 진행 중). */
public record RoomSummaryResponse(String id, String name, int players, int capacity, String status,
                                  UUID hostUserId) {}
