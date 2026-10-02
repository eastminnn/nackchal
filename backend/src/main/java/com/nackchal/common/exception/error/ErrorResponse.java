package com.nackchal.common.exception.error;

import java.util.List;
import org.springframework.http.HttpStatusCode;

/**
 * 공통 오류 응답. 입력 검증 오류가 없으면 errors는 빈 배열이다
 */
public record ErrorResponse(int status, String code, String message, List<ValidationError> errors) {

    public ErrorResponse {
        errors = List.copyOf(errors);
    }

    public static ErrorResponse of(ErrorCode errorCode) {
        return of(errorCode, List.of());
    }

    public static ErrorResponse of(ErrorCode errorCode, List<ValidationError> errors) {
        return new ErrorResponse(errorCode.status().value(), errorCode.code(), errorCode.message(), errors);
    }

    public static ErrorResponse of(HttpStatusCode status) {
        // 별도 오류 코드가 없는 HTTP 상태도 원래 상태값을 유지한다.
        ErrorCode errorCode = ErrorCode.forStatus(status);
        return new ErrorResponse(status.value(), errorCode.code(), errorCode.message(), List.of());
    }
}
