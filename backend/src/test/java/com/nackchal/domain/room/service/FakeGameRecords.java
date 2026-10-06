package com.nackchal.domain.room.service;

import com.nackchal.domain.auction.model.GameSettlement;
import com.nackchal.domain.game.service.GameRecords;
import com.nackchal.domain.game.service.GameStart;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** 메모리에 기록만 남기는 GameRecords. 시작을 멈추거나 실패시켜 대기실의 시작·정산 흐름을 검사한다. */
class FakeGameRecords implements GameRecords {
    final List<GameStart> starts = new CopyOnWriteArrayList<>();
    final List<GameSettlement> settlements = new CopyOnWriteArrayList<>();
    volatile boolean failStart;
    volatile boolean failSettle;
    volatile Runnable duringStart = () -> {};
    volatile CountDownLatch startEntered;
    volatile CountDownLatch releaseStart;
    volatile Map<UUID, Long> balances = Map.of();

    @Override
    public void recordStart(GameStart start) {
        duringStart.run();
        if (startEntered != null) startEntered.countDown();
        if (releaseStart != null) await(releaseStart);
        if (failStart) throw new IllegalStateException("start failed");
        starts.add(start);
    }

    @Override
    public Map<UUID, Long> settle(GameSettlement settlement) {
        if (failSettle) throw new IllegalStateException("settle failed");
        settlements.add(settlement);
        return balances;
    }

    /** 다음 시작 기록을 release가 호출될 때까지 멈춘다. */
    void holdNextStart() {
        startEntered = new CountDownLatch(1);
        releaseStart = new CountDownLatch(1);
    }

    void awaitStartEntered() {
        await(startEntered);
    }

    void release() {
        releaseStart.countDown();
        releaseStart = null;
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("timed out");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(exception);
        }
    }
}
