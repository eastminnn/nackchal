package com.nackchal.domain.auth.service;

import java.time.Instant;
import java.util.UUID;

/**
 * 쿠키로 전달할 인증 토큰 쌍. API 응답 본문에는 포함하지 않는다
 */
public record AuthTokens(
        UUID userId,
        String accessToken,
        Instant accessExpiresAt,
        String refreshToken,
        Instant refreshExpiresAt
) {
}
