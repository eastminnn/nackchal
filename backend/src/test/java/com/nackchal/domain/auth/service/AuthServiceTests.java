package com.nackchal.domain.auth.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.user.entity.User;
import com.nackchal.domain.user.repository.UserRepository;
import com.nackchal.domain.auth.dto.request.RegistrationRequest;
import com.nackchal.domain.auth.dto.request.LoginRequest;
import com.nackchal.domain.auth.repository.EmailCredentialRepository;
import com.nackchal.domain.wallet.service.WalletService;
import java.sql.SQLException;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AuthServiceTests {
    @Test
    void loginDatabaseFailureIsNotReportedAsInvalidCredentials() {
        var users = mock(UserRepository.class);
        var credentials = mock(EmailCredentialRepository.class);
        var passwords = mock(PasswordEncoder.class);
        var failure = new DataAccessResourceFailureException("private-database-diagnostic");
        when(credentials.findByEmail("bear@example.test")).thenThrow(failure);
        var service = new AuthService(users, credentials, passwords, mock(AuthTokenService.class), mock(WalletService.class));

        assertThatThrownBy(() -> service.login(new LoginRequest("bear@example.test", "test-password")))
                .isSameAs(failure);
    }

    @ParameterizedTest
    @CsvSource({"23505,email_credentials_email_key,true", "23505,other_unique,false",
            "23503,email_credentials_email_key,false", "23514,email_credentials_email_key,false"})
    void onlyEmailUniquenessBecomesConflict(String sqlState, String constraint, boolean emailConflict) {
        var users = mock(UserRepository.class);
        var credentials = mock(EmailCredentialRepository.class);
        var passwords = mock(PasswordEncoder.class);
        var user = new User("곰");
        var request = new RegistrationRequest("bear@example.test", "test-password", "곰");
        var failure = new DataIntegrityViolationException("diagnostic", new ConstraintViolationException(
                "diagnostic", new SQLException("diagnostic", sqlState), constraint));
        when(users.saveAndFlush(any())).thenReturn(user);
        when(passwords.encode(any())).thenReturn("hash");
        when(credentials.saveAndFlush(any())).thenThrow(failure);
        var service = new AuthService(users, credentials, passwords, mock(AuthTokenService.class), mock(WalletService.class));

        if (emailConflict) {
            assertThatThrownBy(() -> service.register(request)).isInstanceOfSatisfying(CustomException.class,
                    exception -> org.assertj.core.api.Assertions.assertThat(exception.getErrorCode())
                            .isEqualTo(ErrorCode.EMAIL_UNAVAILABLE));
        } else {
            assertThatThrownBy(() -> service.register(request)).isSameAs(failure);
        }
    }
}
