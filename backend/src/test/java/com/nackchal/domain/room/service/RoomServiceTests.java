package com.nackchal.domain.room.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.auction.model.AuctionRules;
import com.nackchal.domain.auction.model.GameSettlement;
import com.nackchal.domain.game.service.GameSettlementDispatcher;
import com.nackchal.domain.game.service.GameStart;
import com.nackchal.domain.room.dto.response.RoomResponse;
import com.nackchal.domain.wallet.event.WalletChangedEvent;
import com.nackchal.domain.room.model.RoomActor;
import com.nackchal.domain.room.model.RoomChangedEvent;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
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
    private final FakeGameRecords records = new FakeGameRecords();
    /** 기본은 제출 즉시 같은 스레드에서 정산한다. deferSettlements()로 나중에 실행할 수 있다. */
    private final List<Runnable> queuedSettlements = new CopyOnWriteArrayList<>();
    private volatile boolean deferSettlements;
    private final RoomService service = new RoomService(clock, events::add, records,
            new GameSettlementDispatcher(records, task -> {
                if (deferSettlements) queuedSettlements.add(task);
                else task.run();
            }, List.of()), AuctionRules.DEFAULT);

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
            }, records, new GameSettlementDispatcher(records, Runnable::run, List.of()), AuctionRules.DEFAULT);
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

    @Test
    void onlyHostStartsWhenTwoConnectedPlayersAndEveryGuestIsReady() {
        RoomActor host = actor();
        var room = service.create(host);
        expect(ErrorCode.GAME_NOT_ENOUGH_PLAYERS, () -> service.startGame(host));
        RoomActor guest = actor();
        RoomActor late = actor();
        service.join(guest, room.id());
        service.join(late, room.id());
        expect(ErrorCode.GAME_NOT_HOST, () -> service.startGame(guest));
        service.ready(guest, true);
        expect(ErrorCode.GAME_PLAYERS_NOT_READY, () -> service.startGame(host));
        service.ready(late, true);
        service.disconnect(late);
        expect(ErrorCode.GAME_PLAYERS_NOT_READY, () -> service.startGame(host));
        RoomActor lateAgain = reconnect(late);
        service.join(lateAgain, room.id());
        service.ready(lateAgain, true);

        var started = service.startGame(host);
        assertThat(started.game().status()).isEqualTo("AUCTION");
        assertThat(started.game().players()).hasSize(3);
        expect(ErrorCode.GAME_ALREADY_STARTED, () -> service.startGame(host));
        assertThat(service.list()).singleElement()
                .satisfies(summary -> assertThat(summary.status()).isEqualTo("playing"));
    }

    @Test
    void gameBlocksNewPlayersAndReadyButAllowsReconnect() {
        RoomActor host = actor();
        RoomActor guest = actor();
        var room = startedRoom(host, guest);
        expect(ErrorCode.ROOM_IN_GAME, () -> service.join(actor(), room.id()));
        expect(ErrorCode.GAME_ALREADY_STARTED, () -> service.ready(guest, false));
        service.disconnect(guest);
        var rejoined = service.join(reconnect(guest), room.id());
        assertThat(rejoined.game().players()).extracting(player -> player.userId()).contains(guest.userId());
        assertThat(rejoined.game().status()).isEqualTo("AUCTION");
    }

    @Test
    void simultaneousBidsOnSameVersionAcceptExactlyOne() throws Exception {
        RoomActor host = actor();
        List<RoomActor> guests = List.of(actor(), actor(), actor());
        var room = startedRoom(host, guests.toArray(RoomActor[]::new));
        var game = room.game();
        List<RoomActor> bidders = new ArrayList<>(guests);
        bidders.add(host);
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(bidders.size())) {
            List<Future<ErrorCode>> results = new ArrayList<>();
            for (RoomActor bidder : bidders) results.add(pool.submit(() -> {
                start.await();
                try { service.placeBid(bidder, game.gameId(), 1, 0, 10); return null; }
                catch (CustomException exception) { return exception.getErrorCode(); }
            }));
            start.countDown();
            List<ErrorCode> codes = new ArrayList<>();
            for (var result : results) codes.add(result.get(5, TimeUnit.SECONDS));
            assertThat(codes.stream().filter(Objects::isNull).count()).as(codes.toString()).isEqualTo(1);
            assertThat(codes).filteredOn(code -> code != null).containsOnly(ErrorCode.BID_STALE);
        }
        var auction = service.find(room.id()).orElseThrow().game().auction();
        assertThat(auction.price()).isEqualTo(10);
        assertThat(auction.bidVersion()).isEqualTo(1);
    }

    @Test
    void timerAdvancesPhasesAndFinishedGameRequiresReadyAgain() {
        RoomActor host = actor();
        RoomActor guest = actor();
        var room = startedRoom(host, guest);
        long version = room.version();
        events.clear();
        service.advanceGames();
        assertThat(events).isEmpty();
        clock.advance(20_000);
        service.advanceGames();
        var sold = service.find(room.id()).orElseThrow();
        assertThat(sold.game().status()).isEqualTo("SOLD");
        assertThat(sold.version()).isGreaterThan(version);
        assertThat(events).containsExactly(new RoomChangedEvent(room.id()));

        clock.advance(28_000 * 10);
        service.advanceGames();
        var finished = service.find(room.id()).orElseThrow();
        assertThat(finished.game().status()).isEqualTo("FINISHED");
        assertThat(finished.game().result().ranking()).hasSize(2);
        assertThat(finished.players()).noneMatch(player -> player.ready());
        assertThat(service.list()).singleElement()
                .satisfies(summary -> assertThat(summary.status()).isEqualTo("waiting"));
        service.join(actor(), room.id());
    }

    @Test
    void leavingDownToOnePlayerAbortsGame() {
        RoomActor host = actor();
        RoomActor guest = actor();
        var room = startedRoom(host, guest);
        service.leave(guest);
        var aborted = service.find(room.id()).orElseThrow();
        assertThat(aborted.game().status()).isEqualTo("ABORTED");
        assertThat(aborted.game().players()).filteredOn(player -> player.left())
                .extracting(player -> player.userId()).containsExactly(guest.userId());
        service.ready(host, true);
    }

    @Test
    void startRecordsGameBeforeTimerStarts() {
        RoomActor host = actor();
        RoomActor guest = actor();
        records.duringStart = () -> clock.advance(500);
        Instant before = clock.instant();
        var room = startedRoom(host, guest);

        var start = records.starts.getFirst();
        assertThat(start.gameId()).isEqualTo(room.game().gameId());
        assertThat(start.roomCode()).isEqualTo(room.id());
        assertThat(start.rulesVersion()).isEqualTo("auction-v1");
        assertThat(start.startedAt()).isEqualTo(before);
        assertThat(start.seats()).extracting(GameStart.Seat::userId).containsExactly(host.userId(), guest.userId());
        assertThat(start.seats()).extracting(GameStart.Seat::nickname).containsExactly(host.nickname(), guest.nickname());
        assertThat(room.game().phaseEndsAt()).as("타이머는 DB 기록 뒤부터")
                .isEqualTo(before.plusMillis(500 + 20_000).toEpochMilli());
        assertThat(room.starting()).isFalse();
    }

    @Test
    void failedStartRecordRestoresRoomAndCanRetry() {
        RoomActor host = actor();
        RoomActor guest = actor();
        var room = service.create(host);
        service.join(guest, room.id());
        service.ready(guest, true);
        records.failStart = true;

        expect(ErrorCode.GAME_START_FAILED, () -> service.startGame(host));
        var restored = service.find(room.id()).orElseThrow();
        assertThat(restored.game()).isNull();
        assertThat(restored.starting()).isFalse();
        assertThat(restored.players()).filteredOn(player -> player.userId().equals(guest.userId()))
                .singleElement().satisfies(player -> assertThat(player.ready()).isTrue());

        records.failStart = false;
        assertThat(service.startGame(host).game().status()).isEqualTo("AUCTION");
    }

    @Test
    void startingRoomBlocksEntryAndReadyUntilRecorded() throws Exception {
        RoomActor host = actor();
        RoomActor guest = actor();
        var room = service.create(host);
        service.join(guest, room.id());
        service.ready(guest, true);
        records.holdNextStart();
        try (var pool = Executors.newSingleThreadExecutor()) {
            var started = pool.submit(() -> service.startGame(host));
            records.awaitStartEntered();

            assertThat(service.find(room.id()).orElseThrow().starting()).isTrue();
            assertThat(service.list()).singleElement()
                    .satisfies(summary -> assertThat(summary.status()).isEqualTo("playing"));
            expect(ErrorCode.ROOM_IN_GAME, () -> service.join(actor(), room.id()));
            expect(ErrorCode.GAME_ALREADY_STARTED, () -> service.ready(guest, false));
            expect(ErrorCode.GAME_ALREADY_STARTED, () -> service.startGame(host));

            records.release();
            assertThat(started.get(5, TimeUnit.SECONDS).game().status()).isEqualTo("AUCTION");
        }
    }

    @Test
    void leavingWhileStartingAbortsAndSettlesOnce() throws Exception {
        RoomActor host = actor();
        RoomActor guest = actor();
        var room = service.create(host);
        service.join(guest, room.id());
        service.ready(guest, true);
        records.holdNextStart();
        try (var pool = Executors.newSingleThreadExecutor()) {
            var started = pool.submit(() -> service.startGame(host));
            records.awaitStartEntered();
            service.leave(guest);
            records.release();

            assertThat(started.get(5, TimeUnit.SECONDS).game().status()).isEqualTo("ABORTED");
            assertThat(service.find(room.id()).orElseThrow().game().settlement()).isEqualTo("COMPLETED");
        }
        assertThat(records.settlements).singleElement().satisfies(settlement -> {
            assertThat(settlement.outcome()).isEqualTo(GameSettlement.Outcome.ABORTED);
            assertThat(settlement.participants()).filteredOn(GameSettlement.Participant::left)
                    .extracting(GameSettlement.Participant::userId).containsExactly(guest.userId());
        });
    }

    @Test
    void everyoneLeavingWhileStartingStillClosesTheRecord() throws Exception {
        RoomActor host = actor();
        RoomActor guest = actor();
        var room = service.create(host);
        service.join(guest, room.id());
        service.ready(guest, true);
        records.holdNextStart();
        try (var pool = Executors.newSingleThreadExecutor()) {
            var started = pool.submit(() -> service.startGame(host));
            records.awaitStartEntered();
            service.leave(guest);
            service.leave(host);
            records.release();
            var error = org.assertj.core.api.Assertions.catchThrowable(() -> started.get(5, TimeUnit.SECONDS));
            assertThat(error).hasCauseInstanceOf(CustomException.class);
        }
        assertThat(service.find(room.id())).isEmpty();
        assertThat(records.settlements).singleElement().satisfies(settlement -> {
            assertThat(settlement.outcome()).isEqualTo(GameSettlement.Outcome.ABORTED);
            assertThat(settlement.participants()).allMatch(GameSettlement.Participant::left);
        });
    }

    @Test
    void finishedGameIsSettledOnceAndPublishesWallets() {
        RoomActor host = actor();
        RoomActor guest = actor();
        var room = startedRoom(host, guest);
        records.balances = java.util.Map.of(host.userId(), 10L, guest.userId(), 10L);
        clock.advance(28_000 * 10);
        service.advanceGames();
        service.advanceGames();

        assertThat(records.settlements).singleElement().satisfies(settlement -> {
            assertThat(settlement.gameId()).isEqualTo(room.game().gameId());
            assertThat(settlement.outcome()).isEqualTo(GameSettlement.Outcome.FINISHED);
            assertThat(settlement.rounds()).hasSize(10);
        });
        assertThat(service.find(room.id()).orElseThrow().game().settlement()).isEqualTo("COMPLETED");
        assertThat(events).filteredOn(WalletChangedEvent.class::isInstance).containsExactlyInAnyOrder(
                new WalletChangedEvent(host.userId(), 10), new WalletChangedEvent(guest.userId(), 10));
    }

    @Test
    void settlementShowsPendingUntilDoneAndFailedOnError() {
        RoomActor host = actor();
        RoomActor guest = actor();
        var room = startedRoom(host, guest);
        deferSettlements = true;
        records.failSettle = true;
        clock.advance(28_000 * 10);
        service.advanceGames();
        assertThat(service.find(room.id()).orElseThrow().game().settlement()).isEqualTo("PENDING");

        long version = service.find(room.id()).orElseThrow().version();
        queuedSettlements.forEach(Runnable::run);
        var failed = service.find(room.id()).orElseThrow();
        assertThat(failed.game().settlement()).isEqualTo("FAILED");
        assertThat(failed.version()).isGreaterThan(version);
        assertThat(events).noneMatch(WalletChangedEvent.class::isInstance);
    }

    @Test
    void lateSettlementDoesNotTouchTheNextGame() {
        RoomActor host = actor();
        RoomActor guest = actor();
        var room = startedRoom(host, guest);
        deferSettlements = true;
        clock.advance(28_000 * 10);
        service.advanceGames();
        service.ready(guest, true);
        var next = service.startGame(host).game();

        queuedSettlements.forEach(Runnable::run);
        var current = service.find(room.id()).orElseThrow().game();
        assertThat(current.gameId()).isEqualTo(next.gameId());
        assertThat(current.settlement()).isNull();
    }

    @Test
    void everyWayOfLeavingSettlesAbortedGameOnce() {
        RoomActor host = actor();
        RoomActor guest = actor();
        startedRoom(host, guest);
        service.removeUser(guest.userId());
        assertThat(records.settlements).singleElement()
                .satisfies(settlement -> assertThat(settlement.outcome()).isEqualTo(GameSettlement.Outcome.ABORTED));

        RoomActor otherHost = actor();
        RoomActor otherGuest = actor();
        startedRoom(otherHost, otherGuest);
        service.disconnect(otherGuest);
        clock.advance(30_000);
        service.expireDisconnected();
        assertThat(records.settlements).hasSize(2);
    }

    private RoomResponse startedRoom(RoomActor host, RoomActor... guests) {
        var room = service.create(host);
        for (RoomActor guest : guests) {
            service.join(guest, room.id());
            service.ready(guest, true);
        }
        return service.startGame(host);
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
        private volatile Instant now = Instant.parse("2026-10-02T00:00:00Z");
        void advance(long millis) { now = now.plusMillis(millis); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
