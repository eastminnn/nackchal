package com.nackchal.domain.wallet;

import java.sql.DriverManager;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class WalletMigrationTests {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @Test
    void upgradingGivesEveryExistingUserAnEmptyWallet() throws Exception {
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target("2").load().migrate();
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(),
                POSTGRES.getUsername(), POSTGRES.getPassword());
                var insert = connection.prepareStatement(
                        "INSERT INTO users (id, nickname, avatar_code, created_at) VALUES (?, ?, 'plush-bear', now())")) {
            for (UUID id : new UUID[] {first, second}) {
                insert.setObject(1, id);
                insert.setString(2, "기존곰");
                insert.executeUpdate();
            }
        }

        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load().migrate();

        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(),
                POSTGRES.getUsername(), POSTGRES.getPassword());
                var statement = connection.createStatement();
                var rows = statement.executeQuery("SELECT user_id, balance FROM wallets ORDER BY user_id")) {
            int count = 0;
            while (rows.next()) {
                assertThat(rows.getObject("user_id", UUID.class)).isIn(first, second);
                assertThat(rows.getLong("balance")).isZero();
                count++;
            }
            assertThat(count).isEqualTo(2);
        }
    }
}
