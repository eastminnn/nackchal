package com.nackchal.domain.auth.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.user.dto.response.UserResponse;
import com.nackchal.domain.user.entity.User;
import com.nackchal.domain.user.repository.UserRepository;
import com.nackchal.domain.auth.dto.request.LoginRequest;
import com.nackchal.domain.auth.dto.request.RegistrationRequest;
import com.nackchal.domain.auth.entity.EmailCredential;
import com.nackchal.domain.auth.repository.EmailCredentialRepository;
import java.util.UUID;
import java.util.Optional;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 이메일 회원가입, 로그인, 현재 사용자 조회
 */
@Service
@Transactional(readOnly = true)
public class AuthService {

    private final UserRepository userRepository;
    private final EmailCredentialRepository emailCredentialRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthTokenService authTokenService;
    private final String dummyPasswordHash;

    public AuthService(
            UserRepository userRepository,
            EmailCredentialRepository emailCredentialRepository,
            PasswordEncoder passwordEncoder,
            AuthTokenService authTokenService
    ) {
        this.userRepository = userRepository;
        this.emailCredentialRepository = emailCredentialRepository;
        this.passwordEncoder = passwordEncoder;
        this.authTokenService = authTokenService;
        this.dummyPasswordHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    /**
     * 계정과 이메일 인증 정보를 함께 저장한다. 가입 후 로그인은 별도로 진행한다.
     * @throws CustomException EMAIL_UNAVAILABLE
     */
    @Transactional
    public void register(RegistrationRequest request) {
        if (emailCredentialRepository.existsByEmail(request.email())) {
            throw new CustomException(ErrorCode.EMAIL_UNAVAILABLE);
        }

        User user = userRepository.saveAndFlush(new User(request.nickname()));
        String passwordHash = passwordEncoder.encode(request.password());
        saveEmailCredential(user.getId(), request.email(), passwordHash);
    }

    /**
     * 이메일과 비밀번호를 확인하고 인증 토큰을 발급한다.
     * @throws CustomException INVALID_CREDENTIALS
     */
    @Transactional
    public AuthTokens login(LoginRequest request) {
        Optional<EmailCredential> credential = emailCredentialRepository.findByEmail(request.email());
        // 등록되지 않은 이메일도 같은 해시 검증을 거쳐 응답 시간 차이를 줄인다.
        String hash = credential.map(EmailCredential::getPasswordHash).orElse(dummyPasswordHash);
        boolean matches = passwordEncoder.matches(request.password(), hash);
        if (credential.isEmpty() || !matches) {
            throw new CustomException(ErrorCode.INVALID_CREDENTIALS);
        }
        return authTokenService.issue(credential.get().getUserId());
    }

    /**
     * JWT에 담긴 사용자 ID로 공개 프로필을 조회한다.
     * @throws CustomException UNAUTHORIZED(해당 사용자가 없음)
     */
    public UserResponse getMe(UUID userId) {
        return userRepository.findById(userId)
                .map(UserResponse::from)
                .orElseThrow(() -> new CustomException(ErrorCode.UNAUTHORIZED));
    }

    private void saveEmailCredential(UUID userId, String email, String passwordHash) {
        try {
            // 동시 가입은 사전 중복 조회를 함께 통과할 수 있어 DB 제약으로 한 번 더 확인한다.
            emailCredentialRepository.saveAndFlush(new EmailCredential(userId, email, passwordHash));
        } catch (DataIntegrityViolationException exception) {
            if (isDuplicateEmail(exception)) {
                // 예외를 호출 측으로 전달해 앞서 저장한 계정도 같은 트랜잭션에서 롤백한다.
                throw new CustomException(ErrorCode.EMAIL_UNAVAILABLE);
            }
            throw exception;
        }
    }

    private boolean isDuplicateEmail(DataIntegrityViolationException exception) {
        return exception.getCause() instanceof ConstraintViolationException violation
                && "23505".equals(violation.getSQLState())
                && "email_credentials_email_key".equals(violation.getConstraintName());
    }
}
