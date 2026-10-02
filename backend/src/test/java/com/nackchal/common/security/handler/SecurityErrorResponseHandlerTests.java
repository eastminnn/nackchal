package com.nackchal.common.security.handler;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.access.AccessDeniedException;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityErrorResponseHandlerTests {
    @Test
    void unauthenticatedRequestUsesCommonUnauthorizedResponse() throws Exception {
        var mapper = JsonMapper.builder().build();
        var response = new MockHttpServletResponse();
        var handler = new SecurityErrorResponseHandler(mapper);

        handler.commence(new MockHttpServletRequest(), response,
                new InsufficientAuthenticationException("private-authentication-diagnostic"));

        var body = mapper.readTree(response.getContentAsString());
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(body.path("status").intValue()).isEqualTo(401);
        assertThat(body.path("code").stringValue()).isEqualTo("UNAUTHORIZED");
        assertThat(body.path("errors").isEmpty()).isTrue();
        assertThat(response.getContentAsString()).doesNotContain("private-authentication-diagnostic");
    }

    @Test
    void deniedRequestUsesCommonForbiddenResponse() throws Exception {
        var mapper = JsonMapper.builder().build();
        var response = new MockHttpServletResponse();
        var handler = new SecurityErrorResponseHandler(mapper);

        handler.handle(new MockHttpServletRequest(), response, new AccessDeniedException("private-access-diagnostic"));

        var body = mapper.readTree(response.getContentAsString());
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(body.path("code").stringValue()).isEqualTo("FORBIDDEN");
        assertThat(response.getContentAsString()).doesNotContain("private-access-diagnostic");
    }
}
