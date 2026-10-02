package com.nackchal.domain.auth;

import com.jayway.jsonpath.JsonPath;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.HttpCookie;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

class AuthClient implements AutoCloseable {
    private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    private final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();
    private final String base;

    AuthClient(int port) { this.base = "http://127.0.0.1:" + port; }

    HttpResponse<String> get(String path) throws Exception {
        return send(HttpRequest.newBuilder(URI.create(base + path)).GET());
    }

    HttpResponse<String> post(String path, Map<String, String> fields, boolean csrf) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(base + path));
        if (csrf) {
            var token = JsonPath.parse(get("/api/auth/csrf").body());
            request.header(token.read("$.headerName"), token.read("$.token"));
        }
        String body = JsonMapper.builder().build().writeValueAsString(fields);
        return send(request.header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)));
    }

    String cookie(String name) {
        return cookies.getCookieStore().getCookies().stream()
                .filter(cookie -> cookie.getName().equals(name))
                .findFirst().orElseThrow().getValue();
    }

    void replaceCookie(String name, String value, String path) {
        cookies.getCookieStore().getCookies().stream()
                .filter(cookie -> cookie.getName().equals(name)).toList()
                .forEach(cookie -> cookies.getCookieStore().remove(URI.create(base), cookie));
        var cookie = new HttpCookie(name, value);
        cookie.setDomain(URI.create(base).getHost());
        cookie.setPath(path);
        cookie.setVersion(0);
        cookies.getCookieStore().add(URI.create(base), cookie);
    }

    void assertNoSessionCookie() {
        assertThat(cookies.getCookieStore().getCookies()).extracting(HttpCookie::getName)
                .doesNotContain("NACKCHAL_SESSION", "JSESSIONID");
    }

    HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
        return client.send(request.timeout(Duration.ofSeconds(10)).build(), HttpResponse.BodyHandlers.ofString());
    }

    static void assertError(HttpResponse<String> response, int status, String code) {
        var body = JsonMapper.builder().build().readTree(response.body());
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("content-type").orElseThrow()).startsWith("application/json");
        assertThat(body.size()).isEqualTo(4);
        assertThat(body.path("status").intValue()).isEqualTo(status);
        assertThat(body.path("code").stringValue()).isEqualTo(code);
        assertThat(body.path("message").stringValue()).isNotBlank();
        assertThat(body.path("errors").isArray()).isTrue();
    }
    @Override public void close() { client.close(); }
}
