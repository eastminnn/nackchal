package com.nackchal.domain.item.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 판매하는 장난 아이템과 서버 가격. 가격은 항상 이 표로 계산한다. */
@Entity
@Table(name = "item_catalog")
public class ItemCatalog {

    @Id
    @Column(length = 32)
    private String code;

    @Column(nullable = false, length = 40)
    private String name;

    @Column(nullable = false)
    private long priceCash;

    @Column(nullable = false)
    private boolean active;

    protected ItemCatalog() {
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public long getPriceCash() {
        return priceCash;
    }

    public boolean isActive() {
        return active;
    }
}
