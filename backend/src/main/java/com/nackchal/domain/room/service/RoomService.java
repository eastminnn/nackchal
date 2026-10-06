package com.nackchal.domain.room.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.auction.model.AuctionGame;
import com.nackchal.domain.room.dto.response.RoomChatResponse;
import com.nackchal.domain.room.dto.response.RoomResponse;
import com.nackchal.domain.room.dto.response.RoomSummaryResponse;
import com.nackchal.domain.room.model.RoomActor;
import com.nackchal.domain.room.model.RoomChangedEvent;
import com.nackchal.domain.room.service.WaitingRoom.Member;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** 사용자별 입장과 방별 변경을 직렬화하는 메모리 대기실 저장소. */
@Service
public class RoomService {
    public static final int MIN_PLAYERS = 2;
    public static final int MAX_PLAYERS = 4;
    private static final int MAX_ROOMS = 1000;
    private static final Duration RECONNECT_GRACE = Duration.ofSeconds(30);
    private static final String CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private final ConcurrentHashMap<String, WaitingRoom> rooms = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, WaitingRoom> memberships = new ConcurrentHashMap<>();
    private final Object[] userLocks = new Object[256];
    private final AtomicInteger roomCount = new AtomicInteger();
    private final SecureRandom random = new SecureRandom();
    private final Clock clock;
    private final ApplicationEventPublisher events;

    public RoomService(Clock clock, ApplicationEventPublisher events) {
        this.clock = clock;
        this.events = events;
        for (int i = 0; i < userLocks.length; i++) userLocks[i] = new Object();
    }

    /** 로비에 보여줄 방 목록. 빈 방은 제외하고 코드 순으로 정렬한다. 게임 중인 방은 playing이다. */
    public List<RoomSummaryResponse> list() {
        return rooms.values().stream().map(room -> {
            synchronized (room) {
                return new RoomSummaryResponse(room.id, room.name, room.members.size(), MAX_PLAYERS,
                        room.playing() ? "playing" : room.members.size() == MAX_PLAYERS ? "full" : "waiting",
                        room.host());
            }
        }).filter(room -> room.players() > 0).sorted(Comparator.comparing(RoomSummaryResponse::id)).toList();
    }

    /** 방 전체 상태 조회. 없거나 빈 방이면 empty. */
    public Optional<RoomResponse> find(String roomId) {
        WaitingRoom room = rooms.get(roomId);
        if (room == null) return Optional.empty();
        synchronized (room) {
            return room.members.isEmpty() ? Optional.empty() : Optional.of(room.snapshot());
        }
    }

    /** 사용자가 속한 방 코드. 재접속 대기 중인 자리도 포함한다. */
    public Optional<String> roomId(UUID userId) {
        WaitingRoom room = memberships.get(userId);
        return room == null ? Optional.empty() : Optional.of(room.id);
    }

    /** 이 연결이 현재 활성 참가 중인 방 코드. 다른 탭이나 끊긴 연결이면 empty. */
    public Optional<String> roomId(RoomActor actor) {
        return forUser(actor.userId(), () -> {
            WaitingRoom room = memberships.get(actor.userId());
            if (room == null) return Optional.empty();
            synchronized (room) {
                return active(room.members.get(actor.userId()), actor) ? Optional.of(room.id) : Optional.empty();
            }
        });
    }

    /**
     * 새 방을 만들고 만든 사람을 0번 좌석(방장)으로 입장시킨다.
     * @throws CustomException ROOM_ALREADY_JOINED, ROOM_SERVER_FULL
     */
    public RoomResponse create(RoomActor actor) {
        expireDisconnected();
        List<String> changed = new ArrayList<>();
        RoomResponse response = forUser(actor.userId(), () -> {
            if (memberships.containsKey(actor.userId())) throw error(ErrorCode.ROOM_ALREADY_JOINED);
            if (roomCount.incrementAndGet() > MAX_ROOMS) {
                roomCount.decrementAndGet();
                throw error(ErrorCode.ROOM_SERVER_FULL);
            }
            while (true) {
                WaitingRoom room = new WaitingRoom(code(), actor.nickname() + "의 경매장");
                synchronized (room) {
                    room.members.put(actor.userId(), new Member(actor, 0));
                    if (rooms.putIfAbsent(room.id, room) != null) continue;
                    memberships.put(actor.userId(), room);
                    changed.add(room.id);
                    return room.snapshot();
                }
            }
        });
        publish(changed);
        return response;
    }

    /**
     * 방에 입장한다. 같은 연결의 재입장은 현재 상태만 돌려주고, 재접속 대기 중인 자리는 새 연결로 복귀시킨다.
     * 새 참가자는 비어 있는 가장 앞 좌석을 받는다.
     * 게임이 진행 중이면 새 참가자는 받지 않고 재접속만 허용한다.
     * @throws CustomException ROOM_ALREADY_JOINED, ROOM_NOT_FOUND, ROOM_CONNECTION_CONFLICT, ROOM_IN_GAME, ROOM_FULL
     */
    public RoomResponse join(RoomActor actor, String roomId) {
        expireDisconnected();
        List<String> changed = new ArrayList<>();
        RoomResponse response = forUser(actor.userId(), () -> {
            WaitingRoom previous = memberships.get(actor.userId());
            if (previous != null && !previous.id.equals(roomId)) throw error(ErrorCode.ROOM_ALREADY_JOINED);
            WaitingRoom room = rooms.get(roomId);
            if (room == null) throw error(ErrorCode.ROOM_NOT_FOUND);
            synchronized (room) {
                if (rooms.get(roomId) != room) throw error(ErrorCode.ROOM_NOT_FOUND);
                Member member = room.members.get(actor.userId());
                if (member != null) {
                    if (member.disconnectedAt == null) {
                        if (!active(member, actor)) throw error(ErrorCode.ROOM_CONNECTION_CONFLICT);
                        return room.snapshot();
                    }
                    member.actor = actor;
                    member.disconnectedAt = null;
                } else {
                    if (room.playing()) throw error(ErrorCode.ROOM_IN_GAME);
                    if (room.members.size() >= MAX_PLAYERS) throw error(ErrorCode.ROOM_FULL);
                    int seat = 0;
                    while (room.occupied(seat)) seat++;
                    room.members.put(actor.userId(), new Member(actor, seat));
                    memberships.put(actor.userId(), room);
                }
                room.version++;
                changed.add(room.id);
                return room.snapshot();
            }
        });
        publish(changed);
        return response;
    }

    /**
     * 즉시 퇴장. 유예 없이 자리를 비우고, 빈 방이면 삭제한다.
     * @throws CustomException ROOM_NOT_JOINED
     */
    public void leave(RoomActor actor) {
        mutate(actor, false, (room, member) -> remove(room, actor.userId()));
    }

    /**
     * 준비 상태 변경. 값이 같으면 version을 올리지 않는다. 게임 중에는 바꿀 수 없다.
     * @throws CustomException ROOM_NOT_JOINED, GAME_ALREADY_STARTED
     */
    public RoomResponse ready(RoomActor actor, boolean ready) {
        return mutate(actor, false, (room, member) -> {
            if (room.playing()) throw error(ErrorCode.GAME_ALREADY_STARTED);
            if (member.ready == ready) return false;
            member.ready = ready;
            return true;
        });
    }

    /**
     * 채팅 추가. 앞뒤 공백 제거 후 1~100자, 사용자별 1초 간격이며 최근 30개만 보관한다.
     * @throws CustomException ROOM_NOT_JOINED, INVALID_CHAT, CHAT_RATE_LIMITED
     */
    public RoomResponse chat(RoomActor actor, String body) {
        return mutate(actor, false, (room, member) -> {
            if (body == null) throw error(ErrorCode.INVALID_CHAT);
            String text = body.strip();
            if (text.isEmpty() || text.codePointCount(0, text.length()) > 100) {
                throw error(ErrorCode.INVALID_CHAT);
            }
            Instant now = clock.instant();
            if (member.lastChatAt != null && now.isBefore(member.lastChatAt.plusSeconds(1))) {
                throw error(ErrorCode.CHAT_RATE_LIMITED);
            }
            member.lastChatAt = now;
            room.chats.add(new RoomChatResponse(++room.chatSequence, actor.userId(), member.actor.nickname(),
                    text, now.toEpochMilli()));
            if (room.chats.size() > 30) room.chats.removeFirst();
            return true;
        });
    }

    /**
     * 방장이 게임을 시작한다. 연결된 참가자가 2명 이상이고 방장을 뺀 전원이 준비해야 한다.
     * 재접속 대기 중인 참가자는 준비가 해제돼 있으므로 시작을 막는다.
     * @throws CustomException ROOM_NOT_JOINED, GAME_NOT_HOST, GAME_ALREADY_STARTED, GAME_NOT_ENOUGH_PLAYERS,
     *                         GAME_PLAYERS_NOT_READY
     */
    public RoomResponse startGame(RoomActor actor) {
        return mutate(actor, false, (room, member) -> {
            if (!actor.userId().equals(room.host())) throw error(ErrorCode.GAME_NOT_HOST);
            if (room.playing()) throw error(ErrorCode.GAME_ALREADY_STARTED);
            long connected = room.members.values().stream().filter(other -> other.disconnectedAt == null).count();
            if (connected < MIN_PLAYERS) throw error(ErrorCode.GAME_NOT_ENOUGH_PLAYERS);
            boolean othersReady = room.members.entrySet().stream()
                    .filter(entry -> !entry.getKey().equals(actor.userId()))
                    .allMatch(entry -> entry.getValue().ready);
            if (!othersReady) throw error(ErrorCode.GAME_PLAYERS_NOT_READY);
            room.game = AuctionGame.start(room.members.keySet(), clock.instant(), random);
            return true;
        });
    }

    /**
     * 입찰. 같은 방의 다른 명령·단계 전환과 같은 방 잠금 안에서 처리하므로 먼저 잠금을 얻은 입찰이 이긴다.
     * 판정 시각은 클라이언트 시각이 아니라 잠금을 얻은 서버 시각이다.
     * @throws CustomException ROOM_NOT_JOINED, GAME_NOT_FOUND
     * @throws com.nackchal.domain.auction.model.BidRejectedException 입찰 규칙 위반 (현재 경매 상태 포함)
     */
    public RoomResponse placeBid(RoomActor actor, UUID gameId, int round, long expectedBidVersion, int amount) {
        return mutate(actor, false, (room, member) -> {
            if (room.game == null) throw error(ErrorCode.GAME_NOT_FOUND);
            room.game.bid(actor.userId(), gameId, round, expectedBidVersion, amount, clock.instant());
            return true;
        });
    }

    /**
     * 마감 시각이 지난 게임 단계를 넘긴다. 100ms마다 실행한다. 마감을 예약하지 않고 매번 현재 마감 시각과
     * 비교하므로, 마감이 연장돼도 오래된 예약이 라운드를 두 번 마감하는 일이 없다.
     */
    @Scheduled(fixedDelay = 100)
    public void advanceGames() {
        Instant now = clock.instant();
        List<String> changed = new ArrayList<>();
        rooms.values().forEach(room -> {
            synchronized (room) {
                if (room.playing() && room.game.advance(now)) {
                    if (!room.game.inProgress()) resetReady(room);
                    room.version++;
                    changed.add(room.id);
                }
            }
        });
        publish(changed);
    }

    /** 연결 종료 처리. 자리는 30초 동안 남기고 준비는 해제한다. 이미 교체된 연결이면 무시한다. */
    public void disconnect(RoomActor actor) {
        mutate(actor, true, (room, member) -> {
            member.ready = false;
            member.disconnectedAt = clock.instant();
            return true;
        });
    }

    /** 로그아웃한 사용자를 연결과 관계없이 방에서 즉시 제거한다. */
    public void removeUser(UUID userId) {
        List<String> changed = new ArrayList<>();
        forUser(userId, () -> {
            WaitingRoom room = memberships.get(userId);
            if (room != null) synchronized (room) {
                remove(room, userId);
                room.version++;
                changed.add(room.id);
            }
            return null;
        });
        publish(changed);
    }

    /** 재접속 유예(30초)가 지난 참가자를 제거한다. 1초마다 스케줄러가 호출한다. */
    public void expireDisconnected() {
        List<String> changed = new ArrayList<>();
        memberships.forEach((userId, ignored) -> forUser(userId, () -> {
            WaitingRoom room = memberships.get(userId);
            if (room != null) synchronized (room) {
                Member member = room.members.get(userId);
                if (member.disconnectedAt != null
                        && !clock.instant().isBefore(member.disconnectedAt.plus(RECONNECT_GRACE))) {
                    remove(room, userId);
                    room.version++;
                    changed.add(room.id);
                }
            }
            return null;
        }));
        publish(changed);
    }

    /** 사용자 잠금 → 방 잠금 순으로 잡고 활성 참가자인지 확인한 뒤 변경한다. 변경되면 version을 올리고 이벤트를 발행한다. */
    private RoomResponse mutate(RoomActor actor, boolean ignoreStale, Mutation mutation) {
        List<String> changed = new ArrayList<>();
        RoomResponse response = forUser(actor.userId(), () -> {
            WaitingRoom room = memberships.get(actor.userId());
            if (room == null) {
                if (ignoreStale) return null;
                throw error(ErrorCode.ROOM_NOT_JOINED);
            }
            synchronized (room) {
                Member member = room.members.get(actor.userId());
                if (!active(member, actor)) {
                    if (ignoreStale) return null;
                    throw error(ErrorCode.ROOM_NOT_JOINED);
                }
                if (mutation.apply(room, member)) {
                    room.version++;
                    changed.add(room.id);
                }
                return room.snapshot();
            }
        });
        // 동기 이벤트 구독자가 다른 방을 조회하더라도 잠금 순환이 생기지 않도록 밖에서 발행한다.
        publish(changed);
        return response;
    }

    /**
     * 참가자를 제거한다. 방장은 따로 저장하지 않아 남은 참가자 중 가장 먼저 들어온 사람이 자동으로 이어받는다.
     * 게임 중이면 이탈로 기록하고, 그 때문에 게임이 중단되면 남은 참가자의 준비를 해제한다.
     */
    private boolean remove(WaitingRoom room, UUID userId) {
        if (room.playing() && room.game.leave(userId) && !room.game.inProgress()) resetReady(room);
        room.members.remove(userId);
        memberships.remove(userId, room);
        if (room.members.isEmpty() && rooms.remove(room.id, room)) roomCount.decrementAndGet();
        return true;
    }

    /** 게임이 끝나면 다음 판을 위해 모두 다시 준비하게 한다. */
    private static void resetReady(WaitingRoom room) {
        room.members.values().forEach(member -> member.ready = false);
    }

    /** 같은 사용자의 요청을 순서대로 처리한다. 잠금 256개를 해시로 나눠 사용자마다 객체를 만들지 않는다. */
    private <T> T forUser(UUID userId, Supplier<T> action) {
        synchronized (userLocks[(userId.hashCode() & Integer.MAX_VALUE) % userLocks.length]) {
            return action.get();
        }
    }

    private void publish(List<String> changed) {
        changed.stream().distinct().forEach(id -> events.publishEvent(new RoomChangedEvent(id)));
    }

    /** 끊기지 않았고 자리를 차지한 연결과 같은 연결인지. 다른 탭이나 이전 연결의 요청을 막는다. */
    private static boolean active(Member member, RoomActor actor) {
        return member != null && member.disconnectedAt == null
                && member.actor.connectionId().equals(actor.connectionId());
    }

    /** 6자리 대문자·숫자 방 코드. 충돌하면 create에서 다시 만든다. */
    private String code() {
        StringBuilder code = new StringBuilder(6);
        for (int i = 0; i < 6; i++) code.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
        return code.toString();
    }

    private static CustomException error(ErrorCode code) { return new CustomException(code); }

    @FunctionalInterface
    private interface Mutation { boolean apply(WaitingRoom room, Member member); }

}
