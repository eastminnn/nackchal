package com.nackchal.common.security.jwt;

import com.nackchal.common.security.config.AuthProperties;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.jwt.JwtException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JwtTokenProviderTests {

    private static final Instant NOW = Instant.parse("2026-10-02T00:00:00Z");
    private static final byte[] KEY = "test-only-key-never-use-in-production-32-bytes".getBytes(StandardCharsets.UTF_8);
    private static final AuthProperties PROPERTIES = new AuthProperties(Base64.getEncoder().encodeToString(KEY),
            "nackchal", Duration.ofMinutes(15), Duration.ofDays(7), false);
    private final JwtTokenProvider provider = new JwtTokenProvider(PROPERTIES, Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void issuedTokenIdentifiesUserAndExpiresAfterFifteenMinutes() throws Exception {
        UUID userId = UUID.randomUUID();

        String token = provider.issue(userId);

        assertThat(provider.verify(token)).isEqualTo(userId);
        SignedJWT parsed = SignedJWT.parse(token);
        assertThat(parsed.getHeader().getAlgorithm()).isEqualTo(JWSAlgorithm.HS256);
        assertThat(parsed.getJWTClaimsSet().getIssuer()).isEqualTo("nackchal");
        assertThat(parsed.getJWTClaimsSet().getExpirationTime().toInstant()).isEqualTo(NOW.plusSeconds(900));
        assertThat(parsed.getJWTClaimsSet().getStringClaim("token_use")).isEqualTo("access");
        assertThat(parsed.getJWTClaimsSet().getClaims()).doesNotContainKeys("email", "nickname", "password");
    }

    @Test
    void expirationIsEnforcedByInjectedClock() {
        String token = provider.issue(UUID.randomUUID());
        JwtTokenProvider later = new JwtTokenProvider(PROPERTIES,
                Clock.fixed(NOW.plus(Duration.ofMinutes(16)), ZoneOffset.UTC));

        assertThatThrownBy(() -> later.verify(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void signatureFromDifferentKeyIsRejected() throws Exception {
        String token = sign(claims().build(), "another-test-key-never-use-in-production".getBytes(StandardCharsets.UTF_8));

        assertThatThrownBy(() -> provider.verify(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void unexpectedIssuerIsRejected() throws Exception {
        String token = sign(claims().issuer("other-service").build(), KEY);

        assertThatThrownBy(() -> provider.verify(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void refreshTypeCannotAuthenticateAsAccess() throws Exception {
        String token = sign(claims().claim("token_use", "refresh").build(), KEY);

        assertThatThrownBy(() -> provider.verify(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void tokenForOtherAudienceIsRejected() throws Exception {
        String token = sign(claims().audience(List.of("other-client")).build(), KEY);

        assertThatThrownBy(() -> provider.verify(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void tokenWithoutExpirationIsRejected() throws Exception {
        String token = sign(claims().expirationTime(null).build(), KEY);

        assertThatThrownBy(() -> provider.verify(token)).isInstanceOf(JwtException.class);
    }

    @Test
    void tokenWithoutUseIsRejected() throws Exception {
        String token = sign(claims().claim("token_use", null).build(), KEY);

        assertThatThrownBy(() -> provider.verify(token)).isInstanceOf(JwtException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-a-user", "", "1-1-1-1-1"})
    void malformedSubjectIsRejected(String subject) throws Exception {
        String token = sign(claims().subject(subject).build(), KEY);

        assertThatThrownBy(() -> provider.verify(token)).isInstanceOf(JwtException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "a.b.c", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJndWVzdCJ9."})
    void malformedOrUnsignedTokenIsRejected(String token) {
        assertThatThrownBy(() -> provider.verify(token)).isInstanceOf(JwtException.class);
    }

    private JWTClaimsSet.Builder claims() {
        return new JWTClaimsSet.Builder().subject(UUID.randomUUID().toString()).issuer("nackchal")
                .audience(List.of("nackchal-web"))
                .issueTime(Date.from(NOW)).expirationTime(Date.from(NOW.plusSeconds(900)))
                .claim("token_use", "access");
    }

    private String sign(JWTClaimsSet claims, byte[] key) throws Exception {
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        jwt.sign(new MACSigner(key));
        return jwt.serialize();
    }
}
