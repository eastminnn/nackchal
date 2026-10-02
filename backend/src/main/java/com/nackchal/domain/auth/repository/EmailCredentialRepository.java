package com.nackchal.domain.auth.repository;

import com.nackchal.domain.auth.entity.EmailCredential;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EmailCredentialRepository extends JpaRepository<EmailCredential, UUID> {

    Optional<EmailCredential> findByEmail(String email);

    boolean existsByEmail(String email);
}
