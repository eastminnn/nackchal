package com.nackchal.domain.game.repository;

import com.nackchal.domain.game.entity.GameParticipant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 게임 참가자 기록. */
public interface GameParticipantRepository extends JpaRepository<GameParticipant, GameParticipant.Key> {

    List<GameParticipant> findByGameId(UUID gameId);
}
