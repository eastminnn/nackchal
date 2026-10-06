package com.nackchal.common.exception.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;

/**
 * 클라이언트에 전달할 HTTP 상태, 오류 코드, 안내 문구
 */
public enum ErrorCode {

    // 요청 오류
    INVALID_INPUT_VALUE(HttpStatus.BAD_REQUEST, "INVALID_INPUT_VALUE", "입력한 내용을 확인해 주세요."),
    INVALID_REQUEST_BODY(HttpStatus.BAD_REQUEST, "INVALID_REQUEST_BODY", "요청 본문을 읽을 수 없어요."),
    MISSING_REQUEST_PARAMETER(HttpStatus.BAD_REQUEST, "MISSING_REQUEST_PARAMETER", "필수 요청값이 누락됐어요."),
    INVALID_PARAMETER_TYPE(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER_TYPE", "요청값 형식을 확인해 주세요."),
    RESOURCE_NOT_FOUND(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "요청한 리소스를 찾을 수 없어요."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "지원하지 않는 요청 방식이에요."),
    NOT_ACCEPTABLE(HttpStatus.NOT_ACCEPTABLE, "NOT_ACCEPTABLE", "요청한 응답 형식을 지원하지 않아요."),
    CONFLICT(HttpStatus.CONFLICT, "CONFLICT", "현재 상태에서는 요청을 처리할 수 없어요."),
    REQUEST_TOO_LARGE(HttpStatus.CONTENT_TOO_LARGE, "REQUEST_TOO_LARGE", "요청 크기가 너무 커요."),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "지원하지 않는 본문 형식이에요."),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "시도가 너무 많아요. 잠시 후 다시 해 주세요."),
    HTTP_ERROR(HttpStatus.BAD_REQUEST, "HTTP_ERROR", "요청을 처리할 수 없어요."),

    // 인증 및 인가 오류
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "로그인이 필요해요."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "이메일이나 비밀번호를 확인해 주세요."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "FORBIDDEN", "요청 권한을 확인하지 못했어요."),

    // 회원가입
    EMAIL_UNAVAILABLE(HttpStatus.CONFLICT, "EMAIL_UNAVAILABLE", "이미 사용 중인 이메일이에요."),

    // 방 참가와 연결
    ROOM_NOT_FOUND(HttpStatus.NOT_FOUND, "ROOM_NOT_FOUND", "이미 종료된 방이에요."),
    ROOM_FULL(HttpStatus.CONFLICT, "ROOM_FULL", "방이 가득 찼어요. 최대 4명까지 참가할 수 있어요."),
    ROOM_ALREADY_JOINED(HttpStatus.CONFLICT, "ROOM_ALREADY_JOINED", "참가 중인 방에서 나온 뒤 입장해 주세요."),
    ROOM_CONNECTION_CONFLICT(HttpStatus.CONFLICT, "ROOM_CONNECTION_CONFLICT", "이미 다른 탭에서 참가 중이에요. 기존 탭에서 나간 뒤 입장해 주세요."),
    ROOM_NOT_JOINED(HttpStatus.FORBIDDEN, "ROOM_NOT_JOINED", "참가 중인 방에서만 할 수 있어요."),
    ROOM_SERVER_FULL(HttpStatus.SERVICE_UNAVAILABLE, "ROOM_SERVER_FULL", "지금은 방을 더 만들 수 없어요. 잠시 후 다시 시도해 주세요."),
    INVALID_CHAT(HttpStatus.BAD_REQUEST, "INVALID_CHAT", "채팅은 1~100자로 입력해 주세요."),
    CHAT_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "CHAT_RATE_LIMITED", "채팅은 1초에 한 번씩 보낼 수 있어요."),

    // 서버 오류
    INTERNAL_SERVER_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요."),
    SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "잠시 요청을 처리할 수 없어요. 다시 시도해 주세요.");

    private final HttpStatus status;
    private final String code;
    private final String message;

    ErrorCode(HttpStatus status, String code, String message) {
        this.status = status;
        this.code = code;
        this.message = message;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public String message() {
        return message;
    }

    // Spring 또는 서블릿에서 상태 코드만 전달된 경우의 기본 오류
    public static ErrorCode forStatus(HttpStatusCode status) {
        return switch (status.value()) {
            case 400 -> INVALID_INPUT_VALUE;
            case 401 -> UNAUTHORIZED;
            case 403 -> FORBIDDEN;
            case 404 -> RESOURCE_NOT_FOUND;
            case 405 -> METHOD_NOT_ALLOWED;
            case 406 -> NOT_ACCEPTABLE;
            case 409 -> CONFLICT;
            case 413 -> REQUEST_TOO_LARGE;
            case 415 -> UNSUPPORTED_MEDIA_TYPE;
            case 429 -> RATE_LIMITED;
            case 503 -> SERVICE_UNAVAILABLE;
            default -> status.is5xxServerError() ? INTERNAL_SERVER_ERROR : HTTP_ERROR;
        };
    }
}
