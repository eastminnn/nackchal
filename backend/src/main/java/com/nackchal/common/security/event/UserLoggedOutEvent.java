package com.nackchal.common.security.event;

import java.util.UUID;

/** 로그아웃이 완료된 사용자의 실시간 연결을 정리하기 위한 이벤트. */
public record UserLoggedOutEvent(UUID userId) {
}
