package com.nackchal;

import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import javax.sql.DataSource;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(NackchalApplicationTests.ErrorProbeConfiguration.class)
class NackchalApplicationTests {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @LocalServerPort
    private int port;

    @Autowired
    private DataSource dataSource;

    @ParameterizedTest
    @ValueSource(strings = {"/api/health", "/api/health/readiness"})
    void healthIsUpWithPostgres(String path) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(5))
                .GET()
                .build();

        try (var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()) {
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());

            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(JsonPath.parse(response.body()).read("$.status", String.class)).isEqualTo("UP");
            assertThat(response.body()).doesNotContain("\"details\"", "\"components\"");
        }
    }

    @Test
    void dataSourceConnectsToPostgres() throws Exception {
        try (var connection = dataSource.getConnection()) {
            var metadata = connection.getMetaData();

            assertThat(metadata.getDatabaseProductName()).isEqualTo("PostgreSQL");
            assertThat(connection.getCatalog()).isEqualTo(POSTGRES.getDatabaseName());
        }
    }

    @Test
    void environmentEndpointIsNotExposed() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/env"))
                .timeout(Duration.ofSeconds(5))
                .GET()
                .build();

        try (var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()) {
            var response = client.send(request, HttpResponse.BodyHandlers.discarding());

            assertThat(response.statusCode()).isEqualTo(401);
        }
    }

    @ParameterizedTest
    @ValueSource(ints = {418, 500})
    void servletErrorDispatchUsesCommonBody(int status) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/health"))
                .header("X-Test-Error", String.valueOf(status)).timeout(Duration.ofSeconds(5)).GET().build();

        try (var client = HttpClient.newHttpClient()) {
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());

            var body = JsonPath.parse(response.body());
            assertThat(response.statusCode()).isEqualTo(status);
            assertThat(body.read("$.status", Integer.class)).isEqualTo(status);
            assertThat(body.read("$.code", String.class)).isEqualTo(status == 500 ? "INTERNAL_SERVER_ERROR" : "HTTP_ERROR");
            List<?> errors = body.read("$.errors");
            assertThat(errors).isEmpty();
            assertThat(response.headers().firstValue("content-type").orElseThrow()).startsWith("application/json");
            assertThat(response.body()).doesNotContain("diagnostic-sentinel", "timestamp", "trace");
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class ErrorProbeConfiguration {
        @Bean
        FilterRegistrationBean<Filter> errorProbe() {
            Filter filter = (request, response, chain) -> {
                var code = ((HttpServletRequest) request).getHeader("X-Test-Error");
                if (code == null) chain.doFilter(request, response);
                else ((HttpServletResponse) response).sendError(Integer.parseInt(code), "diagnostic-sentinel");
            };
            var registration = new FilterRegistrationBean<Filter>();
            registration.setFilter(filter);
            registration.setUrlPatterns(List.of("/api/health"));
            return registration;
        }
    }
}
