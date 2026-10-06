package com.nackchal.domain.auction.dto.response;

import java.util.List;

/** 게임 결과. 중단된 게임은 순위가 비어 있다. */
public record GameResultResponse(List<RankingResponse> ranking) {}
