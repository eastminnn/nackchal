package com.nackchal.domain.room.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 한 판 동안의 아이템 던지기 제한. 사람마다 3개, 같은 대상에게는 5초 간격이다.
 * 방 잠금 안에서만 쓰며, DB 확정 전에 먼저 자리를 잡고 실패하면 되돌린다.
 */
final class ItemThrows {
    static final int PER_GAME = 3;
    private static final Duration COOLDOWN = Duration.ofSeconds(5);

    final UUID gameId;
    private final Map<UUID, Integer> used = new HashMap<>();
    private final Map<String, Instant> lastThrowAt = new HashMap<>();

    /** 되돌릴 때 필요한 이전 값. */
    record Reservation(UUID userId, String pair, Instant previous) {}

    ItemThrows(UUID gameId) {
        this.gameId = gameId;
    }

    /**
     * 던질 자리를 잡는다.
     * @throws CustomException ITEM_LIMIT_REACHED, ITEM_COOLDOWN
     */
    Reservation reserve(UUID userId, UUID targetUserId, Instant now) {
        if (used.getOrDefault(userId, 0) >= PER_GAME) throw new CustomException(ErrorCode.ITEM_LIMIT_REACHED);
        String pair = userId + ">" + targetUserId;
        Instant previous = lastThrowAt.get(pair);
        if (previous != null && now.isBefore(previous.plus(COOLDOWN))) {
            throw new CustomException(ErrorCode.ITEM_COOLDOWN);
        }
        used.merge(userId, 1, Integer::sum);
        lastThrowAt.put(pair, now);
        return new Reservation(userId, pair, previous);
    }

    /** DB에서 확정하지 못한 던지기를 없던 일로 한다. */
    void release(Reservation reservation) {
        used.merge(reservation.userId(), -1, Integer::sum);
        if (reservation.previous() == null) lastThrowAt.remove(reservation.pair());
        else lastThrowAt.put(reservation.pair(), reservation.previous());
    }

    int remaining(UUID userId) {
        return PER_GAME - used.getOrDefault(userId, 0);
    }
}
