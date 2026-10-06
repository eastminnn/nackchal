package com.nackchal.domain.room.model;

/** 방 상태가 바뀌었음을 알리는 이벤트. RoomConnections가 받아 목록과 방 상태를 방송한다. */
public record RoomChangedEvent(String roomId) {}
