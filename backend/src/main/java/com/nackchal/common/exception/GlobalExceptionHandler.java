package com.nackchal.common.exception;

import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.common.exception.error.ErrorResponse;
import com.nackchal.common.exception.error.ValidationError;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import java.util.List;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.ParameterValidationResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * 컨트롤러 예외를 공통 JSON 오류 응답으로 변환. 서버 오류만 error 로그를 남긴다
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static final String REQUIRED_MESSAGE = "필수 값이에요.";
    private static final String TYPE_MISMATCH_MESSAGE = "형식을 확인해 주세요.";

    @ExceptionHandler(CustomException.class)
    public ResponseEntity<ErrorResponse> handleCustomException(CustomException exception) {
        ErrorCode errorCode = exception.getErrorCode();
        if (errorCode.status().is5xxServerError()) {
            log.error("Request failed", exception);
        }
        return response(errorCode, List.of());
    }

    // @Validated 클래스의 메서드 제약 실패
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ErrorResponse> handleConstraintViolationException(ConstraintViolationException exception) {
        List<ValidationError> errors = exception.getConstraintViolations().stream()
                .map(this::toValidationError)
                .toList();
        return response(ErrorCode.INVALID_INPUT_VALUE, errors);
    }

    // @RequestBody의 Bean Validation 실패
    @Override
    protected @Nullable ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        List<ValidationError> errors = exception.getBindingResult().getFieldErrors().stream()
                .map(this::toValidationError)
                .toList();
        ErrorResponse body = ErrorResponse.of(ErrorCode.INVALID_INPUT_VALUE, errors);
        return handleExceptionInternal(exception, body, headers, status, request);
    }

    // @RequestParam·@PathVariable에 붙은 @Min 등 컨트롤러 메서드 제약 실패
    @Override
    protected @Nullable ResponseEntity<Object> handleHandlerMethodValidationException(
            HandlerMethodValidationException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        List<ValidationError> errors = exception.getParameterValidationResults().stream()
                .flatMap(result -> result.getResolvableErrors().stream()
                        .map(error -> toValidationError(result, error)))
                .toList();
        ErrorResponse body = ErrorResponse.of(ErrorCode.INVALID_INPUT_VALUE, errors);
        return handleExceptionInternal(exception, body, headers, status, request);
    }

    @Override
    protected @Nullable ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        ErrorResponse body = ErrorResponse.of(ErrorCode.INVALID_REQUEST_BODY);
        return handleExceptionInternal(exception, body, headers, status, request);
    }

    @Override
    protected @Nullable ResponseEntity<Object> handleMissingServletRequestParameter(
            MissingServletRequestParameterException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        ValidationError error = new ValidationError(exception.getParameterName(), REQUIRED_MESSAGE);
        ErrorResponse body = ErrorResponse.of(ErrorCode.MISSING_REQUEST_PARAMETER, List.of(error));
        return handleExceptionInternal(exception, body, headers, status, request);
    }

    @Override
    protected @Nullable ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException exception,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        if (exception instanceof MethodArgumentTypeMismatchException mismatch) {
            ValidationError error = new ValidationError(mismatch.getName(), TYPE_MISMATCH_MESSAGE);
            ErrorResponse body = ErrorResponse.of(ErrorCode.INVALID_PARAMETER_TYPE, List.of(error));
            return handleExceptionInternal(exception, body, headers, status, request);
        }
        return handleExceptionInternal(exception, null, headers, status, request);
    }

    @ExceptionHandler(Exception.class)
    public @Nullable ResponseEntity<Object> handleUnexpectedException(
            Exception exception,
            WebRequest request
    ) throws Exception {
        // 메서드 보안 예외는 Security 필터가 401·403으로 처리하도록 돌려보낸다.
        if (exception instanceof AccessDeniedException || exception instanceof AuthenticationException) {
            throw exception;
        }
        return handleExceptionInternal(exception, null, new HttpHeaders(), HttpStatus.INTERNAL_SERVER_ERROR, request);
    }

    @Override
    protected @Nullable ResponseEntity<Object> handleExceptionInternal(
            Exception exception,
            @Nullable Object body,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request
    ) {
        ErrorResponse errorResponse;
        if (status.is5xxServerError()) {
            log.error("Unhandled request failure", exception);
            // 반환값 검증 실패를 포함해 서버 내부 오류의 세부 내용은 응답에 싣지 않는다.
            errorResponse = ErrorResponse.of(status);
        } else {
            errorResponse = body instanceof ErrorResponse error ? error : ErrorResponse.of(status);
        }

        // Spring이 정한 상태와 Allow 등의 헤더를 유지하고 오류 본문만 교체한다.
        HttpHeaders responseHeaders = new HttpHeaders();
        responseHeaders.putAll(headers);
        responseHeaders.setContentType(MediaType.APPLICATION_JSON);
        return super.handleExceptionInternal(exception, errorResponse, responseHeaders, status, request);
    }

    private ValidationError toValidationError(FieldError error) {
        return new ValidationError(error.getField(), error.getDefaultMessage());
    }

    private ValidationError toValidationError(ParameterValidationResult result, MessageSourceResolvable error) {
        return new ValidationError(result.getMethodParameter().getParameterName(), error.getDefaultMessage());
    }

    private ValidationError toValidationError(ConstraintViolation<?> violation) {
        // "메서드명.파라미터명" 중 마지막 이름만 클라이언트에 전달한다.
        String path = violation.getPropertyPath().toString();
        String field = path.substring(path.lastIndexOf('.') + 1);
        return new ValidationError(field, violation.getMessage());
    }

    private ResponseEntity<ErrorResponse> response(ErrorCode errorCode, List<ValidationError> errors) {
        return ResponseEntity.status(errorCode.status())
                .contentType(MediaType.APPLICATION_JSON)
                .body(ErrorResponse.of(errorCode, errors));
    }
}
