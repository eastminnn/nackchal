import {
  ArrowLeftIcon,
  ChatCircleIcon,
  HandCoinsIcon,
  PlayIcon,
  SuitcaseSimpleIcon,
  XIcon,
} from '@phosphor-icons/react';
import { lazy, Suspense, useCallback, useState } from 'react';
import { ObjectArt } from '../components/art/ObjectArt';
import { ChatComposer, ChatLog } from '../components/game/Chat';
import { Players } from '../components/game/Players';
import { Loadout } from '../components/game/Shop';
import { Timer } from '../components/game/Timer';
import { Button, Money } from '../components/ui/primitives';
import type { RoomInfo } from '../data/rooms';
import {
  type GameTransport,
  ITEM_NAMES,
  type ItemKind,
  MIN_PLAYERS,
  type RoomState,
  SELF,
} from '../game/types';

const AuctionRoom = lazy(() => import('../scene/AuctionRoom'));

export function Game({
  state,
  server,
  room,
  onLeave,
}: {
  readonly state: RoomState;
  readonly server: GameTransport;
  readonly room: RoomInfo;
  readonly onLeave: () => void;
}) {
  const [selected, setSelected] = useState<ItemKind | null>(null);
  const [modelsReady, setModelsReady] = useState(false);
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const onReady = useCallback(() => setModelsReady(true), []);
  const waiting = state.phase === 'lobby';
  const enoughPlayers = state.players.length >= MIN_PLAYERS;
  const me = state.players.find((player) => player.id === SELF);
  const winner = state.players.find((player) => player.id === state.leader);
  const throwItem = (target: string) => {
    if (!selected) return;
    server.send({ type: 'USE_ITEM', payload: { item: selected, target } });
    if (!server.getSnapshot().error) setSelected(null);
  };
  return (
    <main className="immersive-game" aria-label={room.name}>
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
            onClick={onLeave}
            aria-label="방 목록"
            title="방 목록으로 나가기"
          >
            <ArrowLeftIcon size={20} />
          </button>
          <span>
            {room.name}
            <small>#{room.id}</small>
          </span>
        </div>
        <div className="hud-round">
          <span className="round-counter">
            {waiting ? (
              `${state.players.length} / ${room.capacity}명`
            ) : (
              <>
                <strong>{String(state.round).padStart(2, '0')}</strong> / 10
              </>
            )}
          </span>
          {!waiting && <Timer deadline={state.deadline} />}
        </div>
        {!waiting && (
          <section className="hud-lot" aria-label="현재 경매 물건">
            <span className="eyebrow">
              LOT {String(state.round).padStart(3, '0')} · {state.lot.hint} 느낌
            </span>
            <h2>{state.lot.name}</h2>
            <span className="hud-price current-price">
              <Money amount={state.price} />
            </span>
            <span className="hud-leader">{winner ? winner.name : '첫 입찰을 기다려요'}</span>
          </section>
        )}
        {state.revealed && (
          <div className="hud-reveal" role="status">
            <span>{state.revealed.grade} · 실제 가치</span>
            <strong>
              <Money amount={state.revealed.value} />
            </strong>
            <span>{winner ? `${winner.name}에게 정산 완료` : '이번 물건은 유찰됐어요'}</span>
          </div>
        )}
        {waiting ? (
          <div className="hud-ready">
            <Button
              disabled={!modelsReady || !enoughPlayers}
              onClick={() => {
                setLoadoutOpen(false);
                server.send({ type: 'START_GAME', payload: {} });
              }}
            >
              <PlayIcon size={18} weight="fill" />
              {!modelsReady ? '모델 불러오는 중…' : enoughPlayers ? '경매 시작하기' : '참가자를 기다리는 중'}
            </Button>
            {!enoughPlayers && (
              <p className="hud-waiting-note">
                {MIN_PLAYERS}명부터 시작할 수 있어요. 온라인 연결은 준비 중이에요.
              </p>
            )}
            <button
              className="hud-quiet"
              type="button"
              onClick={() => setLoadoutOpen(!loadoutOpen)}
              aria-expanded={loadoutOpen}
            >
              <SuitcaseSimpleIcon size={16} />
              장난 주머니 · {state.loadout.length}/3
            </button>
          </div>
        ) : (
          <section className="hud-bidding" aria-label="입찰하기">
            <div className="hud-wallet">
              <HandCoinsIcon size={16} />
              <span>내 잔액</span>
              <Money amount={me?.balance ?? 0} />
            </div>
            <div className="bid-buttons">
              {[1, 5, 10].map((increment) => {
                const amount = state.leader ? state.price + increment : increment === 1 ? 5 : 5 + increment;
                return (
                  <Button
                    key={increment}
                    variant={increment === 1 ? 'primary' : 'secondary'}
                    aria-label={`${amount}달러 입찰`}
                    disabled={
                      state.phase !== 'auction' || state.leader === SELF || amount > (me?.balance ?? 0)
                    }
                    onClick={() =>
                      server.send({ type: 'PLACE_BID', payload: { round: state.round, amount } })
                    }
                  >
                    {state.leader ? `+$${increment}` : `$${amount}`}
                    <small>입찰</small>
                  </Button>
                );
              })}
            </div>
          </section>
        )}
        <section className="hud-chat" aria-label="방 채팅">
          <h2>
            <ChatCircleIcon size={18} weight="fill" aria-hidden="true" />
            채팅
          </h2>
          <ChatLog messages={state.chats} />
          <ChatComposer server={server} />
        </section>
        {!waiting && (
          <section className="hud-items" aria-label="장난 주머니">
            {(['tomato', 'can'] as const).map((item) => {
              const count = state.loadout.filter((value) => value === item).length;
              return (
                <button
                  key={item}
                  type="button"
                  className={selected === item ? 'hud-item selected' : 'hud-item'}
                  aria-label={`${ITEM_NAMES[item]} 선택`}
                  aria-pressed={selected === item}
                  disabled={!count}
                  onClick={() => setSelected(selected === item ? null : item)}
                >
                  <ObjectArt kind={item} />
                  <span>
                    {ITEM_NAMES[item]} <strong>×{count}</strong>
                  </span>
                </button>
              );
            })}
          </section>
        )}
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
        {loadoutOpen && (
          <aside className="hud-drawer hud-drawer-loadout" aria-label="장난 주머니 설정">
            <button
              className="hud-drawer-close hud-quiet"
              type="button"
              aria-label="닫기"
              onClick={() => setLoadoutOpen(false)}
            >
              <XIcon size={18} />
            </button>
            <Loadout state={state} server={server} />
          </aside>
        )}
        <p className="hud-feedback" role="status">
          {state.error}
        </p>
      </div>
    </main>
  );
}
