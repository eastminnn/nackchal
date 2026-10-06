package com.nackchal.domain.room.controller;

import com.nackchal.domain.room.dto.response.RoomSummaryResponse;
import com.nackchal.domain.room.service.RoomService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 방 목록 조회. 참가와 퇴장은 조작 중인 WebSocket 연결을 기준으로 처리한다. */
@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @GetMapping
    public List<RoomSummaryResponse> list() {
        return roomService.list();
    }
}
