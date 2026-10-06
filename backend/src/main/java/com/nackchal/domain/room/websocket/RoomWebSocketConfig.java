package com.nackchal.domain.room.websocket;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/** /api/rooms/ws 엔드포인트에 핸들러와 인증 인터셉터를 등록하고 연결 정리 스케줄러를 켠다. */
@Configuration
@EnableWebSocket
@EnableScheduling
@EnableConfigurationProperties(RoomSocketProperties.class)
public class RoomWebSocketConfig implements WebSocketConfigurer {

    private final RoomWebSocketHandler handler;
    private final RoomHandshakeInterceptor interceptor;
    private final RoomSocketProperties properties;

    public RoomWebSocketConfig(
            RoomWebSocketHandler handler, RoomHandshakeInterceptor interceptor, RoomSocketProperties properties
    ) {
        this.handler = handler;
        this.interceptor = interceptor;
        this.properties = properties;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/api/rooms/ws")
                .addInterceptors(interceptor)
                .setAllowedOrigins(properties.allowedOrigins().toArray(String[]::new));
    }
}
