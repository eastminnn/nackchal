package com.nackchal.domain.room.websocket;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** WebSocket 연결을 허용할 브라우저 Origin 목록(app.rooms.allowed-origins). */
@ConfigurationProperties("app.rooms")
public record RoomSocketProperties(List<String> allowedOrigins) {
    public RoomSocketProperties {
        allowedOrigins = List.copyOf(allowedOrigins);
        if (allowedOrigins.isEmpty() || allowedOrigins.stream().anyMatch(value -> value.contains("*"))) {
            throw new IllegalArgumentException("WebSocket 출처는 와일드카드 없이 지정해야 합니다.");
        }
    }
}
