package com.nackchal.domain.user.dto.request;

import com.nackchal.domain.user.entity.User;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** 캐릭터 바꾸기 요청. */
public record AvatarChangeRequest(
        @NotNull(message = "캐릭터를 골라 주세요.")
        @Pattern(regexp = User.AVATAR_PATTERN, message = "고를 수 있는 캐릭터가 아니에요.")
        String avatarCode
) {}
