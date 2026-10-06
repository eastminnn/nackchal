package com.nackchal.domain.auction.dto.response;

/** 경매 물건의 외형 정보. hint는 외형이 암시하는 등급이며 실제 등급과 다를 수 있다. */
public record LotResponse(String kind, String name, String description, String hint) {}
