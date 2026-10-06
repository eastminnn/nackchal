package com.nackchal.domain.auction.dto.response;

import java.util.UUID;

/** 최종 순위 한 줄. 동점은 같은 순위이며 reward는 지급할 캐시(1등 10, 2등 5, 나머지 2)다. */
public record RankingResponse(UUID userId, int rank, int balance, int reward) {}
