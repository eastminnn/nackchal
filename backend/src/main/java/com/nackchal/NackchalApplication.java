package com.nackchal;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

/** 서버 진입점. 기본 메모리 사용자 계정 대신 JWT 인증을 사용하므로 UserDetailsService 자동 설정을 끈다. */
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class NackchalApplication {

    public static void main(String[] args) {
        SpringApplication.run(NackchalApplication.class, args);
    }
}
