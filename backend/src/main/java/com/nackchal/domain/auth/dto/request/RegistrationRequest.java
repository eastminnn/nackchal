package com.nackchal.domain.auth.dto.request;

import com.nackchal.domain.auth.service.EmailNormalizer;
import com.nackchal.domain.user.entity.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 이메일 가입 요청. 비밀번호는 공백을 포함해 입력한 값을 그대로 사용한다.
 * 캐릭터를 고르지 않으면 곰으로 시작한다
 */
public record RegistrationRequest(
        @NotBlank(message = "이메일을 입력해 주세요.")
        @Email(message = "이메일 형식을 확인해 주세요.")
        @Size(max = 254, message = "이메일은 254자까지 입력할 수 있어요.")
        String email,

        @NotBlank(message = "비밀번호를 입력해 주세요.")
        @Size(min = 10, max = 128, message = "비밀번호는 10~128자로 입력해 주세요.")
        String password,

        @NotBlank(message = "닉네임을 입력해 주세요.")
        @Pattern(regexp = "[\\p{L}\\p{N}_-]{1,12}", message = "닉네임은 글자·숫자·밑줄·하이픈 1~12자로 입력해 주세요.")
        String nickname,

        @Pattern(regexp = User.AVATAR_PATTERN, message = "고를 수 있는 캐릭터가 아니에요.")
        String avatarCode
) {

    public RegistrationRequest {
        email = email == null ? null : EmailNormalizer.normalize(email);
        nickname = nickname == null ? null : nickname.strip();
    }
}
