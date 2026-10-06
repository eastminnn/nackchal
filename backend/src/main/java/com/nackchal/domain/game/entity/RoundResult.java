package com.nackchal.domain.game.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * 정상 종료한 판의 라운드 결과. 종료 정산에서 10개를 함께 저장하며 이후 바꾸지 않는다
 */
@Entity
@Table(name = "round_results")
@IdClass(RoundResult.Key.class)
public class RoundResult {

    @Id
    private UUID gameId;

    @Id
    private int roundNo;

    @Column(nullable = false, length = 40)
    private String lotCode;

    @Column(nullable = false, length = 100)
    private String lotNameSnapshot;

    @Column(nullable = false, length = 16)
    private String hintGrade;

    @Column(nullable = false, length = 16)
    private String revealedGrade;

    @Column(nullable = false)
    private long actualValue;

    private UUID winnerUserId;

    @Column(nullable = false)
    private long finalPrice;

    @Column(nullable = false)
    private Instant revealedAt;

    protected RoundResult() {
    }

    public RoundResult(UUID gameId, int roundNo, String lotCode, String lotName, String hintGrade,
                       String revealedGrade, long actualValue, UUID winnerUserId, long finalPrice,
                       Instant revealedAt) {
        this.gameId = gameId;
        this.roundNo = roundNo;
        this.lotCode = lotCode;
        this.lotNameSnapshot = lotName;
        this.hintGrade = hintGrade;
        this.revealedGrade = revealedGrade;
        this.actualValue = actualValue;
        this.winnerUserId = winnerUserId;
        this.finalPrice = finalPrice;
        this.revealedAt = revealedAt;
    }

    /** 복합 키 (game_id, round_no). */
    public static class Key implements Serializable {
        private UUID gameId;
        private int roundNo;

        protected Key() {
        }

        public Key(UUID gameId, int roundNo) {
            this.gameId = gameId;
            this.roundNo = roundNo;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Key key && gameId.equals(key.gameId) && roundNo == key.roundNo;
        }

        @Override
        public int hashCode() {
            return 31 * gameId.hashCode() + roundNo;
        }
    }
}
