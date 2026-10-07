package com.nackchal.domain.shop.dto.response;

/** 구매 결과. balance는 구매 후 캐시, quantity는 그 아이템의 새 보유 수량이다. */
public record PurchaseResponse(long balance, String itemCode, long quantity) {}
