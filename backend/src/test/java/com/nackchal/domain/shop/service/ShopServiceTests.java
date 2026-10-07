package com.nackchal.domain.shop.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.shop.dto.request.PurchaseRequest;
import com.nackchal.domain.shop.dto.response.PurchaseResponse;
import com.nackchal.domain.shop.dto.response.ShopItemResponse;
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
class ShopServiceTests {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @Autowired ShopService shop;
    @Autowired JdbcTemplate jdbc;

    @Test
    void listsItemsWithMyQuantities() {
        UUID user = user(0);
        assertThat(shop.items(user)).containsExactly(
                new ShopItemResponse("tomato", "토마토", 3, 0), new ShopItemResponse("can", "깡통", 2, 0));
    }

    @Test
    void purchaseChargesLedgerAndAddsInventoryTogether() {
        UUID user = user(10);
        PurchaseResponse first = shop.purchase(user, new PurchaseRequest("tomato", 2, UUID.randomUUID()));
        PurchaseResponse second = shop.purchase(user, new PurchaseRequest("tomato", 1, UUID.randomUUID()));

        assertThat(first).isEqualTo(new PurchaseResponse(4, "tomato", 2));
        assertThat(second).isEqualTo(new PurchaseResponse(1, "tomato", 3));
        assertThat(balance(user)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT sum(amount) FROM cash_transactions WHERE user_id = ?", Long.class, user))
                .as("원장 합계 = 잔액 (초기 지급 10 포함)").isEqualTo(balance(user) - 10);
        assertThat(jdbc.queryForList("SELECT amount FROM cash_transactions WHERE user_id = ? AND reason = 'PURCHASE' "
                + "ORDER BY amount", Long.class, user)).containsExactly(-6L, -3L);
        assertThat(shop.items(user)).first().satisfies(item -> assertThat(item.quantity()).isEqualTo(3));
    }

    @Test
    void insufficientCashLeavesNothingBehind() {
        UUID user = user(5);
        assertThat(code(() -> shop.purchase(user, new PurchaseRequest("tomato", 2, UUID.randomUUID()))))
                .isEqualTo(ErrorCode.CASH_INSUFFICIENT);
        assertThat(balance(user)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM shop_purchases WHERE user_id = ?", Long.class, user))
                .isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM inventories WHERE user_id = ?", Long.class, user)).isZero();
    }

    @Test
    void sameRequestIsProcessedOnceAndDifferentBodyConflicts() {
        UUID user = user(10);
        UUID request = UUID.randomUUID();
        PurchaseResponse first = shop.purchase(user, new PurchaseRequest("can", 2, request));
        assertThat(shop.purchase(user, new PurchaseRequest("can", 2, request))).isEqualTo(first);
        assertThat(code(() -> shop.purchase(user, new PurchaseRequest("can", 3, request))))
                .isEqualTo(ErrorCode.CONFLICT);
        assertThat(balance(user)).isEqualTo(6);
    }

    @Test
    void unknownOrRetiredItemsAreNotSold() {
        UUID user = user(10);
        assertThat(code(() -> shop.purchase(user, new PurchaseRequest("banana", 1, UUID.randomUUID()))))
                .isEqualTo(ErrorCode.ITEM_NOT_FOUND);
        jdbc.update("UPDATE item_catalog SET active = false WHERE code = 'can'");
        try {
            assertThat(code(() -> shop.purchase(user, new PurchaseRequest("can", 1, UUID.randomUUID()))))
                    .isEqualTo(ErrorCode.ITEM_NOT_FOUND);
            assertThat(shop.items(user)).extracting(ShopItemResponse::code).containsExactly("tomato");
        } finally {
            jdbc.update("UPDATE item_catalog SET active = true WHERE code = 'can'");
        }
    }

    @Test
    void concurrentPurchasesNeverOverdraw() throws Exception {
        UUID user = user(5);
        var ready = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(4)) {
            List<Future<ErrorCode>> results = new ArrayList<>();
            for (int i = 0; i < 4; i++) results.add(pool.submit(() -> {
                ready.await();
                try {
                    shop.purchase(user, new PurchaseRequest("tomato", 1, UUID.randomUUID()));
                    return null;
                } catch (CustomException exception) {
                    return exception.getErrorCode();
                }
            }));
            ready.countDown();
            List<ErrorCode> codes = new ArrayList<>();
            for (var result : results) codes.add(result.get(10, TimeUnit.SECONDS));
            assertThat(codes).filteredOn(code -> code == null).hasSize(1);
            assertThat(codes).filteredOn(code -> code != null).containsOnly(ErrorCode.CASH_INSUFFICIENT);
        }
        assertThat(balance(user)).isEqualTo(2);
    }

    /** 지갑에 캐시를 넣은 사용자. 초기 잔액은 게임 보상 원장이 없는 시험용 값이다. */
    private UUID user(long cash) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO users (id, nickname, avatar_code, created_at) VALUES (?, '곰', 'plush-bear', now())", id);
        jdbc.update("INSERT INTO wallets (user_id, balance, updated_at) VALUES (?, ?, now())", id, cash);
        return id;
    }

    private long balance(UUID user) {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, user);
    }

    private static ErrorCode code(Runnable action) {
        return catchThrowableOfType(CustomException.class, action::run).getErrorCode();
    }
}
