package com.nackchal.domain.wallet.event;

import java.util.UUID;

/** 캐시 잔액이 바뀐 뒤(트랜잭션 커밋 후) 발행한다. 본인 연결에만 새 잔액을 알린다. */
public record WalletChangedEvent(UUID userId, long balance) {}
