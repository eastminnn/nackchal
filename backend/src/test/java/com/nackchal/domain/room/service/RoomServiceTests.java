package com.nackchal.domain.room.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.room.model.RoomActor;
import com.nackchal.domain.room.model.RoomChangedEvent;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RoomServiceTests {
    private final MutableClock clock = new MutableClock();
    private final List<Object> events = new CopyOnWriteArrayList<>();
    private final RoomService service = new RoomService(clock, events::add);

    @Test
    void createsCodedRoomAndIdempotentJoinDoesNotChangeVersion() {
        RoomActor host = actor();
        var room = service.create(host);
        assertThat(room.id()).matches("[A-Z0-9]{6}");
        assertThat(room.name()).isEqualTo(host.nickname() + "의 경매장");
        assertThat(room.hostUserId()).isEqualTo(host.userId());
        assertThat(room.capacity()).isEqualTo(4);
        assertThat(service.join(host, room.id())).isEqualTo(room);
        assertThat(events).hasSize(1).first().isEqualTo(new RoomChangedEvent(room.id()));
    }

    @Test
    void disconnectedSeatCountsAgainstCapacityAndExpiresAtThirtySeconds() {
        RoomActor host = actor();
        var room = service.create(host);
        List<RoomActor> guests = List.of(actor(), actor(), actor());
        guests.forEach(guest -> service.join(guest, room.id()));
        service.ready(guests.getFirst(), true);
        service.disconnect(guests.getFirst());
        expect(ErrorCode.ROOM_FULL, () -> service.join(actor(), room.id()));
        assertThat(service.list()).singleElement().satisfies(summary -> {
            assertThat(summary.players()).isEqualTo(4);
            assertThat(summary.status()).isEqualTo("full");
        });
        assertThat(service.find(room.id()).orElseThrow().players().get(1).ready()).isFalse();
        clock.advance(29_999);
        service.expireDisconnected();
        assertThat(service.find(room.id()).orElseThrow().players()).hasSize(4);
        clock.advance(1);
        service.expireDisconnected();
        var joined = service.join(actor(), room.id());
        assertThat(joined.players()).hasSize(4);
        assertThat(joined.players()).extracting(player -> player.seat()).doesNotHaveDuplicates();
        assertThat(service.roomId(guests.getFirst().userId())).isEmpty();
    }

    @Test
    void simultaneousJoinsNeverExceedFourSeats() throws Exception {
        var room = service.create(actor());
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(12)) {
            List<Future<Boolean>> results = new ArrayList<>();
            for (int i = 0; i < 12; i++) results.add(pool.submit(() -> {
                start.await();
                try { service.join(actor(), room.id()); return true; }
                catch (CustomException exception) {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ROOM_FULL);
                    return false;
                }
            }));
            start.countDown();
            int admitted = 0;
            for (Future<Boolean> result : results) if (result.get(5, TimeUnit.SECONDS)) admitted++;
            assertThat(admitted).isEqualTo(3);
        }
        assertThat(service.find(room.id()).orElseThrow().players()).hasSize(4);
    }

    @Test
    void blocksAnotherRoomAndAnotherLiveConnection() {
        RoomActor user = actor();
        var first = service.create(user);
        var second = service.create(actor());
        expect(ErrorCode.ROOM_ALREADY_JOINED, () -> service.join(user, second.id()));
        expect(ErrorCode.ROOM_ALREADY_JOINED, () -> service.create(reconnect(user)));
        expect(ErrorCode.ROOM_CONNECTION_CONFLICT, () -> service.join(reconnect(user), first.id()));
        assertThat(service.roomId(reconnect(user))).isEmpty();
        assertThat(service.roomId(user)).contains(first.id());
    }

    @Test
    void sameUserRacingAcrossRoomsObtainsOnlyOneSeat() throws Exception {
        var first = service.create(actor());
        var second = service.create(actor());
        RoomActor user = actor();
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            List<Future<Boolean>> results = new ArrayList<>();
            for (String id : List.of(first.id(), second.id())) results.add(pool.submit(() -> {
                start.await();
                try { service.join(user, id); return true; }
                catch (CustomException exception) {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ROOM_ALREADY_JOINED);
                    return false;
                }
            }));
            start.countDown();
            assertThat(List.of(results.get(0).get(5, TimeUnit.SECONDS), results.get(1).get(5, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertThat(service.list().stream().mapToInt(room -> room.players()).sum()).isEqualTo(3);
    }

    @Test
    void reconnectPreservesSeatAndStaleConnectionCannotMutateIt() {
        RoomActor old = actor();
        var original = service.create(old);
        service.ready(old, true);
        service.disconnect(old);
        clock.advance(29_999);
        RoomActor current = reconnect(old);
        var resumed = service.join(current, original.id());
        assertThat(resumed.players()).singleElement().satisfies(member -> {
            assertThat(member.seat()).isZero();
            assertThat(member.connected()).isTrue();
            assertThat(member.ready()).isFalse();
        });
        service.disconnect(old);
        expect(ErrorCode.ROOM_NOT_JOINED, () -> service.leave(old));
        expect(ErrorCode.ROOM_NOT_JOINED, () -> service.ready(old, true));
        expect(ErrorCode.ROOM_NOT_JOINED, () -> service.chat(old, "stale"));
        assertThat(service.find(original.id())).contains(resumed);
        assertThat(service.roomId(current)).contains(original.id());
        assertThat(resumed.version()).isGreaterThan(original.version());
    }

    @Test
    void expiryDeletesEmptyRoomAndPreventsOldRoomReconnect() {
        RoomActor host = actor();
        var room = service.create(host);
        service.disconnect(host);
        clock.advance(30_000);
        expect(ErrorCode.ROOM_NOT_FOUND, () -> service.join(reconnect(host), room.id()));
        assertThat(service.find(room.id())).isEmpty();
        assertThat(service.roomId(host.userId())).isEmpty();
        assertThat(service.list()).isEmpty();
        assertThat(service.create(reconnect(host)).players()).hasSize(1);
    }

    @Test
    void earliestRemainingJoinerBecomesHostAndLeaveIsImmediate() {
        RoomActor host = actor();
        RoomActor earlier = actor();
        RoomActor later = actor();
        var room = service.create(host);
        service.join(earlier, room.id());
        service.join(later, room.id());
        service.leave(host);
        assertThat(service.find(room.id()).orElseThrow().hostUserId()).isEqualTo(earlier.userId());
        service.disconnect(earlier);
        clock.advance(30_000);
        service.expireDisconnected();
        assertThat(service.find(room.id()).orElseThrow().hostUserId()).isEqualTo(later.userId());
        service.removeUser(later.userId());
        assertThat(service.find(room.id())).isEmpty();
        assertThat(service.list()).isEmpty();
    }

    @Test
    void readinessRequiresCurrentMembershipAndOnlyChangesVersionWhenChanged() {
        RoomActor host = actor();
        expect(ErrorCode.ROOM_NOT_JOINED, () -> service.ready(host, true));
        var room = service.create(host);
        expect(ErrorCode.ROOM_NOT_JOINED, () -> service.ready(reconnect(host), true));
        assertThat(service.ready(host, false).version()).isEqualTo(room.version());
        var ready = service.ready(host, true);
        assertThat(ready.version()).isEqualTo(room.version() + 1);
        assertThat(ready.players().getFirst().ready()).isTrue();
        service.disconnect(host);
        expect(ErrorCode.ROOM_NOT_JOINED, () -> service.ready(host, false));
    }

    @Test
    void chatValidatesUnicodeLengthCooldownAndRetainsLastThirty() {
        RoomActor host = actor();
        var initial = service.create(host);
        expect(ErrorCode.INVALID_CHAT, () -> service.chat(host, "  "));
        expect(ErrorCode.INVALID_CHAT, () -> service.chat(host, null));
        expect(ErrorCode.INVALID_CHAT, () -> service.chat(host, "😀".repeat(101)));
        var first = service.chat(host, "  " + "😀".repeat(100) + "  ");
        assertThat(first.chats().getFirst().body()).isEqualTo("😀".repeat(100));
        assertThat(first.version()).isEqualTo(initial.version() + 1);
        expect(ErrorCode.CHAT_RATE_LIMITED, () -> service.chat(host, "fast"));
        clock.advance(999);
        expect(ErrorCode.CHAT_RATE_LIMITED, () -> service.chat(host, "still fast"));
        clock.advance(1);
        for (int i = 0; i < 31; i++) {
            service.chat(host, "message " + i);
            clock.advance(1000);
        }
        var chats = service.find(initial.id()).orElseThrow().chats();
        assertThat(chats).hasSize(30);
        assertThat(chats.getFirst().body()).isEqualTo("message 1");
        assertThat(chats.getLast().id()).isEqualTo(32);
        assertThat(chats.getLast().at()).isEqualTo(clock.instant().minusSeconds(1).toEpochMilli());
        assertThat(first.chats()).hasSize(1);
    }

    @Test
    void eventSubscribersCanReadAndMutateFromAnotherThreadWithoutLockedPublisher() throws Exception {
        try (var pool = Executors.newSingleThreadExecutor()) {
            RoomService[] observed = new RoomService[1];
            RoomActor host = actor();
            observed[0] = new RoomService(clock, event -> {
                try {
                    pool.submit(() -> {
                        observed[0].list();
                        observed[0].roomId(host);
                        return observed[0].find(((RoomChangedEvent) event).roomId());
                    }).get(2, TimeUnit.SECONDS);
                } catch (Exception exception) { throw new AssertionError(exception); }
            });
            var room = observed[0].create(host);
            observed[0].ready(host, true);
            observed[0].disconnect(host);
            clock.advance(30_000);
            observed[0].expireDisconnected();
            assertThat(observed[0].find(room.id())).isEmpty();
        }
    }

    @Test
    void logoutImmediatelyRemovesDisconnectedReservation() {
        RoomActor user = actor();
        var room = service.create(user);
        service.disconnect(user);
        service.removeUser(user.userId());
        assertThat(service.roomId(user.userId())).isEmpty();
        assertThat(service.find(room.id())).isEmpty();
        service.removeUser(user.userId());
        assertThat(service.create(reconnect(user)).players()).hasSize(1);
    }

    @Test
    void simultaneousConnectionsForOneUserCannotStealASeat() throws Exception {
        var room = service.create(actor());
        RoomActor first = actor();
        RoomActor second = reconnect(first);
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            List<Future<Boolean>> results = new ArrayList<>();
            for (RoomActor candidate : List.of(first, second)) results.add(pool.submit(() -> {
                start.await();
                try { service.join(candidate, room.id()); return true; }
                catch (CustomException exception) {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.ROOM_CONNECTION_CONFLICT);
                    return false;
                }
            }));
            start.countDown();
            assertThat(List.of(results.get(0).get(5, TimeUnit.SECONDS), results.get(1).get(5, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertThat(service.find(room.id()).orElseThrow().players()).hasSize(2);
    }

    @Test
    void globalRoomLimitReleasesSlotWhenEmptyRoomIsRemoved() {
        RoomActor first = actor();
        service.create(first);
        for (int i = 1; i < 1000; i++) service.create(actor());
        expect(ErrorCode.ROOM_SERVER_FULL, () -> service.create(actor()));
        service.removeUser(first.userId());
        service.create(actor());
        assertThat(service.list()).hasSize(1000);
    }

    private static RoomActor actor() {
        return new RoomActor(UUID.randomUUID(), UUID.randomUUID().toString(), "곰", "bear");
    }

    private static RoomActor reconnect(RoomActor actor) {
        return new RoomActor(actor.userId(), UUID.randomUUID().toString(), actor.nickname(), actor.avatarCode());
    }

    private static void expect(ErrorCode code, Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(CustomException.class,
                exception -> assertThat(exception.getErrorCode()).isEqualTo(code));
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-02T00:00:00Z");
        void advance(long millis) { now = now.plusMillis(millis); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
