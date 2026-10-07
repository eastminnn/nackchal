package com.nackchal.domain.shop.dto.response;

/** 판매 중인 아이템과 내 보유 수량. */
public record ShopItemResponse(String code, String name, long price, long quantity) {}
