package com.nackchal.domain.shop.service;

import com.nackchal.common.exception.CustomException;
import com.nackchal.common.exception.error.ErrorCode;
import com.nackchal.domain.item.entity.Inventory;
import com.nackchal.domain.item.entity.ItemCatalog;
import com.nackchal.domain.item.repository.InventoryRepository;
import com.nackchal.domain.item.repository.ItemCatalogRepository;
import com.nackchal.domain.shop.dto.request.PurchaseRequest;
import com.nackchal.domain.shop.dto.response.PurchaseResponse;
import com.nackchal.domain.shop.dto.response.ShopItemResponse;
import com.nackchal.domain.shop.entity.ShopPurchase;
import com.nackchal.domain.shop.repository.ShopPurchaseRepository;
import com.nackchal.domain.wallet.service.WalletService;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 장난 아이템 판매. 가격은 서버 목록으로 계산하고, 구매 기록·캐시 차감·원장·인벤토리 증가를 한 트랜잭션에서 처리한다
 */
@Service
@Transactional(readOnly = true)
public class ShopService {

    private final ItemCatalogRepository catalogRepository;
    private final InventoryRepository inventoryRepository;
    private final ShopPurchaseRepository purchaseRepository;
    private final WalletService walletService;
    private final Clock clock;

    public ShopService(
            ItemCatalogRepository catalogRepository,
            InventoryRepository inventoryRepository,
            ShopPurchaseRepository purchaseRepository,
            WalletService walletService,
            Clock clock
    ) {
        this.catalogRepository = catalogRepository;
        this.inventoryRepository = inventoryRepository;
        this.purchaseRepository = purchaseRepository;
        this.walletService = walletService;
        this.clock = clock;
    }

    /** 판매 중인 아이템과 내 보유 수량. 비싼 것부터. */
    public List<ShopItemResponse> items(UUID userId) {
        Map<String, Long> owned = inventoryRepository.findByUserId(userId).stream()
                .collect(Collectors.toMap(Inventory::getItemCode, Inventory::getQuantity));
        return catalogRepository.findByActiveTrueOrderByPriceCashDesc().stream()
                .map(item -> new ShopItemResponse(item.getCode(), item.getName(), item.getPriceCash(),
                        owned.getOrDefault(item.getCode(), 0L)))
                .toList();
    }

    /**
     * 아이템을 산다. 같은 requestId를 다시 보내면 처음 결과를 돌려주고 다시 차감하지 않는다.
     * @throws CustomException ITEM_NOT_FOUND, CASH_INSUFFICIENT, CONFLICT(같은 requestId에 다른 본문, 동시 재전송)
     */
    @Transactional
    public PurchaseResponse purchase(UUID userId, PurchaseRequest request) {
        var previous = purchaseRepository.findByUserIdAndRequestId(userId, request.requestId());
        if (previous.isPresent()) {
            ShopPurchase purchase = previous.get();
            if (!purchase.getItemCode().equals(request.itemCode()) || purchase.getQuantity() != request.quantity()) {
                throw new CustomException(ErrorCode.CONFLICT);
            }
            return new PurchaseResponse(walletService.balance(userId), purchase.getItemCode(),
                    quantity(userId, purchase.getItemCode()));
        }
        ItemCatalog item = catalogRepository.findById(request.itemCode()).filter(ItemCatalog::isActive)
                .orElseThrow(() -> new CustomException(ErrorCode.ITEM_NOT_FOUND));
        ShopPurchase purchase = new ShopPurchase(userId, request.requestId(), item.getCode(), request.quantity(),
                item.getPriceCash(), clock.instant());
        try {
            purchaseRepository.saveAndFlush(purchase);
        } catch (DataIntegrityViolationException exception) {
            // 같은 requestId가 동시에 들어오면 먼저 커밋한 쪽만 남는다. 늦은 쪽은 결과를 다시 확인하게 한다.
            throw new CustomException(ErrorCode.CONFLICT);
        }
        long balance = walletService.spendOnPurchase(userId, purchase.getTotalCash(), purchase.getId());
        inventoryRepository.add(userId, item.getCode(), request.quantity(), clock.instant());
        return new PurchaseResponse(balance, item.getCode(), quantity(userId, item.getCode()));
    }

    private long quantity(UUID userId, String itemCode) {
        return inventoryRepository.findById(new Inventory.Key(userId, itemCode)).map(Inventory::getQuantity).orElse(0L);
    }
}
