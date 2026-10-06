package com.nackchal.domain.game.service;

import java.time.Clock;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 서버가 뜨면 이전 실행에서 끝내지 못한 판을 중단으로 정리한다. 보상은 지급하지 않는다.
 * 이 빈은 웹 서버가 요청을 받기 전에 만들어지므로, 생성 시각보다 먼저 시작한 판만 이전 실행의 판이다.
 */
@Component
public class GameRecoveryRunner {

    private static final Logger log = LoggerFactory.getLogger(GameRecoveryRunner.class);
    private final GameRecordService records;
    private final Clock clock;
    private final Instant bootedAt;

    public GameRecoveryRunner(GameRecordService records, Clock clock) {
        this.records = records;
        this.clock = clock;
        this.bootedAt = clock.instant();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void abortUnfinishedGames() {
        int aborted = records.abortUnfinished(bootedAt, clock.instant());
        if (aborted > 0) log.warn("Aborted {} unfinished games left by a previous run", aborted);
    }
}
