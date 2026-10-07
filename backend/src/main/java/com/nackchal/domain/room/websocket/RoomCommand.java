package com.nackchal.domain.room.websocket;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.nackchal.domain.room.model.EmoteKind;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
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
        @JsonSubTypes.Type(value = RoomCommand.Ping.class, name = "PING"),
        @JsonSubTypes.Type(value = RoomCommand.StartGame.class, name = "START_GAME"),
        @JsonSubTypes.Type(value = RoomCommand.PlaceBid.class, name = "PLACE_BID"),
        @JsonSubTypes.Type(value = RoomCommand.Emote.class, name = "EMOTE"),
        @JsonSubTypes.Type(value = RoomCommand.UseItem.class, name = "USE_ITEM")
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
    record StartGame(@NotNull UUID requestId) implements RoomCommand {}
    record Emote(@NotNull UUID requestId, @NotNull EmoteKind emote) implements RoomCommand {}
    /** item은 아이템 코드, targetUserId는 맞힐 참가자. 던지는 사람은 연결의 사용자다. */
    record UseItem(@NotNull UUID requestId, @NotNull @Pattern(regexp = "[a-z]{1,32}") String item,
                   @NotNull UUID targetUserId) implements RoomCommand {}
    /** amount는 증가분이 아니라 최종 입찰 금액. expectedBidVersion은 클라이언트가 마지막으로 본 입찰 버전. */
    record PlaceBid(@NotNull UUID requestId, @NotNull UUID gameId, @NotNull @Positive Integer round,
                    @NotNull @PositiveOrZero Long expectedBidVersion, @NotNull @Positive Integer amount)
            implements RoomCommand {}
}
