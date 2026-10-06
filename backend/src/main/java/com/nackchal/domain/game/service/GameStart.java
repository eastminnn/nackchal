package com.nackchal.domain.game.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** 게임 시작 기록에 필요한 값. 참가자 프로필은 시작 당시 스냅샷이다. */
public record GameStart(UUID gameId, String roomCode, String rulesVersion, Instant startedAt, List<Seat> seats) {

    public GameStart {
        seats = List.copyOf(seats);
    }

    public record Seat(UUID userId, int seatNo, String nickname, String avatarCode) {}
}
