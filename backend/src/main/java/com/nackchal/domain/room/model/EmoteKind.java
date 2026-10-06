package com.nackchal.domain.room.model;

import java.time.Duration;

/** 방에서 쓰는 무료 모션. 길이 동안 캐릭터가 동작하고, 다음 모션은 4초와 동작 길이 중 긴 쪽이 지나야 가능하다. */
public enum EmoteKind {
    MIDDLE_FINGER(Duration.ofSeconds(3)),
    SMOKE(Duration.ofSeconds(6));

    private static final Duration MIN_COOLDOWN = Duration.ofSeconds(4);
    private final Duration duration;

    EmoteKind(Duration duration) {
        this.duration = duration;
    }

    public Duration duration() {
        return duration;
    }

    /** 같은 사람이 다음 모션을 쓸 수 있을 때까지의 시간. */
    public Duration cooldown() {
        return duration.compareTo(MIN_COOLDOWN) > 0 ? duration : MIN_COOLDOWN;
    }
}
