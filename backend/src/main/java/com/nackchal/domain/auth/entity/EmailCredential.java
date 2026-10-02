package com.nackchal.domain.auth.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/**
 * 계정의 이메일과 비밀번호 해시. 공개 프로필과 분리해 저장한다
 */
@Entity
@Table(name = "email_credentials")
public class EmailCredential {

    @Id
    private UUID userId;

    @Column(nullable = false, unique = true, length = 254)
    private String email;

    @Column(nullable = false, length = 255)
    private String passwordHash;

    protected EmailCredential() {
    }

    public EmailCredential(UUID userId, String email, String passwordHash) {
        this.userId = userId;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getPasswordHash() {
        return passwordHash;
    }
}
