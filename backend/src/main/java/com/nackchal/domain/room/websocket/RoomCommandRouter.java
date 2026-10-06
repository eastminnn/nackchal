package com.nackchal.domain.room.websocket;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.common.exception.error.ErrorResponse;
import com.nackchal.domain.room.service.RoomService;
import jakarta.validation.Validator;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.MapperFeature;

/**
 * 검증한 연결에 방 명령을 결합한다. 본문의 사용자 ID나 방장 정보는 사용하지 않는다
 */
@Component
public class RoomCommandRouter {

    private static final Logger log = LoggerFactory.getLogger(RoomCommandRouter.class);
    private final RoomService roomService;
    private final RoomConnections connections;
    private final ObjectMapper objectMapper;
    private final Validator validator;
    private final Clock clock;

    public RoomCommandRouter(
            RoomService roomService, RoomConnections connections, ObjectMapper objectMapper, Validator validator, Clock clock
    ) {
        this.roomService = roomService;
        this.connections = connections;
        this.objectMapper = objectMapper.rebuild().disable(MapperFeature.ALLOW_COERCION_OF_SCALARS).build();
        this.validator = validator;
        this.clock = clock;
    }

    /**
     * 메시지 하나를 처리한다. 초당 20개 제한 → JSON 변환·검증 → 같은 requestId면 이전 응답 재전송 → 명령 실행 순서다.
     * 오류도 ERROR 이벤트로 응답하며 연결은 유지한다.
     */
    public void route(RoomSocketConnection connection, String payload) {
        synchronized (connection) {
            UUID requestId = null;
            try {
                connection.lastSeen = clock.instant();
                if (!connection.lastSeen.isBefore(connection.rateWindow.plusSeconds(1))) {
                    connection.rateWindow = connection.lastSeen;
                    connection.requestCount = 0;
                }
                if (++connection.requestCount > 20) throw new CustomException(ErrorCode.RATE_LIMITED);
                RoomCommand command = objectMapper.readValue(payload, RoomCommand.class);
                requestId = command.requestId();
                if (!validator.validate(command).isEmpty()) throw new CustomException(ErrorCode.INVALID_INPUT_VALUE);
                RoomSocketConnection.Reply previous = connection.replies.get(requestId);
                if (previous != null) {
                    if (!previous.request().equals(payload)) throw new CustomException(ErrorCode.CONFLICT);
                    connections.send(connection, previous.response());
                    return;
                }
                Object reply = execute(connection, command);
                connection.remember(requestId, payload, reply);
                connections.send(connection, reply);
            } catch (JacksonException exception) {
                connections.send(connection, error(requestId, ErrorCode.INVALID_REQUEST_BODY));
            } catch (CustomException exception) {
                Object reply = error(requestId, exception.getErrorCode());
                if (requestId != null && !connection.replies.containsKey(requestId)) {
                    connection.remember(requestId, payload, reply);
                }
                connections.send(connection, reply);
            } catch (RuntimeException exception) {
                log.error("Room command failed: requestId={}", requestId, exception);
                connections.send(connection, error(requestId, ErrorCode.INTERNAL_SERVER_ERROR));
            }
        }
    }

    /** 명령을 RoomService에 전달한다. 사용자는 항상 연결의 RoomActor를 쓰고 본문 값은 믿지 않는다. */
    private Object execute(RoomSocketConnection connection, RoomCommand command) {
        switch (command) {
            case RoomCommand.Create ignored -> roomService.create(connection.actor);
            case RoomCommand.Join join -> {
                var room = roomService.join(connection.actor, join.roomId());
                // 같은 연결의 입장 재시도에도 현재 상태를 돌려준다.
                connections.send(connection, Map.of("type", "ROOM_STATE", "room", room));
            }
            case RoomCommand.Leave ignored -> {
                roomService.leave(connection.actor);
                connections.send(connection, Map.of("type", "LEFT", "reason", "left"));
            }
            case RoomCommand.Ready ready -> roomService.ready(connection.actor, ready.ready());
            case RoomCommand.Chat chat -> roomService.chat(connection.actor, chat.body());
            case RoomCommand.Ping ignored -> {
                return Map.of("type", "PONG", "requestId", command.requestId());
            }
        }
        return Map.of("type", "ACK", "requestId", command.requestId());
    }

    private Object error(UUID requestId, ErrorCode code) {
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("type", "ERROR");
        event.put("requestId", requestId);
        event.put("error", ErrorResponse.of(code));
        return event;
    }
}
