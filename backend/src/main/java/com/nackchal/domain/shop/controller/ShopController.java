package com.nackchal.domain.shop.controller;

import com.nackchal.domain.shop.dto.request.PurchaseRequest;
import com.nackchal.domain.shop.dto.response.PurchaseResponse;
import com.nackchal.domain.shop.dto.response.ShopItemResponse;
import com.nackchal.domain.shop.service.ShopService;
import com.nackchal.domain.wallet.event.WalletChangedEvent;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 장난 상점. 사용자는 검증한 JWT에서만 정한다. */
@RestController
@RequestMapping("/api/shop")
public class ShopController {

    private final ShopService shopService;
    private final ApplicationEventPublisher events;

    public ShopController(ShopService shopService, ApplicationEventPublisher events) {
        this.shopService = shopService;
        this.events = events;
    }

    @GetMapping
    public List<ShopItemResponse> items(Principal principal) {
        return shopService.items(UUID.fromString(principal.getName()));
    }

    @PostMapping("/purchases")
    public PurchaseResponse purchase(@Valid @RequestBody PurchaseRequest request, Principal principal) {
        UUID userId = UUID.fromString(principal.getName());
        PurchaseResponse response = shopService.purchase(userId, request);
        // 커밋된 뒤에 알려 같은 계정의 다른 탭도 캐시를 갱신한다.
        events.publishEvent(new WalletChangedEvent(userId, response.balance()));
        return response;
    }
}
