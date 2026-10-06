package com.nackchal.domain.room.websocket;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** 클라이언트가 보내는 방 명령. JSON의 type 값으로 구체 타입을 정하고 requestId로 재전송을 식별한다. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = RoomCommand.Create.class, name = "CREATE_ROOM"),
        @JsonSubTypes.Type(value = RoomCommand.Join.class, name = "JOIN_ROOM"),
        @JsonSubTypes.Type(value = RoomCommand.Leave.class, name = "LEAVE_ROOM"),
        @JsonSubTypes.Type(value = RoomCommand.Ready.class, name = "SET_READY"),
        @JsonSubTypes.Type(value = RoomCommand.Chat.class, name = "SEND_CHAT"),
        @JsonSubTypes.Type(value = RoomCommand.Ping.class, name = "PING")
})
sealed interface RoomCommand {
    UUID requestId();

    record Create(@NotNull UUID requestId) implements RoomCommand {}
    record Join(@NotNull UUID requestId, @NotNull @Pattern(regexp = "[A-Z0-9]{6}") String roomId)
            implements RoomCommand {}
    record Leave(@NotNull UUID requestId) implements RoomCommand {}
    record Ready(@NotNull UUID requestId, @NotNull Boolean ready) implements RoomCommand {}
    record Chat(@NotNull UUID requestId, @NotBlank @Size(max = 400) String body) implements RoomCommand {}
    record Ping(@NotNull UUID requestId) implements RoomCommand {}
}
