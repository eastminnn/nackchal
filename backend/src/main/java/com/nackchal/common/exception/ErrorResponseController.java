package com.nackchal.common.exception;

import com.nackchal.common.exception.error.ErrorResponse;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * /error로 전달된 서블릿 오류를 공통 JSON 응답으로 반환
 */
@RestController
public class ErrorResponseController implements ErrorController {

    private static final Logger log = LoggerFactory.getLogger(ErrorResponseController.class);

    @RequestMapping("${server.error.path:/error}")
    public ResponseEntity<ErrorResponse> handleError(HttpServletRequest request) {
        HttpStatusCode status = resolveStatus(request);
        if (status.is5xxServerError()) {
            Object failure = request.getAttribute(RequestDispatcher.ERROR_EXCEPTION);
            log.error("Servlet request failed: status={}", status.value(),
                    failure instanceof Throwable cause ? cause : null);
        }
        return ResponseEntity.status(status)
                .contentType(MediaType.APPLICATION_JSON)
                .body(ErrorResponse.of(status));
    }

    private HttpStatusCode resolveStatus(HttpServletRequest request) {
        Object statusCode = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        if (statusCode instanceof Integer code && code >= 400 && code <= 599) {
            return HttpStatusCode.valueOf(code);
        }
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
}
