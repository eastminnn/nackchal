package com.nackchal.domain.game.service;

import com.nackchal.domain.auction.model.GameSettlement;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 끝난 판의 정산을 전용 스레드에서 실행한다. 방 잠금이나 타이머 스레드가 DB를 기다리지 않게 하기 위해서다.
 * 실패하면 정해진 간격으로 다시 시도하고, 결과는 콜백으로 알린다. 콜백도 정산 스레드에서 실행된다.
 */
public class GameSettlementDispatcher {

    private static final Logger log = LoggerFactory.getLogger(GameSettlementDispatcher.class);
    private final GameRecords records;
    private final Executor executor;
    private final List<Duration> retryDelays;

    /** 정산 결과. 실패하면 balances는 비어 있다. */
    public record Result(boolean success, Map<UUID, Long> balances) {}

    public GameSettlementDispatcher(GameRecords records, Executor executor, List<Duration> retryDelays) {
        this.records = records;
        this.executor = executor;
        this.retryDelays = List.copyOf(retryDelays);
    }

    /** 정산을 대기열에 넣는다. 대기열이 가득 차면 바로 실패로 알린다. */
    public void submit(GameSettlement settlement, Consumer<Result> onDone) {
        try {
            executor.execute(() -> notify(onDone, settle(settlement), settlement.gameId()));
        } catch (RejectedExecutionException exception) {
            log.error("Settlement queue rejected game {}", settlement.gameId(), exception);
            notify(onDone, new Result(false, Map.of()), settlement.gameId());
        }
    }

    private Result settle(GameSettlement settlement) {
        for (int attempt = 0; ; attempt++) {
            try {
                return new Result(true, records.settle(settlement));
            } catch (RuntimeException exception) {
                if (attempt >= retryDelays.size()) {
                    log.error("Settlement failed for game {} after {} attempts", settlement.gameId(), attempt + 1,
                            exception);
                    return new Result(false, Map.of());
                }
                log.warn("Settlement attempt {} failed for game {}", attempt + 1, settlement.gameId(), exception);
                if (!sleep(retryDelays.get(attempt))) return new Result(false, Map.of());
            }
        }
    }

    private static boolean sleep(Duration delay) {
        try {
            Thread.sleep(delay);
            return true;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static void notify(Consumer<Result> onDone, Result result, UUID gameId) {
        try {
            onDone.accept(result);
        } catch (RuntimeException exception) {
            log.error("Settlement callback failed for game {}", gameId, exception);
        }
    }
}
