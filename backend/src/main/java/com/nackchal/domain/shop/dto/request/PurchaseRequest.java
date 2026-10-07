package com.nackchal.domain.shop.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** 구매 요청. 가격은 받지 않고 서버 목록으로 계산한다. requestId가 같으면 한 번만 처리한다. */
public record PurchaseRequest(
        @NotBlank @Size(max = 32) String itemCode,
        @NotNull @Min(1) @Max(10) Integer quantity,
        @NotNull UUID requestId
) {}
