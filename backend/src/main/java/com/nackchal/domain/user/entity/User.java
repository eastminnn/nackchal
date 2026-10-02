package com.nackchal.domain.user.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * 경매장에서 사용하는 계정 프로필. 로그인 정보는 EmailCredential에 저장한다
 */
@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    @Column(nullable = false, length = 12)
    private String nickname;

    @Column(nullable = false, length = 32)
    private String avatarCode;

    @Column(nullable = false)
    private Instant createdAt;

    protected User() {
    }

    public User(String nickname) {
        this.id = UUID.randomUUID();
        this.nickname = nickname;
        this.avatarCode = "plush-bear";
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getNickname() {
        return nickname;
    }

    public String getAvatarCode() {
        return avatarCode;
    }
}
