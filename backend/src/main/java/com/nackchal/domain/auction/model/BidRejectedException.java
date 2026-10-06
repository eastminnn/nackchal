package com.nackchal.domain.auction.model;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.auction.dto.response.AuctionStateResponse;

/** 거절한 입찰. 클라이언트가 바로 다시 입찰할 수 있게 거절 시점의 경매 상태를 함께 전달한다. */
public class BidRejectedException extends CustomException {

    private final AuctionStateResponse auction;

    public BidRejectedException(ErrorCode errorCode, AuctionStateResponse auction) {
        super(errorCode);
        this.auction = auction;
    }

    public AuctionStateResponse getAuction() {
        return auction;
    }
}
