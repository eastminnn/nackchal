package com.nackchal.domain.wallet.dto.response;

/** 본인의 캐시 잔액. 다른 사용자에게는 보내지 않는다. */
public record WalletResponse(long balance) {}
