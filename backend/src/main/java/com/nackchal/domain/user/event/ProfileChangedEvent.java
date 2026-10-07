package com.nackchal.domain.user.event;

import java.util.UUID;

/** 프로필이 바뀐 뒤(트랜잭션 커밋 후) 발행한다. 본인의 열린 연결이 새 캐릭터로 다음 방에 들어가게 한다. */
public record ProfileChangedEvent(UUID userId, String nickname, String avatarCode) {}
