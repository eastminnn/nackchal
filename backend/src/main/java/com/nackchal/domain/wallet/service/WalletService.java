package com.nackchal.domain.wallet.service;

import com.nackchal.domain.wallet.entity.Wallet;
import com.nackchal.domain.wallet.repository.WalletRepository;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 캐시 잔액과 원장을 다루는 유일한 경로. 다른 기능은 지갑을 직접 수정하지 않는다
 */
@Service
@Transactional(readOnly = true)
public class WalletService {

    private final WalletRepository walletRepository;
    private final Clock clock;

    public WalletService(WalletRepository walletRepository, Clock clock) {
        this.walletRepository = walletRepository;
        this.clock = clock;
    }

    /** 잔액 0인 지갑을 만든다. 가입 트랜잭션 안에서만 호출한다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void create(UUID userId) {
        walletRepository.saveAndFlush(new Wallet(userId, clock.instant()));
    }
}
