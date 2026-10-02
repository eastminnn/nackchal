package com.nackchal.common.exception.error;

/**
 * 검증에 실패한 필드와 안내 문구. 비밀번호 등 사용자가 입력한 값은 담지 않는다
 */
public record ValidationError(String field, String message) {
}
