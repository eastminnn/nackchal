package com.nackchal.domain.user.repository;

import com.nackchal.domain.user.entity.User;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 사용자 프로필 저장과 조회. */
public interface UserRepository extends JpaRepository<User, UUID> {
}
