package com.nackchal.domain.game.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * 한 판의 참가자와 최종 결과. 시작 시 ACTIVE로 만들고 종료 정산에서 결과를 채운다
 */
@Entity
@Table(name = "game_participants")
@IdClass(GameParticipant.Key.class)
public class GameParticipant {

    public enum Status { ACTIVE, FINISHED, LEFT, ABORTED }

    @Id
    private UUID gameId;

    @Id
    private UUID userId;

    @Column(nullable = false)
    private int seatNo;

    @Column(nullable = false, length = 12)
    private String nicknameSnapshot;

    @Column(nullable = false, length = 32)
    private String avatarCodeSnapshot;

    @Enumerated(EnumType.STRING)
    @Column(name = "participation_status", nullable = false, length = 16)
    private Status status;

    private Long finalBalance;

    @Column(name = "rank")
    private Integer rank;

    private Long rewardCash;

    private Instant leftAt;

    protected GameParticipant() {
    }

    public GameParticipant(UUID gameId, UUID userId, int seatNo, String nickname, String avatarCode) {
        this.gameId = gameId;
        this.userId = userId;
        this.seatNo = seatNo;
        this.nicknameSnapshot = nickname;
        this.avatarCodeSnapshot = avatarCode;
        this.status = Status.ACTIVE;
    }

    /** 정산 결과를 기록한다. 순위가 없는 참가자(이탈·중단)는 rank가 null이다. */
    public void settle(Status status, Long finalBalance, Integer rank, long rewardCash, Instant leftAt) {
        this.status = status;
        this.finalBalance = finalBalance;
        this.rank = rank;
        this.rewardCash = rewardCash;
        this.leftAt = leftAt;
    }

    public UUID getUserId() {
        return userId;
    }

    public Status getStatus() {
        return status;
    }

    public Long getRewardCash() {
        return rewardCash;
    }

    /** 복합 키 (game_id, user_id). */
    public static class Key implements Serializable {
        private UUID gameId;
        private UUID userId;

        protected Key() {
        }

        public Key(UUID gameId, UUID userId) {
            this.gameId = gameId;
            this.userId = userId;
        }

        @Override
        public boolean equals(Object other) {
            return other instanceof Key key && gameId.equals(key.gameId) && userId.equals(key.userId);
        }

        @Override
        public int hashCode() {
            return 31 * gameId.hashCode() + userId.hashCode();
        }
    }
}
