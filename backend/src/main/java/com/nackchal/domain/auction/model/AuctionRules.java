package com.nackchal.domain.auction.model;

import java.time.Duration;

/**
 * 한 판의 규칙 값. 운영은 DEFAULT를 쓰고, 테스트는 단계 시간만 줄여 한 판을 빨리 끝낸다.
 * version은 게임 기록에 남겨 어떤 규칙으로 진행했는지 구분한다.
 */
public record AuctionRules(String version, int totalRounds, int startBalance, int startPrice, Duration auctionTime,
                           Duration soldTime, Duration revealTime, Duration extendWindow, Duration maxExtension) {

    public static final AuctionRules DEFAULT = new AuctionRules("auction-v1", 10, 100, 5, Duration.ofSeconds(20),
            Duration.ofSeconds(5), Duration.ofSeconds(3), Duration.ofSeconds(3), Duration.ofSeconds(15));

    /** 단계 시간만 바꾼 규칙. 라운드 수와 금액 규칙은 그대로다. */
    public AuctionRules withPhaseTimes(Duration auction, Duration sold, Duration reveal) {
        return new AuctionRules(version, totalRounds, startBalance, startPrice, auction, sold, reveal, extendWindow,
                maxExtension);
    }
}
