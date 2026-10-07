package com.nackchal.domain.item.repository;

import com.nackchal.domain.item.entity.ItemCatalog;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** 아이템 목록 조회. */
public interface ItemCatalogRepository extends JpaRepository<ItemCatalog, String> {

    List<ItemCatalog> findByActiveTrueOrderByPriceCashDesc();
}
