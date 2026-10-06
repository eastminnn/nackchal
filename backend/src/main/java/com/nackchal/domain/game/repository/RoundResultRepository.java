package com.nackchal.domain.game.repository;

import com.nackchal.domain.game.entity.RoundResult;
import org.springframework.data.jpa.repository.JpaRepository;

/** 정상 종료한 판의 라운드 결과. */
public interface RoundResultRepository extends JpaRepository<RoundResult, RoundResult.Key> {
}
