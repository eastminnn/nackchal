package com.nackchal.domain.auction.dto.response;

import java.util.List;
import java.util.UUID;

/** 현재 라운드의 입찰 상태. bidVersion은 입찰이 수락될 때마다 1씩 증가한다. */
public record AuctionStateResponse(int price, UUID leaderUserId, long bidVersion, long extendedMs,
                                   List<BidResponse> bids) {}
