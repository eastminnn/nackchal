package com.nackchal.domain.auction.model;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 끝난 판의 불변 결과. 방 잠금 밖의 정산 스레드로 넘겨 DB에 저장한다.
 * 중단된 판(ABORTED)은 모든 보상이 0이고 라운드 결과가 비어 있다.
 */
public record GameSettlement(UUID gameId, Outcome outcome, Instant endedAt, List<Participant> participants,
                             List<Round> rounds) {

    public enum Outcome { FINISHED, ABORTED }

    public GameSettlement {
        participants = List.copyOf(participants);
        rounds = List.copyOf(rounds);
    }

    /** 참가자 결과. 이탈자는 left가 true이고 rank가 null, reward가 0이다. */
    public record Participant(UUID userId, int finalBalance, boolean left, Instant leftAt, Integer rank,
                              int reward) {}

    /** 가치가 공개된 라운드. 등급은 Grade enum 이름이다. */
    public record Round(int round, String lotCode, String lotName, String hintGrade, String revealedGrade,
                        int value, UUID winnerUserId, int price, Instant revealedAt) {}
}
