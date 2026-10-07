import {
  ArrowLeftIcon,
  ChatCircleIcon,
  CheckIcon,
  HandCoinsIcon,
  PlayIcon,
  TrophyIcon,
  XIcon,
} from '@phosphor-icons/react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import type { ShopItem, User } from '../auth/api';
import { ObjectArt } from '../components/art/ObjectArt';
import { ChatLog, OnlineChatComposer } from '../components/game/Chat';
import { EmoteButtons } from '../components/game/EmoteButtons';
import { Players } from '../components/game/Players';
import { Timer } from '../components/game/Timer';
import { Button, Money } from '../components/ui/primitives';
import { ITEM_NAMES, type ItemKind, MIN_PLAYERS, type RoomState, SELF } from '../game/types';
import { ConnectionNotice } from '../rooms/ConnectionNotice';
import type { ConnectionStatus, SharedGame, SharedRoom } from '../rooms/protocol';
import type { RoomClient } from '../rooms/RoomClient';
import { inProgress } from '../rooms/view';

const AuctionRoom = lazy(() => import('../scene/AuctionRoom'));
const BID_STEPS = [1, 5, 10] as const;

/** 온라인 방 화면. 게임 전에는 준비·시작, 게임 중에는 입찰 HUD, 게임 후에는 결과를 보여준다. */
export function WaitingRoom({
  room,
  state,
  client,
  user,
  status,
  pending,
  error,
  items,
  throwsLeft,
}: {
  readonly room: SharedRoom;
  readonly state: RoomState;
  readonly client: RoomClient;
  readonly user: User;
  readonly status: ConnectionStatus;
  readonly pending: boolean;
  readonly error: string;
  /** 내 보유 아이템. */
  readonly items: readonly ShopItem[];
  /** 이번 판에 더 던질 수 있는 수. */
  readonly throwsLeft: number;
}) {
  const [modelsReady, setModelsReady] = useState(false);
  const [dismissedResult, setDismissedResult] = useState<string | null>(null);
  const onReady = useCallback(() => setModelsReady(true), []);
  const me = room.players.find((player) => player.userId === user.id);
  const online = status === 'connected';
  const game = room.game;
  // 진행 중인 게임만 live로 두고, 끝난 게임은 결과 표시에만 쓴다.
  const live = game && inProgress(game) ? game : null;
  const playing = live !== null;
  const host = room.hostUserId === user.id;
  const connected = room.players.filter((player) => player.connected).length;
  const guestsReady = room.players.every((player) => player.userId === room.hostUserId || player.ready);
  const canStart = host && connected >= MIN_PLAYERS && guestsReady && !room.starting;
  const myBalance = state.players.find((player) => player.id === SELF)?.balance ?? 0;
  const leader = state.players.find((player) => player.id === state.leader);
  const result = game && !live && dismissedResult !== game.gameId ? game : null;
  const [selected, setSelected] = useState<ItemKind | null>(null);
  // 게임이 끝나거나 던질 수 없게 되면 고른 아이템을 놓는다. Esc로도 취소한다.
  useEffect(() => {
    if (!live || throwsLeft === 0) setSelected(null);
  }, [live, throwsLeft]);
  useEffect(() => {
    if (!selected) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [selected]);
  const throwItem = (target: string) => {
    if (!selected) return;
    void client.command({ type: 'USE_ITEM', item: selected, targetUserId: target });
    setSelected(null);
  };
  return (
    <main className="immersive-game" aria-label={room.name} data-models-ready={modelsReady}>
      <h1 className="game-screen-reader">{room.name}</h1>
      <div className="immersive-world">
        <Suspense
          fallback={
            <div className="room-loading" role="status">
              경매장에 들어가는 중…
            </div>
          }
        >
          <AuctionRoom state={state} targeting={selected !== null} onReady={onReady} />
        </Suspense>
      </div>
      <div className="room-hud">
        <div className="hud-room">
          <button
            className="hud-exit"
            type="button"
            aria-label="방 목록"
            title={playing ? '게임 중에 나가면 순위와 보상에서 빠져요' : '방 목록으로 나가기'}
            disabled={!online || pending}
            onClick={() => {
              void client.command({ type: 'LEAVE_ROOM' });
            }}
          >
            <ArrowLeftIcon size={20} />
          </button>
          <span>
            {room.name}
            <small>#{room.id.slice(0, 8)}</small>
          </span>
        </div>
        <div className="hud-round">
          <span className="round-counter">
            {live ? (
              <>
                <strong>{String(live.round).padStart(2, '0')}</strong> / {live.totalRounds}
              </>
            ) : (
              `${room.players.length} / 4명`
            )}
          </span>
          {playing && <Timer deadline={state.deadline} />}
        </div>
        {live ? (
          <>
            <section className="hud-lot" aria-label="현재 경매 물건">
              <span className="eyebrow">
                LOT {String(live.round).padStart(3, '0')} · {live.lot.hint} 느낌
              </span>
              <h2>{live.lot.name}</h2>
              <span className="hud-price current-price">
                <Money amount={live.auction.price} />
              </span>
              <span className="hud-leader">{leader ? leader.name : '첫 입찰을 기다려요'}</span>
            </section>
            {live.reveal && (
              <div className="hud-reveal" role="status">
                <span>{live.reveal.grade} · 실제 가치</span>
                <strong>
                  <Money amount={live.reveal.value} />
                </strong>
                <span>
                  {live.reveal.winnerUserId
                    ? `${nickname(room, live.reveal.winnerUserId)} 낙찰가 $${live.reveal.price} · ${profitLabel(live.reveal.profit)}`
                    : '이번 물건은 유찰됐어요'}
                </span>
              </div>
            )}
            <section className="hud-bidding" aria-label="입찰하기">
              <div className="hud-wallet">
                <HandCoinsIcon size={16} />
                <span>내 잔액</span>
                <Money amount={myBalance} />
              </div>
              <div className="bid-buttons">
                {BID_STEPS.map((step) => {
                  const leading = live.auction.leaderUserId !== null;
                  // 첫 입찰은 시작가 $5부터, 이후에는 현재가에 단계만큼 더한 최종 금액을 보낸다.
                  const amount = leading ? live.auction.price + step : step === 1 ? 5 : 5 + step;
                  return (
                    <Button
                      key={step}
                      variant={step === 1 ? 'primary' : 'secondary'}
                      aria-label={`${amount}달러 입찰`}
                      disabled={
                        !online ||
                        pending ||
                        live.status !== 'AUCTION' ||
                        live.auction.leaderUserId === user.id ||
                        amount > myBalance
                      }
                      onClick={() => {
                        void client.command({
                          type: 'PLACE_BID',
                          gameId: live.gameId,
                          round: live.round,
                          expectedBidVersion: live.auction.bidVersion,
                          amount,
                        });
                      }}
                    >
                      {leading ? `+$${step}` : `$${amount}`}
                      <small>입찰</small>
                    </Button>
                  );
                })}
              </div>
            </section>
            {selected && (
              <section className="hud-targets" aria-label="던질 상대 선택">
                <div>
                  <span>{ITEM_NAMES[selected]}를 던질 친구를 골라요</span>
                  <button
                    type="button"
                    className="hud-quiet"
                    aria-label="선택 취소"
                    onClick={() => setSelected(null)}
                  >
                    <XIcon size={16} />
                  </button>
                </div>
                <Players state={state} selected={selected} onThrow={throwItem} />
              </section>
            )}
          </>
        ) : (
          <>
            <section className="room-participants" aria-label="참가자 준비 상태">
              <ConnectionNotice status={status} />
              <ul>
                {room.players.map((player) => (
                  <li key={player.userId} data-user-id={player.userId}>
                    <strong>
                      {player.nickname}
                      {player.userId === user.id ? ' (나)' : ''}
                    </strong>
                    <span>
                      {player.userId === room.hostUserId ? '방장 · ' : ''}
                      {!player.connected ? '재접속 대기' : player.ready ? '준비 완료' : '준비 중'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <div className="hud-ready">
              {host ? (
                <Button
                  disabled={!online || pending || !canStart}
                  onClick={() => {
                    void client.command({ type: 'START_GAME' });
                  }}
                >
                  <PlayIcon size={18} weight="fill" />
                  {room.starting ? '시작하는 중…' : '경매 시작하기'}
                </Button>
              ) : (
                <Button
                  disabled={!online || pending || !me || room.starting}
                  aria-pressed={me?.ready ?? false}
                  onClick={() => {
                    void client.command({ type: 'SET_READY', ready: !me?.ready });
                  }}
                >
                  <CheckIcon size={18} />
                  {me?.ready ? '준비 취소' : '준비하기'}
                </Button>
              )}
              <p className="hud-waiting-note">
                {host
                  ? connected < MIN_PLAYERS
                    ? `${MIN_PLAYERS}명부터 시작할 수 있어요.`
                    : guestsReady
                      ? '모두 준비됐어요. 경매를 시작해 보세요.'
                      : '참가자들이 준비하면 시작할 수 있어요.'
                  : '준비하면 방장이 경매를 시작해요.'}
              </p>
            </div>
          </>
        )}
        {/* 산 아이템은 대기실에서도 보이게 두고, 경매가 진행 중일 때만 던질 수 있다. */}
        <section className="hud-items" aria-label="장난 아이템">
          {items.map((item) => (
            <button
              key={item.code}
              type="button"
              className={selected === item.code ? 'hud-item selected' : 'hud-item'}
              aria-label={`${item.name} 선택, ${item.quantity}개 보유`}
              aria-pressed={selected === item.code}
              disabled={!live || !online || item.quantity === 0 || throwsLeft === 0}
              onClick={() => setSelected(selected === item.code ? null : item.code)}
            >
              <ObjectArt kind={item.code} />
              <span>
                {item.name} <strong>×{item.quantity}</strong>
              </span>
            </button>
          ))}
          <small className="hud-items-left">
            {live ? `이번 판 ${throwsLeft}/3` : '경매가 시작되면 던질 수 있어요'}
          </small>
        </section>
        {result && (
          <aside className="hud-drawer hud-result" aria-label="지난 게임 결과">
            <button
              className="hud-drawer-close hud-quiet"
              type="button"
              aria-label="결과 닫기"
              onClick={() => setDismissedResult(result.gameId)}
            >
              <XIcon size={18} />
            </button>
            <h2>
              <TrophyIcon size={18} weight="fill" aria-hidden="true" />
              {result.status === 'ABORTED' ? '게임이 중단됐어요' : '최종 순위'}
            </h2>
            {result.status === 'ABORTED' ? (
              <p>참가자가 1명만 남아 이번 판은 보상 없이 끝났어요.</p>
            ) : (
              <ol>
                {state.ranking.map(({ player, rank, reward }) => (
                  <li key={player.id} className={player.id === SELF ? 'my-ranking' : undefined}>
                    <span>{rank}등</span>
                    <strong>
                      {player.name}
                      {player.id === SELF ? ' (나)' : ''}
                    </strong>
                    <Money amount={player.balance} />
                    <small>+{reward} 캐시</small>
                  </li>
                ))}
              </ol>
            )}
            {result.status === 'FINISHED' && (
              <p className="hud-settlement" role="status">
                {settlementLabel(result.settlement)}
              </p>
            )}
            <p className="hud-waiting-note">다시 준비하면 같은 방에서 한 판 더 할 수 있어요.</p>
          </aside>
        )}
        <section className="hud-chat" aria-label="방 채팅">
          <div className="hud-chat-head">
            <h2>
              <ChatCircleIcon size={18} weight="fill" aria-hidden="true" />
              채팅
            </h2>
            <EmoteButtons
              availableAt={state.players.find((player) => player.id === SELF)?.emote?.availableAt}
              disabled={!online}
              onEmote={(emote) => {
                void client.command({ type: 'EMOTE', emote });
              }}
            />
          </div>
          <ChatLog messages={state.chats} />
          <OnlineChatComposer
            disabled={!online}
            onSend={(body) => client.command({ type: 'SEND_CHAT', body })}
          />
        </section>
        <p className="hud-feedback" role="alert">
          {error}
        </p>
      </div>
    </main>
  );
}
function nickname(room: SharedRoom, userId: string) {
  return room.players.find((player) => player.userId === userId)?.nickname ?? '떠난 참가자';
}
function settlementLabel(settlement: SharedGame['settlement']) {
  switch (settlement) {
    case 'COMPLETED':
      return '보상 캐시가 지갑에 들어왔어요.';
    case 'FAILED':
      return '캐시 정산에 실패했어요. 이번 판 보상은 들어오지 않았어요.';
    default:
      return '캐시를 정산하는 중…';
  }
}
function profitLabel(profit: number) {
  return profit >= 0 ? `+$${profit} 이득` : `-$${-profit} 손해`;
}
