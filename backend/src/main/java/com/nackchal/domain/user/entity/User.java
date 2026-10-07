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

    /** 고를 수 있는 캐릭터. DB의 users_avatar_code_check와 같은 목록이다. */
    public static final String AVATAR_PATTERN = "plush-(bear|bunny|cat|dog)";
    public static final String DEFAULT_AVATAR = "plush-bear";

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

    public User(String nickname, String avatarCode) {
        this.id = UUID.randomUUID();
        this.nickname = nickname;
        this.avatarCode = avatarCode == null ? DEFAULT_AVATAR : avatarCode;
        this.createdAt = Instant.now();
    }

    public void changeAvatar(String avatarCode) {
        this.avatarCode = avatarCode;
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
