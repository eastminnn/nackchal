package com.nackchal.domain.auth.service;

import java.time.Instant;

/**
 * 쿠키로 전달할 인증 토큰 쌍. API 응답 본문에는 포함하지 않는다
 */
public record AuthTokens(String accessToken, String refreshToken, Instant refreshExpiresAt) {
}
