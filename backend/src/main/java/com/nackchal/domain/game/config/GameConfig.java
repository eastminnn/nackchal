package com.nackchal.domain.game.config;

import com.nackchal.domain.auction.model.AuctionRules;
import com.nackchal.domain.game.service.GameRecords;
import com.nackchal.domain.game.service.GameSettlementDispatcher;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** 경매 규칙과 정산 실행기 구성. */
@Configuration
public class GameConfig {

    @Bean
    public AuctionRules auctionRules() {
        return AuctionRules.DEFAULT;
    }

    /** 정산 전용 스레드 2개. 대기열에 상한을 두고, 서버가 꺼질 때 남은 정산을 끝낸 뒤 종료한다. */
    @Bean
    public ThreadPoolTaskExecutor gameSettlementExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(2);
        executor.setQueueCapacity(1000);
        executor.setThreadNamePrefix("settlement-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        return executor;
    }

    @Bean
    public GameSettlementDispatcher gameSettlementDispatcher(
            GameRecords records, @Qualifier("gameSettlementExecutor") ThreadPoolTaskExecutor executor
    ) {
        return new GameSettlementDispatcher(records, executor,
                List.of(Duration.ofSeconds(1), Duration.ofSeconds(3), Duration.ofSeconds(10)));
    }
}
