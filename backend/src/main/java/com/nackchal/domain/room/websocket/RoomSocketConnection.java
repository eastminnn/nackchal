package com.nackchal.domain.room.websocket;

import com.nackchal.domain.room.model.RoomActor;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.socket.WebSocketSession;

/** WebSocket 연결 하나의 상태. 사용자, 인증 만료 시각, 요청 빈도, 처리한 요청의 응답을 보관한다. */
final class RoomSocketConnection {
    final WebSocketSession session;
    /** 캐릭터를 바꾸면 같은 연결 ID로 새 값이 들어온다. */
    volatile RoomActor actor;
    volatile Instant expiresAt;
    final Map<UUID, Reply> replies = new LinkedHashMap<>();
    volatile Instant lastSeen;
    Instant rateWindow;
    int requestCount;

    RoomSocketConnection(WebSocketSession session, RoomActor actor, Instant expiresAt, Instant now) {
        this.session = session;
        this.actor = actor;
        this.expiresAt = expiresAt;
        this.lastSeen = now;
        this.rateWindow = now;
    }

    void remember(UUID requestId, String request, Object response) {
        replies.put(requestId, new Reply(request, response));
        if (replies.size() > 100) replies.remove(replies.keySet().iterator().next());
    }

    record Reply(String request, Object response) {
    }
}
