package com.nackchal.common.security.config;

import jakarta.validation.constraints.NotBlank;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * JWT 서명 키, 토큰 만료 시간, 인증 쿠키 설정
 */
@Validated
@ConfigurationProperties("app.auth")
public record AuthProperties(
        @NotBlank String jwtSecret,
        @NotBlank String issuer,
        Duration accessTtl,
        Duration refreshTtl,
        boolean cookieSecure
) {
    public AuthProperties {
        if (accessTtl == null || accessTtl.isNegative() || accessTtl.isZero()
                || refreshTtl == null || refreshTtl.compareTo(accessTtl) <= 0) {
            throw new IllegalArgumentException("토큰 만료 시간은 양수이며 refreshTtl이 accessTtl보다 길어야 합니다.");
        }
    }
}
