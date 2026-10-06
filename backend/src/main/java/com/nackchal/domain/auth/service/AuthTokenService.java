package com.nackchal.domain.auth.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.common.security.config.AuthProperties;
import com.nackchal.common.security.jwt.JwtTokenProvider;
import com.nackchal.domain.auth.entity.RefreshToken;
import com.nackchal.domain.auth.repository.RefreshTokenRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 로그인 토큰 발급, 리프레시 토큰 교체와 폐기
 */
@Service
@Transactional
public class AuthTokenService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final AuthProperties properties;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public AuthTokenService(
            RefreshTokenRepository refreshTokenRepository,
            JwtTokenProvider jwtTokenProvider,
            AuthProperties properties,
            Clock clock
    ) {
        this.refreshTokenRepository = refreshTokenRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.properties = properties;
        this.clock = clock;
    }

    public AuthTokens issue(UUID userId) {
        Instant now = clock.instant();
        refreshTokenRepository.deleteExpired(now);
        return createTokens(userId, now.plus(properties.refreshTtl()));
    }

    /**
     * 리프레시 토큰은 한 번만 사용한다. 갱신해도 최초 로그인 때 정한 만료일은 늘리지 않는다.
     * @throws CustomException UNAUTHORIZED(만료되거나 이미 사용한 토큰)
     */
    public AuthTokens refresh(String token) {
        RefreshToken stored = refreshTokenRepository.findByTokenHash(hash(token))
                .filter(value -> value.getExpiresAt().isAfter(clock.instant()))
                .orElseThrow(() -> new CustomException(ErrorCode.UNAUTHORIZED));
        // 행 잠금으로 같은 토큰을 이용한 동시 재발급과 로그아웃을 순서대로 처리한다.
        refreshTokenRepository.delete(stored);
        return createTokens(stored.getUserId(), stored.getExpiresAt());
    }

    public Optional<UUID> revoke(String token) {
        if (token != null && !token.isBlank() && token.length() <= 128) {
            Optional<RefreshToken> stored = refreshTokenRepository.findByTokenHash(hash(token));
            stored.ifPresent(refreshTokenRepository::delete);
            return stored.map(RefreshToken::getUserId);
        }
        return Optional.empty();
    }

    private AuthTokens createTokens(UUID userId, Instant expiresAt) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String refreshToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        refreshTokenRepository.save(new RefreshToken(userId, hash(refreshToken), expiresAt));
        String accessToken = jwtTokenProvider.issue(userId);
        return new AuthTokens(userId, accessToken, jwtTokenProvider.expiresAt(accessToken), refreshToken, expiresAt);
    }

    private String hash(String token) {
        if (token == null || token.isBlank() || token.length() > 128) {
            throw new CustomException(ErrorCode.UNAUTHORIZED);
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
