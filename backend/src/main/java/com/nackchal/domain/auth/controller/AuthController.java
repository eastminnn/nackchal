package com.nackchal.domain.auth.controller;

import com.nackchal.domain.user.dto.response.UserResponse;
import com.nackchal.common.security.service.AuthCookieService;
import com.nackchal.common.security.event.AccessTokenRenewedEvent;
import com.nackchal.common.security.event.UserLoggedOutEvent;
import com.nackchal.domain.auth.dto.request.LoginRequest;
import com.nackchal.domain.auth.dto.request.RegistrationRequest;
import com.nackchal.domain.auth.dto.response.CsrfResponse;
import com.nackchal.domain.auth.service.AuthService;
import com.nackchal.domain.auth.service.AuthTokenService;
import com.nackchal.domain.auth.service.AuthTokens;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 회원가입, 로그인, 토큰 재발급과 현재 사용자 조회
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final AuthTokenService authTokenService;
    private final AuthCookieService authCookieService;
    private final ApplicationEventPublisher events;

    public AuthController(
            AuthService authService,
            AuthTokenService authTokenService,
            AuthCookieService authCookieService,
            ApplicationEventPublisher events
    ) {
        this.authService = authService;
        this.authTokenService = authTokenService;
        this.authCookieService = authCookieService;
        this.events = events;
    }

    @GetMapping("/csrf")
    public CsrfResponse issueCsrfToken(CsrfToken csrfToken) {
        // 지연된 토큰을 읽어 CSRF 쿠키를 발급한다. 쓰기 요청은 반환된 헤더와 토큰을 함께 보낸다.
        return new CsrfResponse(csrfToken.getHeaderName(), csrfToken.getToken());
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public void register(@Valid @RequestBody RegistrationRequest request) {
        authService.register(request);
    }

    @GetMapping("/me")
    public UserResponse getMe(Principal principal) {
        return authService.getMe(UUID.fromString(principal.getName()));
    }

    @PostMapping("/login")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void login(@Valid @RequestBody LoginRequest request, HttpServletResponse response) {
        issue(response, authService.login(request));
    }

    @PostMapping("/refresh")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void refresh(
            @CookieValue(name = AuthCookieService.REFRESH_COOKIE, required = false) String token,
            HttpServletResponse response
    ) {
        issue(response, authTokenService.refresh(token));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(
            @CookieValue(name = AuthCookieService.REFRESH_COOKIE, required = false) String token,
            HttpServletResponse response,
            Principal principal
    ) {
        UUID userId = authTokenService.revoke(token)
                .orElseGet(() -> principal == null ? null : UUID.fromString(principal.getName()));
        authCookieService.clear(response);
        if (userId != null) events.publishEvent(new UserLoggedOutEvent(userId));
    }

    private void issue(HttpServletResponse response, AuthTokens tokens) {
        authCookieService.write(response, tokens);
        // 열린 WebSocket은 연결 시점의 토큰 만료로 끊기므로, 새 토큰의 만료 시각까지 연결을 유지시킨다.
        events.publishEvent(new AccessTokenRenewedEvent(tokens.userId(), tokens.accessExpiresAt()));
    }
}
