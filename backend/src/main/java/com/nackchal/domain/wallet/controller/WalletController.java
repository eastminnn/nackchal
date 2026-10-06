package com.nackchal.domain.wallet.controller;

import com.nackchal.domain.wallet.dto.response.WalletResponse;
import com.nackchal.domain.wallet.service.WalletService;
import java.security.Principal;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 본인 캐시 잔액 조회. 사용자는 검증한 JWT에서만 정하며 경로나 쿼리로 받지 않는다. */
@RestController
@RequestMapping("/api/wallet")
public class WalletController {

    private final WalletService walletService;

    public WalletController(WalletService walletService) {
        this.walletService = walletService;
    }

    @GetMapping
    public WalletResponse get(Principal principal) {
        return new WalletResponse(walletService.balance(UUID.fromString(principal.getName())));
    }
}
