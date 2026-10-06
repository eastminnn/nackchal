package com.nackchal.domain.auth.repository;

import com.nackchal.domain.auth.entity.EmailCredential;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 이메일 로그인 정보 조회와 이메일 중복 확인. */
public interface EmailCredentialRepository extends JpaRepository<EmailCredential, UUID> {

    Optional<EmailCredential> findByEmail(String email);

    boolean existsByEmail(String email);
}
