package com.nackchal.common.security.event;

import java.time.Instant;
import java.util.UUID;

/** 로그인이나 토큰 갱신으로 새 액세스 토큰이 발급됐음을 알리는 이벤트. 열린 실시간 연결의 인증 만료 시각을 늘린다. */
public record AccessTokenRenewedEvent(UUID userId, Instant expiresAt) {
}
