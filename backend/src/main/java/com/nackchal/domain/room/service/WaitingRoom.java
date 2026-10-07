package com.nackchal.domain.room.service;

import com.nackchal.domain.auction.model.AuctionGame;
import com.nackchal.domain.game.service.GameStart;
import com.nackchal.domain.room.dto.response.RoomChatResponse;
import com.nackchal.domain.room.dto.response.RoomMemberResponse;
import com.nackchal.domain.room.dto.response.RoomResponse;
import com.nackchal.domain.room.model.RoomActor;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

/** 서비스가 이 인스턴스의 잠금을 잡은 동안만 읽고 변경하는 대기실 상태. */
final class WaitingRoom {
    final String id;
    final String name;
    final LinkedHashMap<UUID, Member> members = new LinkedHashMap<>();
    final List<RoomChatResponse> chats = new ArrayList<>();
    long version = 1;
    long chatSequence;
    /** 가장 최근 게임. 끝난 게임도 다음 시작 전까지 결과 표시용으로 남긴다. */
    AuctionGame game;
    /** DB에 기록 중인 게임 시작. 기록이 끝나면 game으로 바뀌거나 취소된다. */
    GameStart starting;
    /** 진행 중인 판의 아이템 던지기 제한. 판이 바뀌면 새로 만든다. */
    ItemThrows itemThrows;

    WaitingRoom(String id, String name) { this.id = id; this.name = name; }

    boolean occupied(int seat) {
        return members.values().stream().anyMatch(member -> member.seat == seat);
    }

    /** 입장·준비를 막아야 하는 시작 중이거나 진행 중인 게임이 있는지. */
    boolean playing() {
        return starting != null || gameInProgress();
    }

    /** 입찰·단계 전환·이탈 처리가 필요한 게임이 있는지. */
    boolean gameInProgress() {
        return game != null && game.inProgress();
    }

    UUID host() {
        return members.isEmpty() ? null : members.keySet().iterator().next();
    }

    RoomResponse snapshot() {
        return new RoomResponse(id, name, host(), RoomService.MAX_PLAYERS, version,
                members.values().stream().map(member -> new RoomMemberResponse(member.actor.userId(),
                        member.actor.nickname(), member.actor.avatarCode(), member.seat, member.ready,
                        member.disconnectedAt == null)).toList(), List.copyOf(chats),
                game == null ? null : game.snapshot(), starting != null);
    }

    static final class Member {
        RoomActor actor;
        final int seat;
        boolean ready;
        Instant disconnectedAt;
        Instant lastChatAt;
        Instant nextEmoteAt;
        Member(RoomActor actor, int seat) { this.actor = actor; this.seat = seat; }
    }
}
