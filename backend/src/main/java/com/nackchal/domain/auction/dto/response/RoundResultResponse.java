package com.nackchal.domain.auction.dto.response;

import java.util.UUID;

/** 가치 공개가 끝난 라운드 기록. */
public record RoundResultResponse(int round, String lotKind, String lotName, UUID winnerUserId, int price,
                                  String grade, int value) {}
