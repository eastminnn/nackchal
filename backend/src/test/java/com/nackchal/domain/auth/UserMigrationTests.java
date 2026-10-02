package com.nackchal.domain.auth;

import java.sql.DriverManager;
import java.time.Instant;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class UserMigrationTests {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @Test
    void upgradingExistingAccountRetainsProfileAndPasswordHash() throws Exception {
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target("1").load().migrate();
        UUID userId = UUID.randomUUID();
        Instant createdAt = Instant.parse("2026-10-01T12:00:00Z");
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(),
                POSTGRES.getUsername(), POSTGRES.getPassword())) {
            try (var insert = connection.prepareStatement(
                    "INSERT INTO accounts (id, nickname, avatar_code, created_at) VALUES (?, ?, ?, ?::timestamptz)")) {
                insert.setObject(1, userId);
                insert.setString(2, "기존곰");
                insert.setString(3, "plush-bear");
                insert.setString(4, createdAt.toString());
                insert.executeUpdate();
            }
            try (var insert = connection.prepareStatement(
                    "INSERT INTO email_credentials (account_id, email, password_hash) VALUES (?, ?, ?)")) {
                insert.setObject(1, userId);
                insert.setString(2, "existing@example.test");
                insert.setString(3, "existing-password-hash");
                insert.executeUpdate();
            }
        }

        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load().migrate();

        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(),
                POSTGRES.getUsername(), POSTGRES.getPassword());
                var statement = connection.createStatement();
                var rows = statement.executeQuery("SELECT u.id, u.nickname, u.avatar_code, u.created_at, "
                        + "c.email, c.password_hash FROM users u JOIN email_credentials c ON c.user_id = u.id")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getObject("id", UUID.class)).isEqualTo(userId);
            assertThat(rows.getString("nickname")).isEqualTo("기존곰");
            assertThat(rows.getString("avatar_code")).isEqualTo("plush-bear");
            assertThat(rows.getTimestamp("created_at").toInstant()).isEqualTo(createdAt);
            assertThat(rows.getString("email")).isEqualTo("existing@example.test");
            assertThat(rows.getString("password_hash")).isEqualTo("existing-password-hash");
            assertThat(rows.next()).isFalse();
        }
    }
}
