package com.nackchal.domain.auth;

import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthIntegrationTests {
    @Container @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwords;
    private static final String PASSWORD = "Plush-auction-42";

    private Map<String, String> newAccount() {
        return Map.of("email", UUID.randomUUID() + "@example.test", "password", PASSWORD, "nickname", "경매사");
    }

    @Test
    void registrationStoresHashAndProfileAtomically() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port)) {
            var response = browser.post("/api/auth/register", input, true);

            assertThat(response.statusCode()).isEqualTo(201);
            var stored = jdbc.queryForMap("SELECT u.nickname, c.password_hash FROM users u "
                    + "JOIN email_credentials c ON u.id = c.user_id WHERE c.email = ?", input.get("email"));
            assertThat(stored.get("nickname")).isEqualTo("경매사");
            assertThat(passwords.matches(PASSWORD, (String) stored.get("password_hash"))).isTrue();
            assertThat(stored.get("password_hash")).isNotEqualTo(PASSWORD);
            assertThat(response.body()).doesNotContain(PASSWORD, "passwordHash");
            assertThat(browser.get("/api/auth/me").statusCode()).isEqualTo(401);
            assertThat(jdbc.queryForObject("SELECT w.balance FROM wallets w JOIN email_credentials c "
                    + "ON c.user_id = w.user_id WHERE c.email = ?", Long.class, input.get("email"))).isZero();
        }
    }

    @Test
    void emailCaseAndWhitespaceCannotCreateDuplicateAccounts() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port)) {
            assertThat(browser.post("/api/auth/register", input, true).statusCode()).isEqualTo(201);
            var count = jdbc.queryForObject("SELECT count(*) FROM users", Long.class);

            var response = browser.post("/api/auth/register", Map.of("email", " " + input.get("email").toUpperCase() + " ",
                    "password", PASSWORD, "nickname", "다른이름"), true);

            AuthClient.assertError(response, 409, "EMAIL_UNAVAILABLE");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Long.class)).isEqualTo(count);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"short", "          "})
    void invalidPasswordCreatesNoAccount(String password) throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port)) {
            var response = browser.post("/api/auth/register", Map.of("email", input.get("email"),
                    "password", password, "nickname", "경매사"), true);

            AuthClient.assertError(response, 400, "INVALID_INPUT_VALUE");
            assertThat(response.body()).contains("\"field\":\"password\"");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM email_credentials WHERE email = ?",
                    Integer.class, input.get("email"))).isZero();
        }
    }

    @Test
    void concurrentRegistrationCreatesOneAccount() throws Exception {
        var input = newAccount();
        var before = jdbc.queryForObject("SELECT count(*) FROM users", Long.class);
        var attempts = java.util.stream.IntStream.range(0, 2).mapToObj(ignored ->
                CompletableFuture.supplyAsync(() -> {
                    try (var browser = new AuthClient(port)) {
                        return browser.post("/api/auth/register", input, true).statusCode();
                    } catch (Exception exception) {
                        throw new CompletionException(exception);
                    }
                })).toList();

        var statuses = attempts.stream().map(CompletableFuture::join).toList();

        assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Long.class)).isEqualTo(before + 1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "이름이열두글자를넘으면안돼요", "<script>", "두 단어"})
    void invalidNicknameIsRejected(String nickname) throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port)) {
            var response = browser.post("/api/auth/register", Map.of("email", input.get("email"),
                    "password", PASSWORD, "nickname", nickname), true);
            assertThat(response.statusCode()).isEqualTo(400);
        }
    }

    @Test
    void registrationKeepsTheChosenCharacterOrDefaultsToBear() throws Exception {
        try (var chosen = new AuthClient(port); var plain = new AuthClient(port); var wrong = new AuthClient(port)) {
            var cat = new HashMap<>(newAccount());
            cat.put("avatarCode", "plush-cat");
            assertThat(chosen.post("/api/auth/register", cat, true).statusCode()).isEqualTo(201);
            chosen.post("/api/auth/login", cat, true);
            assertThat(JsonPath.parse(chosen.get("/api/auth/me").body()).read("$.avatarCode", String.class))
                    .isEqualTo("plush-cat");

            var bear = newAccount();
            plain.post("/api/auth/register", bear, true);
            plain.post("/api/auth/login", bear, true);
            assertThat(JsonPath.parse(plain.get("/api/auth/me").body()).read("$.avatarCode", String.class))
                    .isEqualTo("plush-bear");

            var dragon = new HashMap<>(newAccount());
            dragon.put("avatarCode", "plush-dragon");
            AuthClient.assertError(wrong.post("/api/auth/register", dragon, true), 400, "INVALID_INPUT_VALUE");
        }
    }

    @Test
    void signedInUsersChangeOnlyTheirOwnCharacter() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port); var anonymous = new AuthClient(port)) {
            browser.post("/api/auth/register", input, true);
            browser.post("/api/auth/login", input, true);

            var changed = browser.patch("/api/users/me/avatar", Map.of("avatarCode", "plush-dog"), true);
            assertThat(changed.statusCode()).isEqualTo(200);
            assertThat(JsonPath.parse(changed.body()).read("$.avatarCode", String.class)).isEqualTo("plush-dog");
            assertThat(JsonPath.parse(browser.get("/api/auth/me").body()).read("$.avatarCode", String.class))
                    .isEqualTo("plush-dog");

            AuthClient.assertError(browser.patch("/api/users/me/avatar", Map.of("avatarCode", "plush-dragon"), true),
                    400, "INVALID_INPUT_VALUE");
            assertThat(browser.patch("/api/users/me/avatar", Map.of("avatarCode", "plush-cat"), false).statusCode())
                    .as("CSRF 없이 거절").isEqualTo(403);
            AuthClient.assertError(anonymous.patch("/api/users/me/avatar", Map.of("avatarCode", "plush-cat"), true),
                    401, "UNAUTHORIZED");
        }
    }

    @Test
    void walletReturnsOnlyTheSignedInUsersBalance() throws Exception {
        var mine = newAccount();
        var other = newAccount();
        try (var browser = new AuthClient(port); var anonymous = new AuthClient(port)) {
            browser.post("/api/auth/register", other, true);
            var otherId = jdbc.queryForObject("SELECT user_id FROM email_credentials WHERE email = ?",
                    UUID.class, other.get("email"));
            jdbc.update("UPDATE wallets SET balance = 99 WHERE user_id = ?", otherId);
            browser.post("/api/auth/register", mine, true);
            browser.post("/api/auth/login", mine, true);

            var response = browser.get("/api/wallet?userId=" + otherId);
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(JsonPath.parse(response.body()).read("$.balance", Integer.class)).isZero();
            assertThat(response.body()).doesNotContain(otherId.toString());
            AuthClient.assertError(anonymous.get("/api/wallet"), 401, "UNAUTHORIZED");
        }
    }

    @Test
    void loginIssuesJwtCookiesAndReturnsOnlyOwnProfileWithoutSession() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port)) {
            assertThat(browser.post("/api/auth/register", input, true).statusCode()).isEqualTo(201);
            browser.assertNoSessionCookie();

            var response = browser.post("/api/auth/login", Map.of("email", input.get("email").toUpperCase(),
                    "password", PASSWORD), true);

            assertThat(response.statusCode()).isEqualTo(204);
            assertThat(browser.cookie("NACKCHAL_ACCESS").split("\\.")).hasSize(3);
            assertThat(response.headers().allValues("set-cookie")).anySatisfy(cookie ->
                    assertThat(cookie).startsWith("NACKCHAL_ACCESS=")
                            .contains("HttpOnly", "SameSite=Lax", "Path=/api", "Max-Age=900"));
            assertThat(response.headers().allValues("set-cookie")).anySatisfy(cookie ->
                    assertThat(cookie).startsWith("NACKCHAL_REFRESH=")
                            .contains("HttpOnly", "SameSite=Lax", "Path=/api/auth"));
            String refreshCookie = response.headers().allValues("set-cookie").stream()
                    .filter(cookie -> cookie.startsWith("NACKCHAL_REFRESH=")).findFirst().orElseThrow();
            assertThat(java.net.HttpCookie.parse(refreshCookie).getFirst().getMaxAge()).isBetween(604798L, 604800L);
            browser.assertNoSessionCookie();
            var profile = browser.get("/api/auth/me?userId=" + UUID.randomUUID());
            assertThat(profile.statusCode()).isEqualTo(200);
            assertThat(JsonPath.parse(profile.body()).read("$.nickname", String.class)).isEqualTo("경매사");
            assertThat(profile.body()).doesNotContain("email", "password");
            assertThat(profile.headers().firstValue("cache-control").orElseThrow()).contains("no-store");
            assertThat(browser.get("/api/auth/me").body()).isEqualTo(profile.body());
            assertThat(browser.get("/api/env").statusCode()).isEqualTo(403);
        }
    }

    @Test
    void wrongPasswordAndUnknownEmailReturnSameFailure() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port)) {
            assertThat(browser.post("/api/auth/register", input, true).statusCode()).isEqualTo(201);
            var wrong = browser.post("/api/auth/login", Map.of("email", input.get("email"), "password", "wrong"), true);
            var unknown = browser.post("/api/auth/login", Map.of("email", "unknown@example.test", "password", "wrong"), true);

            AuthClient.assertError(wrong, 401, "INVALID_CREDENTIALS");
            assertThat(unknown.statusCode()).isEqualTo(401);
            assertThat(wrong.body()).isEqualTo(unknown.body());
            assertThat(browser.get("/api/auth/me").statusCode()).isEqualTo(401);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"register", "login", "logout", "refresh"})
    void mutationWithoutCsrfIsRejected(String action) throws Exception {
        try (var browser = new AuthClient(port)) {
            var response = browser.post("/api/auth/" + action, newAccount(), false);
            AuthClient.assertError(response, 403, "FORBIDDEN");
        }
    }

    @Test
    void logoutRevokesRefreshAndClearsCookiesWhileCopiedAccessExpiresNaturally() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port); var replay = HttpClient.newHttpClient()) {
            browser.post("/api/auth/register", input, true);
            assertThat(browser.post("/api/auth/login", input, true).statusCode()).isEqualTo(204);
            var access = browser.cookie("NACKCHAL_ACCESS");
            var refresh = browser.cookie("NACKCHAL_REFRESH");

            var response = browser.post("/api/auth/logout", Map.of(), true);

            assertThat(response.statusCode()).isEqualTo(204);
            assertThat(response.headers().allValues("set-cookie")).anySatisfy(cookie ->
                    assertThat(cookie).startsWith("NACKCHAL_ACCESS=").contains("Max-Age=0"));
            assertThat(response.headers().allValues("set-cookie")).anySatisfy(cookie ->
                    assertThat(cookie).startsWith("NACKCHAL_REFRESH=").contains("Max-Age=0"));
            assertThat(browser.get("/api/auth/me").statusCode()).isEqualTo(401);
            var copiedAccess = replay.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/auth/me"))
                    .header("Cookie", "NACKCHAL_ACCESS=" + access).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(copiedAccess.statusCode()).isEqualTo(200);
            browser.replaceCookie("NACKCHAL_REFRESH", refresh, "/api/auth");
            AuthClient.assertError(browser.post("/api/auth/refresh", Map.of(), true), 401, "UNAUTHORIZED");
            assertThat(browser.post("/api/auth/logout", Map.of(), true).statusCode()).isEqualTo(204);
        }
    }

    @Test
    void anonymousProfileUsesCommonError() throws Exception {
        try (var browser = new AuthClient(port)) {
            AuthClient.assertError(browser.get("/api/auth/me"), 401, "UNAUTHORIZED");
        }
    }

    @Test
    void missingUserBehindJwtUsesCommonError() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port)) {
            browser.post("/api/auth/register", input, true);
            browser.post("/api/auth/login", input, true);
            var id = jdbc.queryForObject("SELECT user_id FROM email_credentials WHERE email = ?",
                    UUID.class, input.get("email"));
            jdbc.update("DELETE FROM email_credentials WHERE user_id = ?", id);
            jdbc.update("DELETE FROM wallets WHERE user_id = ?", id);
            jdbc.update("DELETE FROM users WHERE id = ?", id);

            AuthClient.assertError(browser.get("/api/auth/me"), 401, "UNAUTHORIZED");
        }
    }

    @Test
    void refreshRotatesBothTokensAndRejectsOldRefresh() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port); var replay = new AuthClient(port)) {
            browser.post("/api/auth/register", input, true);
            assertThat(browser.post("/api/auth/login", input, true).statusCode()).isEqualTo(204);
            var oldAccess = browser.cookie("NACKCHAL_ACCESS");
            var oldRefresh = browser.cookie("NACKCHAL_REFRESH");
            assertThat(oldRefresh).matches("[A-Za-z0-9_-]{43}");
            var stored = jdbc.queryForObject("SELECT token_hash FROM refresh_tokens WHERE user_id = "
                    + "(SELECT user_id FROM email_credentials WHERE email = ?)", String.class, input.get("email"));
            assertThat(stored).isEqualTo(hash(oldRefresh)).isNotEqualTo(oldRefresh);

            assertThat(browser.post("/api/auth/refresh", Map.of(), true).statusCode()).isEqualTo(204);

            assertThat(browser.cookie("NACKCHAL_ACCESS")).isNotEqualTo(oldAccess);
            assertThat(browser.cookie("NACKCHAL_REFRESH")).isNotEqualTo(oldRefresh);
            assertThat(browser.get("/api/auth/me").statusCode()).isEqualTo(200);
            browser.assertNoSessionCookie();
            replay.replaceCookie("NACKCHAL_REFRESH", oldRefresh, "/api/auth");
            AuthClient.assertError(replay.post("/api/auth/refresh", Map.of(), true), 401, "UNAUTHORIZED");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE token_hash = ?",
                    Integer.class, hash(oldRefresh))).isZero();
        }
    }

    @Test
    void simultaneousRefreshCanConsumeTokenOnlyOnce() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port)) {
            browser.post("/api/auth/register", input, true);
            browser.post("/api/auth/login", input, true);
            var refresh = browser.cookie("NACKCHAL_REFRESH");
            var attempts = java.util.stream.IntStream.range(0, 2).mapToObj(ignored ->
                    CompletableFuture.supplyAsync(() -> {
                        try (var replay = new AuthClient(port)) {
                            replay.replaceCookie("NACKCHAL_REFRESH", refresh, "/api/auth");
                            return replay.post("/api/auth/refresh", Map.of(), true).statusCode();
                        } catch (Exception exception) {
                            throw new CompletionException(exception);
                        }
                    })).toList();

            assertThat(attempts.stream().map(CompletableFuture::join).toList()).containsExactlyInAnyOrder(204, 401);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE user_id = "
                    + "(SELECT user_id FROM email_credentials WHERE email = ?)", Integer.class, input.get("email")))
                    .isEqualTo(1);
        }
    }

    @Test
    void expiredRefreshCannotIssueNewTokens() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port)) {
            browser.post("/api/auth/register", input, true);
            browser.post("/api/auth/login", input, true);
            jdbc.update("UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = ?",
                    hash(browser.cookie("NACKCHAL_REFRESH")));

            AuthClient.assertError(browser.post("/api/auth/refresh", Map.of(), true), 401, "UNAUTHORIZED");
        }
    }

    @Test
    void missingAndUnrecognizedRefreshUseCommonError() throws Exception {
        try (var browser = new AuthClient(port)) {
            AuthClient.assertError(browser.post("/api/auth/refresh", Map.of(), true), 401, "UNAUTHORIZED");
            browser.replaceCookie("NACKCHAL_REFRESH", "unknown-token", "/api/auth");
            AuthClient.assertError(browser.post("/api/auth/refresh", Map.of(), true), 401, "UNAUTHORIZED");
            browser.assertNoSessionCookie();
        }
    }

    @Test
    void invalidAccessDoesNotPreventRefreshOrLogout() throws Exception {
        var input = newAccount();
        try (var browser = new AuthClient(port)) {
            browser.post("/api/auth/register", input, true);
            browser.post("/api/auth/login", input, true);
            browser.replaceCookie("NACKCHAL_ACCESS", "invalid.jwt.token", "/api");
            AuthClient.assertError(browser.get("/api/auth/me"), 401, "UNAUTHORIZED");
            assertThat(browser.post("/api/auth/refresh", Map.of(), true).statusCode()).isEqualTo(204);
            assertThat(browser.get("/api/auth/me").statusCode()).isEqualTo(200);
            browser.replaceCookie("NACKCHAL_ACCESS", "invalid.jwt.token", "/api");
            assertThat(browser.post("/api/auth/logout", Map.of(), true).statusCode()).isEqualTo(204);
        }
    }

    private String hash(String value) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
    }
}
