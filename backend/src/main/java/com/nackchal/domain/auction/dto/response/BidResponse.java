package com.nackchal.domain.auction.dto.response;

import java.util.UUID;

/** 수락된 입찰 한 건. at은 서버 수신 시각(epoch ms). */
public record BidResponse(UUID userId, int amount, long at) {}
