package com.nackchal.domain.user.dto.response;

import com.nackchal.domain.user.entity.User;
import java.util.UUID;

/**
 * 로그인한 계정의 공개 프로필. 이메일과 인증 정보는 포함하지 않는다
 */
public record UserResponse(UUID id, String nickname, String avatarCode) {

    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getNickname(), user.getAvatarCode());
    }
}
