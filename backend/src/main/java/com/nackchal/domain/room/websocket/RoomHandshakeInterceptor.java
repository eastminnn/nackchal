package com.nackchal.domain.room.websocket;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.security.jwt.JwtTokenProvider;
import com.nackchal.common.security.service.AuthCookieService;
import com.nackchal.domain.auth.service.AuthService;
import jakarta.servlet.http.Cookie;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.WebUtils;

/**
 * 쿠키 JWT와 요청 출처를 검사하고 서버에서 읽은 사용자 정보를 연결에 부여한다
 */
@Component
public class RoomHandshakeInterceptor implements HandshakeInterceptor {

    private final JwtTokenProvider jwtTokenProvider;
    private final AuthService authService;
    private final RoomSocketProperties properties;

    public RoomHandshakeInterceptor(
            JwtTokenProvider jwtTokenProvider, AuthService authService, RoomSocketProperties properties
    ) {
        this.jwtTokenProvider = jwtTokenProvider;
        this.authService = authService;
        this.properties = properties;
    }

    /** Origin 허용 목록과 access 쿠키를 확인하고, 사용자 프로필과 토큰 만료 시각을 연결 속성에 넣는다. */
    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler handler,
            Map<String, Object> attributes
    ) {
        // 브라우저의 WebSocket에는 쿠키가 자동으로 붙으므로 Origin이 없거나 다르면 거절한다.
        String origin = request.getHeaders().getOrigin();
        if (origin == null || !properties.allowedOrigins().contains(origin)) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }
        if (!(request instanceof ServletServerHttpRequest servlet)) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        Cookie cookie = WebUtils.getCookie(servlet.getServletRequest(), AuthCookieService.ACCESS_COOKIE);
        if (cookie == null) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
        try {
            UUID userId = jwtTokenProvider.verify(cookie.getValue());
            attributes.put("user", authService.getMe(userId));
            attributes.put("expiresAt", jwtTokenProvider.expiresAt(cookie.getValue()));
            return true;
        } catch (JwtException | CustomException exception) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED);
            return false;
        }
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler handler, Exception exception
    ) {
    }
}
