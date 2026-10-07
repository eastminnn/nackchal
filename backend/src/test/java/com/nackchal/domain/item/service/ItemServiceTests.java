package com.nackchal.domain.item.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.game.service.GameRecordService;
import com.nackchal.domain.game.service.GameStart;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

@Testcontainers
@SpringBootTest
class ItemServiceTests {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @Autowired ItemService items;
    @Autowired GameRecordService games;
    @Autowired JdbcTemplate jdbc;

    private final UUID thrower = UUID.randomUUID();
    private final UUID target = UUID.randomUUID();
    private final UUID gameId = UUID.randomUUID();

    @Test
    void usingTakesOneAndRecordsTheThrow() {
        setUp(2);
        assertThat(items.consume(thrower, "tomato", gameId, target, UUID.randomUUID())).isEqualTo(1);
        assertThat(stock()).isEqualTo(1);
        assertThat(jdbc.queryForMap("SELECT user_id, target_user_id, item_code FROM item_uses WHERE game_id = ?", gameId))
                .containsEntry("user_id", thrower).containsEntry("target_user_id", target)
                .containsEntry("item_code", "tomato");
    }

    @Test
    void emptyStockIsRejectedWithoutRecord() {
        setUp(0);
        assertThat(code(() -> items.consume(thrower, "tomato", gameId, target, UUID.randomUUID())))
                .isEqualTo(ErrorCode.ITEM_OUT_OF_STOCK);
        assertThat(code(() -> items.consume(thrower, "can", gameId, target, UUID.randomUUID())))
                .as("가진 적 없는 아이템").isEqualTo(ErrorCode.ITEM_OUT_OF_STOCK);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM item_uses WHERE game_id = ?", Long.class, gameId)).isZero();
    }

    @Test
    void lastItemIsUsedOnceUnderConcurrency() throws Exception {
        setUp(1);
        var ready = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(4)) {
            List<Future<ErrorCode>> results = new ArrayList<>();
            for (int i = 0; i < 4; i++) results.add(pool.submit(() -> {
                ready.await();
                try {
                    items.consume(thrower, "tomato", gameId, target, UUID.randomUUID());
                    return null;
                } catch (CustomException exception) {
                    return exception.getErrorCode();
                }
            }));
            ready.countDown();
            List<ErrorCode> codes = new ArrayList<>();
            for (var result : results) codes.add(result.get(10, TimeUnit.SECONDS));
            assertThat(codes).filteredOn(code -> code == null).hasSize(1);
            assertThat(codes).filteredOn(code -> code != null).containsOnly(ErrorCode.ITEM_OUT_OF_STOCK);
        }
        assertThat(stock()).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM item_uses WHERE game_id = ?", Long.class, gameId))
                .isEqualTo(1);
    }

    private void setUp(long tomatoes) {
        int seat = 0;
        List<GameStart.Seat> seats = new ArrayList<>();
        for (UUID user : List.of(thrower, target)) {
            jdbc.update("INSERT INTO users (id, nickname, avatar_code, created_at) VALUES (?, '곰', 'plush-bear', now())",
                    user);
            seats.add(new GameStart.Seat(user, seat++, "곰", "plush-bear"));
        }
        games.recordStart(new GameStart(gameId, "ABC123", "auction-v1", Instant.now(), seats));
        if (tomatoes > 0) {
            jdbc.update("INSERT INTO inventories VALUES (?, 'tomato', ?, now())", thrower, tomatoes);
        }
    }

    private long stock() {
        return jdbc.queryForObject("SELECT quantity FROM inventories WHERE user_id = ? AND item_code = 'tomato'",
                Long.class, thrower);
    }

    private static ErrorCode code(Runnable action) {
        return catchThrowableOfType(CustomException.class, action::run).getErrorCode();
    }
}
