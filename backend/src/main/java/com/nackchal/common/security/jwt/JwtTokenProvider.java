package com.nackchal.common.security.jwt;

import com.nackchal.common.security.config.AuthProperties;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Component;

/**
 * 액세스 JWT 발급과 검증. 서명뿐 아니라 발급자, 대상, 용도, 만료 시간도 확인한다
 */
@Component
public class JwtTokenProvider {

    private static final String AUDIENCE = "nackchal-web";

    private final AuthProperties properties;
    private final Clock clock;
    private final NimbusJwtEncoder encoder;
    private final NimbusJwtDecoder decoder;

    public JwtTokenProvider(AuthProperties properties, Clock clock) {
        this.properties = properties;
        this.clock = clock;
        byte[] keyBytes;
        try {
            keyBytes = Base64.getDecoder().decode(properties.jwtSecret());
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("JWT_SECRET은 Base64 형식이어야 합니다.");
        }
        if (keyBytes.length < 32) {
            throw new IllegalArgumentException("JWT_SECRET은 디코딩 후 32바이트 이상이어야 합니다.");
        }
        SecretKeySpec key = new SecretKeySpec(keyBytes, "HmacSHA256");
        this.encoder = new NimbusJwtEncoder(new ImmutableSecret<>(key));
        this.decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        JwtTimestampValidator timestampValidator = new JwtTimestampValidator(Duration.ZERO);
        timestampValidator.setClock(clock);
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                timestampValidator,
                new JwtIssuerValidator(properties.issuer()),
                new JwtClaimValidator<Instant>("exp", Objects::nonNull),
                new JwtClaimValidator<String>("token_use", "access"::equals),
                new JwtClaimValidator<List<String>>("aud", audience -> audience != null && audience.contains(AUDIENCE))
        ));
    }

    public String issue(UUID userId) {
        Instant now = clock.instant();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(properties.issuer())
                .audience(List.of(AUDIENCE))
                .subject(userId.toString())
                .id(UUID.randomUUID().toString())
                .issuedAt(now)
                .expiresAt(now.plus(properties.accessTtl()))
                .claim("token_use", "access")
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }

    public UUID verify(String token) {
        Jwt jwt = decoder.decode(token);
        try {
            UUID userId = UUID.fromString(jwt.getSubject());
            if (!userId.toString().equals(jwt.getSubject())) {
                throw new BadJwtException("Invalid token subject");
            }
            return userId;
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new BadJwtException("Invalid token subject", exception);
        }
    }

    public Instant expiresAt(String token) {
        return decoder.decode(token).getExpiresAt();
    }
}
