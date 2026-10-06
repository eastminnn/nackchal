package com.nackchal.domain.room.websocket;

import com.nackchal.common.security.event.AccessTokenRenewedEvent;
import com.nackchal.common.security.event.UserLoggedOutEvent;
import com.nackchal.domain.room.model.RoomActor;
import com.nackchal.domain.room.model.RoomChangedEvent;
import com.nackchal.domain.room.service.RoomService;
import com.nackchal.domain.user.dto.response.UserResponse;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import tools.jackson.databind.ObjectMapper;

/**
 * 연결별 전송과 인증 수명을 관리한다. 방 상태는 실제 참가 연결에만 보낸다
 */
@Component
public class RoomConnections {

    private static final Logger log = LoggerFactory.getLogger(RoomConnections.class);
    private final Map<String, RoomSocketConnection> connections = new ConcurrentHashMap<>();
    private final AtomicLong listVersion = new AtomicLong();
    private final RoomService roomService;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public RoomConnections(RoomService roomService, ObjectMapper objectMapper, Clock clock) {
        this.roomService = roomService;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    /** 인증된 새 연결을 등록하고 WELCOME(참가 중인 방 코드, 인증 만료 시각 포함)과 방 목록을 보낸다. */
    void open(WebSocketSession session) throws IOException {
        if (connections.size() >= 2000) {
            session.close(CloseStatus.SERVICE_OVERLOAD);
            return;
        }
        UserResponse user = (UserResponse) session.getAttributes().get("user");
        Instant expiresAt = (Instant) session.getAttributes().get("expiresAt");
        RoomActor actor = new RoomActor(user.id(), session.getId(), user.nickname(), user.avatarCode());
        RoomSocketConnection connection = new RoomSocketConnection(
                new ConcurrentWebSocketSessionDecorator(session, 1000, 64 * 1024), actor, expiresAt, clock.instant());
        connections.put(session.getId(), connection);
        Map<String, Object> welcome = new LinkedHashMap<>();
        welcome.put("type", "WELCOME");
        welcome.put("connectionId", session.getId());
        welcome.put("activeRoomId", roomService.roomId(user.id()).orElse(null));
        welcome.put("authExpiresAt", expiresAt.toEpochMilli());
        send(connection, welcome);
        send(connection, roomList());
    }

    /** 메시지를 처리할 연결을 찾는다. 인증이 만료됐으면 4401로 닫고 null. */
    RoomSocketConnection authenticated(String connectionId) {
        RoomSocketConnection connection = connections.get(connectionId);
        if (connection != null && !clock.instant().isBefore(connection.expiresAt)) {
            close(connection, new CloseStatus(4401, "Authentication expired"));
            return null;
        }
        return connection;
    }

    /** 연결 목록에서 제거하고 방 자리는 재접속 대기로 바꾼다. */
    void closed(String connectionId) {
        RoomSocketConnection connection = connections.remove(connectionId);
        if (connection != null) roomService.disconnect(connection.actor);
    }

    /** 이벤트를 JSON으로 보낸다. 전송에 실패하면 연결을 닫는다. */
    void send(RoomSocketConnection connection, Object event) {
        if (!connection.session.isOpen()) {
            closed(connection.session.getId());
            return;
        }
        try {
            connection.session.sendMessage(new TextMessage(objectMapper.writeValueAsString(event)));
        } catch (IOException exception) {
            close(connection, CloseStatus.GOING_AWAY);
        }
    }

    /** 방이 바뀌면 모든 연결에 목록을, 그 방 참가 연결에는 방 전체 상태를 보낸다. */
    @EventListener
    public void roomChanged(RoomChangedEvent event) {
        Object listing = roomList();
        connections.values().forEach(connection -> {
            send(connection, listing);
            if (roomService.roomId(connection.actor).filter(event.roomId()::equals).isPresent()) {
                roomService.find(event.roomId()).ifPresent(room ->
                        send(connection, Map.of("type", "ROOM_STATE", "room", room)));
            }
        });
    }

    /** 로그아웃한 사용자를 방에서 빼고 열린 연결을 모두 4403으로 닫는다. */
    @EventListener
    public void userLoggedOut(UserLoggedOutEvent event) {
        roomService.removeUser(event.userId());
        connections.values().stream().filter(connection -> connection.actor.userId().equals(event.userId()))
                .forEach(connection -> close(connection, new CloseStatus(4403, "Logged out")));
    }

    /**
     * 같은 사용자의 열린 연결이 새 액세스 토큰의 만료 시각까지 유지되게 하고 AUTH_RENEWED로 알린다.
     * 클라이언트는 이 시각을 보고 다음 갱신을 예약한다. 만료 시각을 앞당기지는 않는다.
     */
    @EventListener
    public void accessTokenRenewed(AccessTokenRenewedEvent event) {
        connections.values().stream().filter(connection -> connection.actor.userId().equals(event.userId()))
                .filter(connection -> !event.expiresAt().isBefore(connection.expiresAt))
                .forEach(connection -> {
                    connection.expiresAt = event.expiresAt();
                    send(connection, Map.of("type", "AUTH_RENEWED", "expiresAt", event.expiresAt().toEpochMilli()));
                });
    }

    /** 1초마다 인증 만료(4401)·응답 없는 연결(35초)을 닫고 재접속 유예가 끝난 자리를 정리한다. */
    @Scheduled(fixedDelay = 1000)
    public void maintain() {
        Instant now = clock.instant();
        connections.values().forEach(connection -> {
            if (!now.isBefore(connection.expiresAt)) {
                close(connection, new CloseStatus(4401, "Authentication expired"));
            } else if (now.isAfter(connection.lastSeen.plusSeconds(35))) {
                close(connection, CloseStatus.GOING_AWAY);
            }
        });
        roomService.expireDisconnected();
    }

    /** 증가하는 version을 붙인 방 목록 이벤트. 클라이언트는 오래된 목록을 무시한다. */
    private Object roomList() {
        return Map.of("type", "ROOM_LIST", "version", listVersion.incrementAndGet(), "rooms", roomService.list());
    }

    private void close(RoomSocketConnection connection, CloseStatus status) {
        closed(connection.session.getId());
        try {
            connection.session.close(status);
        } catch (IOException exception) {
            log.debug("WebSocket already disconnected", exception);
        }
    }
}
