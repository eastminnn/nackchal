package com.nackchal.domain.user.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.room.service.RoomService;
import com.nackchal.domain.user.dto.response.UserResponse;
import com.nackchal.domain.user.entity.User;
import com.nackchal.domain.user.repository.UserRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 프로필 변경. */
@Service
public class UserService {

    private final UserRepository userRepository;
    private final RoomService roomService;

    public UserService(UserRepository userRepository, RoomService roomService) {
        this.userRepository = userRepository;
        this.roomService = roomService;
    }

    /**
     * 캐릭터를 바꾼다. 방 안(재접속 대기 자리 포함)에서는 다른 참가자 화면과 게임 기록이 어긋나므로 막는다.
     * 방 잠금을 잡은 채 DB를 기다리지 않으려고 확인과 저장을 따로 한다. 그 사이 다른 탭에서 방에 들어가면
     * 그 방에서는 다시 들어올 때까지 이전 캐릭터로 보인다.
     * @throws CustomException PROFILE_LOCKED_IN_ROOM, UNAUTHORIZED
     */
    @Transactional
    public UserResponse changeAvatar(UUID userId, String avatarCode) {
        if (roomService.roomId(userId).isPresent()) throw new CustomException(ErrorCode.PROFILE_LOCKED_IN_ROOM);
        User user = userRepository.findById(userId).orElseThrow(() -> new CustomException(ErrorCode.UNAUTHORIZED));
        user.changeAvatar(avatarCode);
        return UserResponse.from(user);
    }
}
