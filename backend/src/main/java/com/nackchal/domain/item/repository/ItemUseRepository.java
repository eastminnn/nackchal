package com.nackchal.domain.item.repository;

import com.nackchal.domain.item.entity.ItemUse;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 아이템 사용 기록. */
public interface ItemUseRepository extends JpaRepository<ItemUse, UUID> {
}
