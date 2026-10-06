package com.nackchal.domain.auction.dto.response;

import java.util.List;
import java.util.UUID;

/**
 * 참가자에게 보내는 게임 상태. status는 AUCTION, SOLD, REVEAL, FINISHED, ABORTED 중 하나이고
 * phaseEndsAt은 현재 단계가 끝나는 서버 시각(epoch ms)이며 끝난 게임에서는 null이다.
 * 실제 등급과 가치는 reveal과 history에만 들어간다.
 */
public record GameResponse(UUID gameId, String status, int round, int totalRounds, Long phaseEndsAt,
                           LotResponse lot, AuctionStateResponse auction, List<GamePlayerResponse> players,
                           RevealResponse reveal, List<RoundResultResponse> history, GameResultResponse result) {}
