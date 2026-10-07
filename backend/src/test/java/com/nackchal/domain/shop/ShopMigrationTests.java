package com.nackchal.domain.shop;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
class ShopMigrationTests {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @Test
    void upgradingKeepsRewardsSeedsCatalogAndEnforcesLedgerRules() throws Exception {
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target("3").load().migrate();
        UUID user = UUID.randomUUID();
        UUID game = UUID.randomUUID();
        try (var db = connect()) {
            run(db, "INSERT INTO users (id, nickname, avatar_code, created_at) VALUES ('" + user
                    + "', '곰', 'plush-bear', now())");
            run(db, "INSERT INTO wallets VALUES ('" + user + "', 10, now())");
            run(db, "INSERT INTO games VALUES ('" + game + "', 'ABC123', 'COMPLETED', 'auction-v1', now(), now())");
            run(db, "INSERT INTO game_participants (game_id, user_id, seat_no, nickname_snapshot, "
                    + "avatar_code_snapshot, participation_status, final_balance, rank, reward_cash) VALUES ('"
                    + game + "', '" + user + "', 0, '곰', 'plush-bear', 'FINISHED', 120, 1, 10)");
            run(db, "INSERT INTO cash_transactions VALUES ('" + UUID.randomUUID() + "', '" + user
                    + "', 10, 'GAME_REWARD', '" + game + "', now())");
        }

        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load().migrate();

        try (var db = connect()) {
            assertThat(one(db, "SELECT count(*) || ' ' || sum(amount) FROM cash_transactions "
                    + "WHERE reason = 'GAME_REWARD'")).isEqualTo("1 10");
            assertThat(one(db, "SELECT string_agg(code || ':' || price_cash, ',' ORDER BY code) FROM item_catalog"))
                    .isEqualTo("can:2,tomato:3");
            assertThatThrownBy(() -> run(db, "INSERT INTO cash_transactions (id, user_id, amount, reason, game_id, "
                    + "created_at) VALUES ('" + UUID.randomUUID() + "', '" + user + "', -3, 'PURCHASE', '" + game
                    + "', now())")).as("구매 차감은 구매 ID가 있어야 하고 게임 ID는 없어야 한다")
                    .isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> run(db, "INSERT INTO cash_transactions (id, user_id, amount, reason, game_id, "
                    + "created_at) VALUES ('" + UUID.randomUUID() + "', '" + user + "', -10, 'GAME_REWARD', '" + game
                    + "', now())")).as("게임 보상은 양수여야 한다").isInstanceOf(SQLException.class);
        }
    }

    private static Connection connect() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    private static void run(Connection db, String sql) throws SQLException {
        try (var statement = db.createStatement()) {
            statement.executeUpdate(sql);
        }
    }

    private static String one(Connection db, String sql) throws SQLException {
        try (var statement = db.createStatement(); var rows = statement.executeQuery(sql)) {
            rows.next();
            return rows.getString(1);
        }
    }
}
