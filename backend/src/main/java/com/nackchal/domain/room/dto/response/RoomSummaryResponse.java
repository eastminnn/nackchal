package com.nackchal.domain.room.dto.response;

import java.util.UUID;

/** 방 목록 한 줄. status는 waiting 또는 full. */
public record RoomSummaryResponse(String id, String name, int players, int capacity, String status,
                                  UUID hostUserId) {}
