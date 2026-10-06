package com.nackchal.domain.game.service;

import com.nackchal.domain.auction.model.GameSettlement;
import java.util.Map;
import java.util.UUID;

/** 게임 시작과 종료를 DB에 남기는 경로. 대기실은 이 인터페이스에만 의존하고 메모리 잠금 밖에서 호출한다. */
public interface GameRecords {

    /** RUNNING 게임과 ACTIVE 참가자를 저장한다. 실패하면 아무것도 남기지 않는다. */
    void recordStart(GameStart start);

    /**
     * 끝난 판의 결과와 보상을 한 트랜잭션으로 저장한다. 이미 정산된 판이면 아무것도 바꾸지 않는다.
     * @return 보상을 받은 사용자의 새 캐시 잔액. 이미 정산됐거나 보상이 없으면 비어 있다
     */
    Map<UUID, Long> settle(GameSettlement settlement);
}
