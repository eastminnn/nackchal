package com.nackchal.domain.game.repository;

import com.nackchal.domain.game.entity.Game;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** 게임 기록 조회. 정산은 행 잠금으로 같은 판을 한 번만 처리한다. */
public interface GameRepository extends JpaRepository<Game, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select game from Game game where game.id = :id")
    Optional<Game> findForUpdate(UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<Game> findByStatus(Game.Status status);
}
