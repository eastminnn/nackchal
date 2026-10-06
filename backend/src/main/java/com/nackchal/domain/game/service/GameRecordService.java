package com.nackchal.domain.game.service;

import com.nackchal.domain.auction.model.GameSettlement;
import com.nackchal.domain.auction.model.GameSettlement.Outcome;
import com.nackchal.domain.game.entity.Game;
import com.nackchal.domain.game.entity.GameParticipant;
import com.nackchal.domain.game.entity.RoundResult;
import com.nackchal.domain.game.repository.GameParticipantRepository;
import com.nackchal.domain.game.repository.GameRepository;
import com.nackchal.domain.game.repository.RoundResultRepository;
import com.nackchal.domain.wallet.service.WalletService;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 게임 시작·종료 기록과 보상 지급을 DB 트랜잭션으로 처리한다. 메모리 잠금을 쥔 상태에서 호출하지 않는다
 */
@Service
@Transactional
public class GameRecordService implements GameRecords {

    private final GameRepository gameRepository;
    private final GameParticipantRepository participantRepository;
    private final RoundResultRepository roundResultRepository;
    private final WalletService walletService;

    public GameRecordService(
            GameRepository gameRepository,
            GameParticipantRepository participantRepository,
            RoundResultRepository roundResultRepository,
            WalletService walletService
    ) {
        this.gameRepository = gameRepository;
        this.participantRepository = participantRepository;
        this.roundResultRepository = roundResultRepository;
        this.walletService = walletService;
    }

    @Override
    public void recordStart(GameStart start) {
        gameRepository.save(new Game(start.gameId(), start.roomCode(), start.rulesVersion(), start.startedAt()));
        participantRepository.saveAll(start.seats().stream().map(seat -> new GameParticipant(
                start.gameId(), seat.userId(), seat.seatNo(), seat.nickname(), seat.avatarCode())).toList());
        participantRepository.flush();
    }

    /**
     * 게임 행을 잠가 같은 판의 정산을 한 번만 처리한다. 참가자 결과·라운드 결과·게임 상태를 바꾼 뒤
     * 보상을 사용자 ID 순서로 지급한다. 지갑 갱신 순서를 고정해 동시에 끝난 판끼리 교착하지 않는다.
     * @throws IllegalStateException 시작 기록이 없거나 참가자가 시작 기록과 다를 때
     */
    @Override
    public Map<UUID, Long> settle(GameSettlement settlement) {
        Game game = gameRepository.findForUpdate(settlement.gameId())
                .orElseThrow(() -> new IllegalStateException("Game not recorded: " + settlement.gameId()));
        if (game.getStatus() != Game.Status.RUNNING) return Map.of();

        Map<UUID, GameParticipant> stored = participantRepository.findByGameId(game.getId()).stream()
                .collect(Collectors.toMap(GameParticipant::getUserId, Function.identity()));
        Map<UUID, GameSettlement.Participant> results = settlement.participants().stream()
                .collect(Collectors.toMap(GameSettlement.Participant::userId, Function.identity()));
        if (!stored.keySet().equals(results.keySet())) {
            throw new IllegalStateException("Participants differ from start record: " + game.getId());
        }

        boolean finished = settlement.outcome() == Outcome.FINISHED;
        results.values().forEach(result -> stored.get(result.userId()).settle(
                result.left() ? GameParticipant.Status.LEFT
                        : finished ? GameParticipant.Status.FINISHED : GameParticipant.Status.ABORTED,
                finished ? (long) result.finalBalance() : null,
                finished && !result.left() ? result.rank() : null,
                finished && !result.left() ? result.reward() : 0,
                result.leftAt()));
        if (finished) {
            roundResultRepository.saveAll(settlement.rounds().stream().map(round -> new RoundResult(
                    game.getId(), round.round(), round.lotCode(), round.lotName(), round.hintGrade(),
                    round.revealedGrade(), round.value(), round.winnerUserId(), round.price(),
                    round.revealedAt())).toList());
        }
        game.end(finished ? Game.Status.COMPLETED : Game.Status.ABORTED, settlement.endedAt());

        Map<UUID, Long> balances = new LinkedHashMap<>();
        if (finished) {
            results.values().stream()
                    .filter(result -> !result.left() && result.reward() > 0)
                    .sorted(Comparator.comparing(GameSettlement.Participant::userId))
                    .forEach(result -> balances.put(result.userId(),
                            walletService.rewardGame(result.userId(), result.reward(), game.getId())));
        }
        // 보상이 없어도 위의 변경을 DB에 반영해 제약 위반을 이 트랜잭션 안에서 드러낸다.
        participantRepository.flush();
        return balances;
    }

    /**
     * 이전 실행이 남긴 RUNNING 판을 중단으로 정리한다. 서버 1대 구조라 이번 실행이 시작되기 전의 진행 중 판은
     * 메모리 상태가 이미 사라진 기록이다. 웹 서버는 기동 완료 이벤트보다 먼저 요청을 받으므로, 이번 실행에서
     * 시작한 판까지 지우지 않도록 startedBefore 이전에 시작한 판만 고른다.
     * @return 정리한 판 수
     */
    public int abortUnfinished(Instant startedBefore, Instant now) {
        List<Game> running = gameRepository.findByStatusAndStartedAtBefore(Game.Status.RUNNING, startedBefore);
        running.forEach(game -> {
            participantRepository.findByGameId(game.getId()).stream()
                    .filter(participant -> participant.getStatus() == GameParticipant.Status.ACTIVE)
                    .forEach(participant -> participant.settle(GameParticipant.Status.ABORTED, null, null, 0, null));
            game.end(Game.Status.ABORTED, now);
        });
        return running.size();
    }
}
