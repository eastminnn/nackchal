package com.nackchal.domain.room.websocket;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Testcontainers
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.rooms.allowed-origins=http://rooms.test")
class RoomWebSocketIntegrationTests {
    private static final String ORIGIN = "http://rooms.test";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    @Container @ServiceConnection
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18-alpine");

    @LocalServerPort int port;

    @Test
    void twoAccountsCreateJoinReadyAndChatUsingAuthenticatedIdentity() throws Exception {
        try (var host = account("방장"); var guest = account("참가자")) {
            var first = host.connect();
            var second = guest.connect();
            assertThat(first.welcome.path("activeRoomId").isNull()).isTrue();
            String roomId = create(first);
            assertThat(roomId).matches("[A-Z0-9]{6}");
            join(second, roomId);
            var joined = first.state(roomId, room -> room.path("players").size() == 2);
            assertThat(joined.path("hostUserId").stringValue()).isEqualTo(host.userId);
            assertThat(joined.path("capacity").intValue()).isEqualTo(4);
            assertThat(player(joined, host.userId).path("seat").intValue()).isZero();
            assertThat(player(joined, guest.userId).path("seat").intValue()).isEqualTo(1);
            assertThat(player(joined, guest.userId).path("nickname").stringValue()).isEqualTo("참가자");
            assertThat(player(joined, guest.userId).path("avatarCode").stringValue()).isNotBlank();

            second.accept("SET_READY", Map.of("ready", true, "userId", host.userId));
            var ready = first.state(roomId, room -> player(room, guest.userId).path("ready").booleanValue());
            assertThat(player(ready, host.userId).path("ready").booleanValue()).isFalse();
            assertThat(ready.path("version").longValue()).isGreaterThan(joined.path("version").longValue());

            second.accept("SEND_CHAT", Map.of("body", "  함께 경매해요  ", "userId", host.userId));
            var chatted = first.state(roomId, room -> room.path("chats").size() == 1);
            var chat = chatted.path("chats").get(0);
            assertThat(chat.path("userId").stringValue()).isEqualTo(guest.userId);
            assertThat(chat.path("nickname").stringValue()).isEqualTo("참가자");
            assertThat(chat.path("body").stringValue()).isEqualTo("함께 경매해요");
            assertThat(chat.path("id").longValue()).isPositive();
            assertThat(chat.path("at").longValue()).isPositive();
            var response = host.get("/api/rooms");
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(JSON.readTree(response.body()).isArray()).isTrue();
            assertThat(response.body()).contains(roomId).doesNotContain("함께 경매해요", "\"chats\"");
        }
    }

    @Test
    void fifthPlayerAndDuplicateTabCannotTakeSeatsOrDisableOriginalSocket() throws Exception {
        try (var host = account("방장"); var a = account("하나"); var b = account("둘");
             var c = account("셋"); var fifth = account("다섯")) {
            var original = host.connect();
            String roomId = create(original);
            join(a.connect(), roomId);
            join(b.connect(), roomId);
            join(c.connect(), roomId);
            var full = original.state(roomId, room -> room.path("players").size() == 4);
            assertThat(full.path("players")).hasSize(4);
            fifth.connect().reject("JOIN_ROOM", Map.of("roomId", roomId), 409, "ROOM_FULL");
            var duplicate = host.connect();
            duplicate.reject("JOIN_ROOM", Map.of("roomId", roomId), 409, "ROOM_CONNECTION_CONFLICT");
            duplicate.reject("SET_READY", Map.of("ready", true), 403, "ROOM_NOT_JOINED");
            duplicate.barrier();
            assertThat(duplicate.history).noneMatch(node -> type(node, "ROOM_STATE"));
            duplicate.closeNormally();
            original.accept("SET_READY", Map.of("ready", true));
            var usable = original.state(roomId, room -> player(room, host.userId).path("ready").booleanValue());
            assertThat(usable.path("players")).hasSize(4);
            assertThat(player(usable, host.userId).path("connected").booleanValue()).isTrue();
            var list = JSON.readTree(host.get("/api/rooms").body());
            var summary = find(list, room -> room.path("id").stringValue().equals(roomId));
            assertThat(summary.path("status").stringValue()).isEqualTo("full");
            assertThat(summary.path("players").intValue()).isEqualTo(4);
        }
    }

    @Test
    void disconnectedPlayerRejoinsSameSeatWithReadyReset() throws Exception {
        try (var host = account("방장"); var guest = account("참가자")) {
            var observer = host.connect();
            var original = guest.connect();
            String roomId = create(observer);
            join(original, roomId);
            original.accept("SET_READY", Map.of("ready", true));
            observer.state(roomId, room -> player(room, guest.userId).path("ready").booleanValue());
            original.closeNormally();
            var disconnected = observer.state(roomId,
                    room -> !player(room, guest.userId).path("connected").booleanValue());
            assertThat(disconnected.path("players")).hasSize(2);
            assertThat(player(disconnected, guest.userId).path("ready").booleanValue()).isFalse();
            int seat = player(disconnected, guest.userId).path("seat").intValue();

            var replacement = guest.connect();
            assertThat(replacement.welcome.path("activeRoomId").stringValue()).isEqualTo(roomId);
            join(replacement, roomId);
            var rejoined = observer.state(roomId,
                    room -> room.path("version").longValue() > disconnected.path("version").longValue()
                            && player(room, guest.userId).path("connected").booleanValue());
            assertThat(player(rejoined, guest.userId).path("seat").intValue()).isEqualTo(seat);
            assertThat(rejoined.path("players")).hasSize(2);
            replacement.accept("SET_READY", Map.of("ready", true));
            var usable = observer.state(roomId, room -> player(room, guest.userId).path("ready").booleanValue());
            assertThat(player(usable, guest.userId).path("connected").booleanValue()).isTrue();
        }
    }

    @Test
    void leavingTransfersHostToOldestRemainingPlayerAndDeletesEmptyRoom() throws Exception {
        try (var host = account("방장"); var oldest = account("첫손님"); var newest = account("둘째손님")) {
            var first = host.connect();
            var second = oldest.connect();
            var third = newest.connect();
            String roomId = create(first);
            join(second, roomId);
            join(third, roomId);
            first.accept("LEAVE_ROOM", Map.of());
            first.await(node -> type(node, "LEFT"));
            var transferred = second.state(roomId, room -> room.path("players").size() == 2
                    && room.path("hostUserId").stringValue().equals(oldest.userId));
            assertThat(transferred.path("players")).hasSize(2);
            first.reject("SET_READY", Map.of("ready", true), 403, "ROOM_NOT_JOINED");
            second.accept("LEAVE_ROOM", Map.of());
            third.state(roomId, room -> room.path("players").size() == 1
                    && room.path("hostUserId").stringValue().equals(newest.userId));
            third.accept("LEAVE_ROOM", Map.of());
            third.await(node -> type(node, "LEFT"));
            assertThat(host.get("/api/rooms").body()).doesNotContain(roomId);
            first.reject("JOIN_ROOM", Map.of("roomId", roomId), 404, "ROOM_NOT_FOUND");
            first.accept("CREATE_ROOM", Map.of());
            var recreated = first.await(node -> type(node, "ROOM_STATE")
                    && !roomId.equals(node.path("room").path("id").stringValue()));
            assertThat(recreated.path("room").path("id").stringValue()).matches("[A-Z0-9]{6}");
        }
    }

    @Test
    void handshakeRequiresAuthenticationAndTrustedOriginAndPrivateEventsStayInOwnRoom() throws Exception {
        try (var anonymous = new Browser(); var host = account("방장"); var guest = account("손님");
             var lobby = account("로비"); var outsider = account("다른방")) {
            assertThat(anonymous.get("/api/rooms").statusCode()).isEqualTo(401);
            assertHandshake(anonymous, ORIGIN, 401);
            assertHandshake(host, "http://untrusted.test", 403);
            assertHandshake(host, null, 403);
            var member = host.connect();
            var peer = guest.connect();
            var spectator = lobby.connect();
            var other = outsider.connect();
            String privateRoom = create(member);
            String otherRoom = create(other);
            join(peer, privateRoom);
            member.reject("JOIN_ROOM", Map.of("roomId", otherRoom), 409, "ROOM_ALREADY_JOINED");
            peer.accept("SEND_CHAT", Map.of("body", "비공개대화"));
            member.state(privateRoom, room -> room.path("chats").size() == 1);
            var listing = spectator.await(node -> type(node, "ROOM_LIST")
                    && node.path("rooms").toString().contains(privateRoom)
                    && node.path("rooms").toString().contains(otherRoom));
            assertThat(listing.path("version").longValue()).isPositive();
            assertThat(listing.path("rooms").toString()).doesNotContain("\"chats\"", "\"userId\"");
            spectator.barrier();
            other.barrier();
            assertThat(spectator.history).noneMatch(node -> type(node, "ROOM_STATE"));
            assertThat(other.history).filteredOn(node -> type(node, "ROOM_STATE"))
                    .allSatisfy(node -> assertThat(node.path("room").path("id").stringValue()).isEqualTo(otherRoom));
            assertThat(spectator.history.toString()).doesNotContain("비공개대화");
            assertThat(other.history.toString()).doesNotContain("비공개대화");
            assertThat(lobby.get("/api/rooms").body()).contains(privateRoom, otherRoom).doesNotContain("비공개대화");
        }
    }

    @Test
    void hostStartsGameAndBidsAreBroadcastWithoutHiddenValues() throws Exception {
        try (var host = account("방장"); var guest = account("참가자")) {
            var first = host.connect();
            var second = guest.connect();
            String roomId = create(first);
            join(second, roomId);
            second.reject("START_GAME", Map.of(), 403, "GAME_NOT_HOST");
            second.accept("SET_READY", Map.of("ready", true));
            first.accept("START_GAME", Map.of());

            var started = second.await(node -> type(node, "ROOM_STATE")
                    && node.path("room").path("game").path("status").isString()
                    && node.path("room").path("game").path("status").stringValue().equals("AUCTION"));
            assertThat(started.path("serverTime").longValue()).isPositive();
            var game = started.path("room").path("game");
            String gameId = game.path("gameId").stringValue();
            assertThat(game.path("round").intValue()).isEqualTo(1);
            assertThat(game.path("phaseEndsAt").longValue()).isGreaterThan(started.path("serverTime").longValue());
            assertThat(game.path("reveal").isNull()).isTrue();
            assertThat(game.path("lot").has("value")).isFalse();
            assertThat(game.path("players")).hasSize(2);

            second.accept("PLACE_BID", Map.of("gameId", gameId, "round", 1, "expectedBidVersion", 0,
                    "amount", 12, "userId", host.userId));
            var bid = first.state(roomId, room -> room.path("game").path("auction").path("bidVersion").isNumber()
                    && room.path("game").path("auction").path("bidVersion").longValue() == 1);
            assertThat(bid.path("game").path("auction").path("price").intValue()).isEqualTo(12);
            assertThat(bid.path("game").path("auction").path("leaderUserId").stringValue()).isEqualTo(guest.userId);

            String requestId = first.send("PLACE_BID", Map.of("gameId", gameId, "round", 1,
                    "expectedBidVersion", 0, "amount", 20));
            var stale = first.await(node -> type(node, "ERROR") && requestId.equals(node.path("requestId").stringValue()));
            assertThat(stale.path("error").path("code").stringValue()).isEqualTo("BID_STALE");
            assertThat(stale.path("auction").path("price").intValue()).isEqualTo(12);
            assertThat(stale.path("auction").path("bidVersion").longValue()).isEqualTo(1);

            var outsider = account("구경꾼");
            try (outsider) {
                outsider.connect().reject("JOIN_ROOM", Map.of("roomId", roomId), 409, "ROOM_IN_GAME");
            }
        }
    }

    @Test
    void tokenRefreshExtendsOpenSocketsOfSameUserOnly() throws Exception {
        try (var host = account("방장"); var other = account("손님")) {
            var first = host.connect();
            var second = host.connect();
            var unrelated = other.connect();
            long connectedUntil = first.welcome.path("authExpiresAt").longValue();
            assertThat(connectedUntil).isGreaterThan(System.currentTimeMillis());

            Thread.sleep(1100);
            assertThat(host.post("/api/auth/refresh", Map.of()).statusCode()).isEqualTo(204);
            for (var socket : List.of(first, second)) {
                var renewed = socket.await(node -> type(node, "AUTH_RENEWED"));
                assertThat(renewed.path("expiresAt").longValue()).isGreaterThan(connectedUntil);
            }
            unrelated.barrier();
            assertThat(unrelated.history).noneMatch(node -> type(node, "AUTH_RENEWED"));
            first.barrier();
        }
    }

    @Test
    void httpLogoutImmediatelyClosesSocketAndRemovesParticipant() throws Exception {
        try (var host = account("방장"); var guest = account("손님")) {
            var first = host.connect();
            var second = guest.connect();
            String roomId = create(first);
            join(second, roomId);
            first.state(roomId, room -> room.path("players").size() == 2);
            assertThat(guest.post("/api/auth/logout", Map.of()).statusCode()).isEqualTo(204);
            assertThat(second.closed.get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)).isEqualTo(4403);
            var removed = first.state(roomId, room -> room.path("players").size() == 1);
            assertThat(player(removed, host.userId).path("connected").booleanValue()).isTrue();
            assertThat(guest.get("/api/auth/me").statusCode()).isEqualTo(401);
            var list = JSON.readTree(host.get("/api/rooms").body());
            assertThat(find(list, node -> node.path("id").stringValue().equals(roomId))
                    .path("players").intValue()).isEqualTo(1);
        }
    }

    @Test
    void malformedCommandsAndInvalidChatDoNotBreakConnectionOrExposeInternals() throws Exception {
        try (var host = account("방장")) {
            var socket = host.connect();
            String roomId = create(socket);
            socket.sendRaw("{broken-json");
            assertProtocolError(socket.await(node -> type(node, "ERROR")));
            socket.send("UNKNOWN_COMMAND", Map.of());
            assertProtocolError(socket.await(node -> type(node, "ERROR")));
            socket.reject("SET_READY", Map.of("ready", "true"), 400, null);
            socket.reject("SEND_CHAT", Map.of("body", " "), 400, null);
            socket.reject("SEND_CHAT", Map.of("body", "가".repeat(101)), 400, "INVALID_CHAT");
            socket.accept("SEND_CHAT", Map.of("body", "😀".repeat(100)));
            var chatted = socket.state(roomId, room -> room.path("chats").size() == 1);
            assertThat(chatted.path("chats").get(0).path("body").stringValue()).isEqualTo("😀".repeat(100));
            socket.reject("SEND_CHAT", Map.of("body", "too soon"), 429, "CHAT_RATE_LIMITED");
            socket.barrier();
        }
    }

    private Browser account(String nickname) throws Exception {
        var browser = new Browser();
        try {
            String email = UUID.randomUUID() + "@example.test";
            var input = Map.<String, Object>of("email", email, "password", "Room-test-password-42", "nickname", nickname);
            assertThat(browser.post("/api/auth/register", input).statusCode()).isEqualTo(201);
            assertThat(browser.post("/api/auth/login", input).statusCode()).isEqualTo(204);
            var profile = browser.get("/api/auth/me");
            assertThat(profile.statusCode()).isEqualTo(200);
            browser.userId = JSON.readTree(profile.body()).path("id").stringValue();
            assertThat(browser.userId).isNotBlank();
            return browser;
        } catch (Exception | AssertionError failure) {
            browser.close();
            throw failure;
        }
    }

    private static String create(Socket socket) throws Exception {
        socket.accept("CREATE_ROOM", Map.of());
        return socket.await(node -> type(node, "ROOM_STATE")).path("room").path("id").stringValue();
    }

    private static void join(Socket socket, String roomId) throws Exception {
        socket.accept("JOIN_ROOM", Map.of("roomId", roomId));
        socket.state(roomId, room -> true);
    }

    private static JsonNode player(JsonNode room, String userId) {
        return find(room.path("players"), node -> node.path("userId").stringValue().equals(userId));
    }

    private static JsonNode find(JsonNode nodes, Predicate<JsonNode> predicate) {
        for (JsonNode node : nodes) if (predicate.test(node)) return node;
        throw new AssertionError("Expected matching entry in " + nodes);
    }

    private static boolean type(JsonNode node, String type) {
        return type.equals(node.path("type").stringValue());
    }

    private static void assertProtocolError(JsonNode event) {
        assertThat(event.path("error").path("status").intValue()).isEqualTo(400);
        assertThat(event.path("error").path("code").stringValue()).isNotBlank();
        assertThat(event.path("error").path("message").stringValue()).isNotBlank();
        assertThat(event.path("error").path("errors").isArray()).isTrue();
        assertThat(event.toString()).doesNotContain("java.", "Exception", "stackTrace", "com.nackchal");
    }

    private static void assertHandshake(Browser browser, String origin, int status) {
        assertThatThrownBy(() -> browser.connect(origin)).isInstanceOf(ExecutionException.class)
                .cause().isInstanceOfSatisfying(WebSocketHandshakeException.class,
                        failure -> assertThat(failure.getResponse().statusCode()).isEqualTo(status));
    }

    private final class Browser implements AutoCloseable {
        private final String base = "http://127.0.0.1:" + port;
        private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        private final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies)
                .connectTimeout(TIMEOUT).build();
        private final List<Socket> sockets = new ArrayList<>();
        private String userId;

        HttpResponse<String> get(String path) throws Exception {
            return client.send(HttpRequest.newBuilder(URI.create(base + path)).timeout(TIMEOUT).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
        }

        HttpResponse<String> post(String path, Map<String, Object> fields) throws Exception {
            var csrf = JSON.readTree(get("/api/auth/csrf").body());
            return client.send(HttpRequest.newBuilder(URI.create(base + path)).timeout(TIMEOUT)
                    .header(csrf.path("headerName").stringValue(), csrf.path("token").stringValue())
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(fields))).build(),
                    HttpResponse.BodyHandlers.ofString());
        }

        Socket connect() throws Exception { return connect(ORIGIN); }

        Socket connect(String origin) throws Exception {
            var listener = new Socket();
            var builder = client.newWebSocketBuilder().connectTimeout(TIMEOUT);
            if (origin != null) builder.header("Origin", origin);
            listener.socket = builder.buildAsync(URI.create("ws://127.0.0.1:" + port + "/api/rooms/ws"), listener)
                    .get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            sockets.add(listener);
            listener.welcome = listener.await(node -> type(node, "WELCOME"));
            assertThat(listener.welcome.path("connectionId").stringValue()).isNotBlank();
            return listener;
        }

        @Override public void close() throws Exception {
            try {
                if (userId != null) assertThat(post("/api/auth/logout", Map.of()).statusCode()).isEqualTo(204);
            } finally {
                sockets.forEach(socket -> socket.socket.abort());
                client.shutdownNow();
            }
        }
    }

    private static final class Socket implements WebSocket.Listener {
        private final BlockingQueue<JsonNode> incoming = new LinkedBlockingQueue<>();
        private final List<JsonNode> pending = new ArrayList<>();
        private final List<JsonNode> history = new ArrayList<>();
        private final StringBuilder text = new StringBuilder();
        private final CompletableFuture<Integer> closed = new CompletableFuture<>();
        private WebSocket socket;
        private JsonNode welcome;

        @Override public void onOpen(WebSocket webSocket) { webSocket.request(1); }

        @Override public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            text.append(data);
            if (last) {
                incoming.add(JSON.readTree(text.toString()));
                text.setLength(0);
            }
            webSocket.request(1);
            return null;
        }

        @Override public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            closed.complete(statusCode);
            return null;
        }

        @Override public void onError(WebSocket webSocket, Throwable error) { closed.completeExceptionally(error); }

        void sendRaw(String raw) throws Exception { socket.sendText(raw, true).get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS); }

        String send(String command, Map<String, Object> fields) throws Exception {
            String requestId = UUID.randomUUID().toString();
            var frame = new HashMap<>(fields);
            frame.put("type", command);
            frame.put("requestId", requestId);
            sendRaw(JSON.writeValueAsString(frame));
            return requestId;
        }

        void accept(String command, Map<String, Object> fields) throws Exception {
            String requestId = send(command, fields);
            var event = await(node -> (type(node, "ACK") || type(node, "ERROR"))
                    && node.path("requestId").isString()
                    && requestId.equals(node.path("requestId").stringValue()));
            assertThat(event.path("type").stringValue()).as(event.toString()).isEqualTo("ACK");
        }

        void reject(String command, Map<String, Object> fields, int status, String code) throws Exception {
            String requestId = send(command, fields);
            var event = await(node -> (type(node, "ACK") || type(node, "ERROR"))
                    && node.path("requestId").isString()
                    && requestId.equals(node.path("requestId").stringValue())
                    || type(node, "ERROR") && node.path("requestId").isNull());
            assertThat(event.path("type").stringValue()).isEqualTo("ERROR");
            assertThat(event.path("error").path("status").intValue()).as(event.toString()).isEqualTo(status);
            if (code != null) assertThat(event.path("error").path("code").stringValue()).isEqualTo(code);
            if (status == 400) assertProtocolError(event);
        }

        void barrier() throws Exception {
            String requestId = send("PING", Map.of());
            await(node -> type(node, "PONG") && requestId.equals(node.path("requestId").stringValue()));
        }

        JsonNode state(String roomId, Predicate<JsonNode> predicate) throws Exception {
            return await(node -> type(node, "ROOM_STATE") && roomId.equals(node.path("room").path("id").stringValue())
                    && predicate.test(node.path("room"))).path("room");
        }

        JsonNode await(Predicate<JsonNode> predicate) throws Exception {
            for (int index = 0; index < pending.size(); index++) {
                if (predicate.test(pending.get(index))) return pending.remove(index);
            }
            long deadline = System.nanoTime() + TIMEOUT.toNanos();
            while (System.nanoTime() < deadline) {
                var event = incoming.poll(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(event).as("Expected WebSocket event; received event types: %s",
                        history.stream().map(node -> node.path("type").stringValue()).toList()).isNotNull();
                history.add(event);
                if (predicate.test(event)) return event;
                pending.add(event);
            }
            throw new AssertionError("Timed out awaiting WebSocket event");
        }

        void closeNormally() throws Exception {
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "test complete").get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
            assertThat(closed.get(TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)).isEqualTo(WebSocket.NORMAL_CLOSURE);
        }
    }
}
