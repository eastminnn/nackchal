package com.nackchal.common.exception;

import com.nackchal.common.exception.error.ErrorCode;
import java.util.Objects;

/**
 * 서비스에서 발생한 업무 오류를 공통 오류 코드로 전달하는 예외
 */
public class CustomException extends RuntimeException {

    private final ErrorCode errorCode;

    public CustomException(ErrorCode errorCode) {
        super(Objects.requireNonNull(errorCode, "errorCode must not be null").message());
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
