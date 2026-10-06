package com.nackchal.domain.auction.dto.response;

import java.util.UUID;

/** 게임 참가자의 게임 머니 잔액. 중도 이탈자는 left가 true이며 순위에서 제외된다. */
public record GamePlayerResponse(UUID userId, int balance, boolean left) {}
