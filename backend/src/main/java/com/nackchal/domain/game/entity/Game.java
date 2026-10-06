package com.nackchal.domain.game.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * 한 판의 시작·종료 기록. 진행 중인 경매를 복원하는 용도가 아니라 정산과 서버 중단 후 정리의 기준이다
 */
@Entity
@Table(name = "games")
public class Game {

    public enum Status { RUNNING, COMPLETED, ABORTED }

    @Id
    private UUID id;

    @Column(nullable = false, length = 6)
    private String roomCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    @Column(nullable = false, length = 40)
    private String rulesVersion;

    @Column(nullable = false)
    private Instant startedAt;

    private Instant endedAt;

    protected Game() {
    }

    public Game(UUID id, String roomCode, String rulesVersion, Instant startedAt) {
        this.id = id;
        this.roomCode = roomCode;
        this.status = Status.RUNNING;
        this.rulesVersion = rulesVersion;
        this.startedAt = startedAt;
    }

    /** 진행 중인 판을 끝낸다. 이미 끝난 판이면 호출하는 쪽에서 먼저 걸러야 한다. */
    public void end(Status status, Instant endedAt) {
        if (this.status != Status.RUNNING || status == Status.RUNNING) {
            throw new IllegalStateException("Game " + id + " cannot move from " + this.status + " to " + status);
        }
        this.status = status;
        // 기록 시각이 시작보다 앞서면 DB 제약에 걸리므로 시작 시각으로 맞춘다.
        this.endedAt = endedAt.isBefore(startedAt) ? startedAt : endedAt;
    }

    public UUID getId() {
        return id;
    }

    public Status getStatus() {
        return status;
    }
}
