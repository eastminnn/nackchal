package com.nackchal.domain.auction.dto.response;

import java.util.UUID;

/** 가치 공개 결과. 유찰이면 winnerUserId가 null이고 price와 profit은 0이다. */
public record RevealResponse(String grade, int value, UUID winnerUserId, int price, int profit) {}
