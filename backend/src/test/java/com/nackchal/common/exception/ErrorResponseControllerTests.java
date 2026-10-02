package com.nackchal.common.exception;

import jakarta.servlet.RequestDispatcher;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class ErrorResponseControllerTests {
    @ParameterizedTest
    @ValueSource(ints = {200, 399, 600, -1})
    void invalidErrorStatusFallsBackTo500(int status) {
        var request = new MockHttpServletRequest();
        request.setAttribute(RequestDispatcher.ERROR_STATUS_CODE, status);

        var response = new ErrorResponseController().handleError(request);

        assertThat(response.getStatusCode().value()).isEqualTo(500);
        assertThat(response.getBody().status()).isEqualTo(500);
    }

    @Test
    void missingErrorAttributesNeverExposeDefaultBootBody() {
        var response = new ErrorResponseController().handleError(new MockHttpServletRequest());

        assertThat(response.getStatusCode().value()).isEqualTo(500);
        assertThat(response.getBody().code()).isEqualTo("INTERNAL_SERVER_ERROR");
        assertThat(response.getBody().errors()).isEmpty();
    }
}
