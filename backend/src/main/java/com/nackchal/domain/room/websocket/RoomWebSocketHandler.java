package com.nackchal.domain.room.websocket;

import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/** WebSocket 연결·메시지·종료 이벤트를 RoomConnections와 RoomCommandRouter로 넘긴다. */
@Component
public class RoomWebSocketHandler extends TextWebSocketHandler {

    private final RoomConnections connections;
    private final RoomCommandRouter router;

    public RoomWebSocketHandler(RoomConnections connections, RoomCommandRouter router) {
        this.connections = connections;
        this.router = router;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        session.setTextMessageSizeLimit(4096);
        connections.open(session);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        RoomSocketConnection connection = connections.authenticated(session.getId());
        if (connection != null) router.route(connection, message.getPayload());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        connections.closed(session.getId());
    }
}
