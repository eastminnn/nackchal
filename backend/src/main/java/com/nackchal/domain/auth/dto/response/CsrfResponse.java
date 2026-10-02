package com.nackchal.domain.auth.dto.response;

/**
 * 쓰기 요청에 보낼 CSRF 헤더 이름과 토큰
 */
public record CsrfResponse(String headerName, String token) {
}
