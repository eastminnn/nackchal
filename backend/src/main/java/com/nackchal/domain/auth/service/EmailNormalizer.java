package com.nackchal.domain.auth.service;

import java.util.Locale;

/**
 * 가입과 로그인에서 동일한 이메일을 찾기 위한 정규화 규칙
 */
public final class EmailNormalizer {

    private EmailNormalizer() {
    }

    public static String normalize(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }
}
