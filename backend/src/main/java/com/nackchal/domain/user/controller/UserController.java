package com.nackchal.domain.user.controller;

import com.nackchal.domain.user.dto.request.AvatarChangeRequest;
import com.nackchal.domain.user.dto.response.UserResponse;
import com.nackchal.domain.user.event.ProfileChangedEvent;
import com.nackchal.domain.user.service.UserService;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 내 프로필. 사용자는 검증한 JWT에서만 정한다. */
@RestController
@RequestMapping("/api/users/me")
public class UserController {

    private final UserService userService;
    private final ApplicationEventPublisher events;

    public UserController(UserService userService, ApplicationEventPublisher events) {
        this.userService = userService;
        this.events = events;
    }

    @PatchMapping("/avatar")
    public UserResponse changeAvatar(@Valid @RequestBody AvatarChangeRequest request, Principal principal) {
        UserResponse user = userService.changeAvatar(UUID.fromString(principal.getName()), request.avatarCode());
        // 커밋된 뒤에 알려, 다시 연결하지 않아도 다음 방부터 새 캐릭터로 앉는다.
        events.publishEvent(new ProfileChangedEvent(user.id(), user.nickname(), user.avatarCode()));
        return user;
    }
}
