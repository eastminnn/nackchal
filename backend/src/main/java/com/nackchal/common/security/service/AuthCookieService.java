package com.nackchal.common.security.service;

import com.nackchal.common.security.config.AuthProperties;
import com.nackchal.domain.auth.service.AuthTokens;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Clock;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

/**
 * 브라우저 인증 쿠키 발급과 삭제. 토큰은 JavaScript에서 읽을 수 없다
 */
@Service
public class AuthCookieService {

    public static final String ACCESS_COOKIE = "NACKCHAL_ACCESS";
    public static final String REFRESH_COOKIE = "NACKCHAL_REFRESH";

    private final AuthProperties properties;
    private final Clock clock;

    public AuthCookieService(AuthProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
    }

    public void write(HttpServletResponse response, AuthTokens tokens) {
        add(response, ACCESS_COOKIE, tokens.accessToken(), "/api", properties.accessTtl());
        Duration remaining = Duration.between(clock.instant(), tokens.refreshExpiresAt());
        add(response, REFRESH_COOKIE, tokens.refreshToken(), "/api/auth", remaining);
        // 세션 인증을 사용하던 브라우저에 남은 쿠키도 제거한다.
        add(response, "NACKCHAL_SESSION", "", "/", Duration.ZERO);
    }

    public void clear(HttpServletResponse response) {
        add(response, ACCESS_COOKIE, "", "/api", Duration.ZERO);
        add(response, REFRESH_COOKIE, "", "/api/auth", Duration.ZERO);
    }

    private void add(HttpServletResponse response, String name, String value, String path, Duration maxAge) {
        ResponseCookie cookie = ResponseCookie.from(name, value)
                .httpOnly(true)
                .secure(properties.cookieSecure())
                .sameSite("Lax")
                .path(path)
                .maxAge(maxAge)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
