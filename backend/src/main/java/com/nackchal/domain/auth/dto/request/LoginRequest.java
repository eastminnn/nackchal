package com.nackchal.domain.auth.dto.request;

import com.nackchal.domain.auth.service.EmailNormalizer;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 이메일 로그인 요청. 비밀번호 원문은 정규화하지 않는다
 */
public record LoginRequest(
        @NotBlank(message = "이메일을 입력해 주세요.")
        @Size(max = 254, message = "이메일은 254자까지 입력할 수 있어요.")
        String email,

        @NotBlank(message = "비밀번호를 입력해 주세요.")
        @Size(max = 128, message = "비밀번호는 128자까지 입력할 수 있어요.")
        String password
) {
    public LoginRequest {
        email = email == null ? null : EmailNormalizer.normalize(email);
    }
}
