package com.nackchal.domain.wallet.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.wallet.entity.CashTransaction;
import com.nackchal.domain.wallet.entity.Wallet;
import com.nackchal.domain.wallet.repository.CashTransactionRepository;
import com.nackchal.domain.wallet.repository.WalletRepository;
import java.time.Clock;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 캐시 잔액과 원장을 다루는 유일한 경로. 다른 기능은 지갑을 직접 수정하지 않는다
 */
@Service
@Transactional(readOnly = true)
public class WalletService {

    private static final Logger log = LoggerFactory.getLogger(WalletService.class);

    private final WalletRepository walletRepository;
    private final CashTransactionRepository cashTransactionRepository;
    private final Clock clock;

    public WalletService(WalletRepository walletRepository, CashTransactionRepository cashTransactionRepository,
                         Clock clock) {
        this.walletRepository = walletRepository;
        this.cashTransactionRepository = cashTransactionRepository;
        this.clock = clock;
    }

    /**
     * 현재 잔액. 지갑은 가입·마이그레이션으로 항상 있어야 하므로 없으면 0으로 만들지 않고 서버 오류로 다룬다.
     * @throws CustomException INTERNAL_SERVER_ERROR
     */
    public long balance(UUID userId) {
        return walletRepository.findById(userId).map(Wallet::getBalance).orElseThrow(() -> {
            log.error("Wallet missing for user {}", userId);
            return new CustomException(ErrorCode.INTERNAL_SERVER_ERROR);
        });
    }

    /** 잔액 0인 지갑을 만든다. 가입 트랜잭션 안에서만 호출한다. */
    @Transactional(propagation = Propagation.MANDATORY)
    public void create(UUID userId) {
        walletRepository.saveAndFlush(new Wallet(userId, clock.instant()));
    }

    /**
     * 구매 금액을 원장에 남기고 잔액에서 뺀다. 구매 트랜잭션 안에서만 호출한다.
     * @return 차감 후 잔액
     * @throws CustomException CASH_INSUFFICIENT (트랜잭션 전체가 롤백된다)
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public long spendOnPurchase(UUID userId, long amount, UUID purchaseId) {
        if (amount <= 0) throw new IllegalArgumentException("Purchase must cost cash: " + amount);
        cashTransactionRepository.save(CashTransaction.purchase(userId, amount, purchaseId, clock.instant()));
        if (walletRepository.spend(userId, amount, clock.instant()) != 1) {
            throw new CustomException(ErrorCode.CASH_INSUFFICIENT);
        }
        return walletRepository.findById(userId).orElseThrow().getBalance();
    }

    /**
     * 게임 보상을 원장에 남기고 잔액을 더한다. 게임 정산 트랜잭션 안에서만 호출한다.
     * 같은 판의 보상이 이미 있으면 원장의 유니크 인덱스가 거절해 트랜잭션 전체가 롤백된다.
     * @return 지급 후 잔액
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public long rewardGame(UUID userId, long amount, UUID gameId) {
        if (amount <= 0) throw new IllegalArgumentException("Reward must be positive: " + amount);
        cashTransactionRepository.save(CashTransaction.gameReward(userId, amount, gameId, clock.instant()));
        if (walletRepository.add(userId, amount, clock.instant()) != 1) {
            throw new IllegalStateException("Wallet not found for user " + userId);
        }
        return walletRepository.findById(userId).orElseThrow().getBalance();
    }
}
