import { ArrowLeftIcon, ChatCircleIcon, CheckIcon } from '@phosphor-icons/react';
import { lazy, Suspense, useCallback, useState } from 'react';
import type { User } from '../auth/api';
import { ChatLog, OnlineChatComposer } from '../components/game/Chat';
import { Button } from '../components/ui/primitives';
import type { RoomState } from '../game/types';
import { ConnectionNotice } from '../rooms/ConnectionNotice';
import type { ConnectionStatus, SharedRoom } from '../rooms/protocol';
import type { RoomClient } from '../rooms/RoomClient';

const AuctionRoom = lazy(() => import('../scene/AuctionRoom'));
export function WaitingRoom({
  room,
  state,
  client,
  user,
  status,
  pending,
  error,
}: {
  readonly room: SharedRoom;
  readonly state: RoomState;
  readonly client: RoomClient;
  readonly user: User;
  readonly status: ConnectionStatus;
  readonly pending: boolean;
  readonly error: string;
}) {
  const [modelsReady, setModelsReady] = useState(false);
  const onReady = useCallback(() => setModelsReady(true), []);
  const me = room.players.find((player) => player.userId === user.id);
  const online = status === 'connected';
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
          <AuctionRoom state={state} targeting={false} onReady={onReady} />
        </Suspense>
      </div>
      <div className="room-hud">
        <div className="hud-room">
          <button
            className="hud-exit"
            type="button"
            aria-label="방 목록"
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
          <span className="round-counter">{room.players.length} / 4명</span>
        </div>
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
          <Button
            disabled={!online || pending || !me}
            aria-pressed={me?.ready ?? false}
            onClick={() => {
              void client.command({ type: 'SET_READY', ready: !me?.ready });
            }}
          >
            <CheckIcon size={18} />
            {me?.ready ? '준비 취소' : '준비하기'}
          </Button>
          <p className="hud-waiting-note">
            함께 입장하고 준비할 수 있어요.
            <br />
            경매 시작 기능은 아직 준비 중이에요.
          </p>
        </div>
        <section className="hud-chat" aria-label="방 채팅">
          <h2>
            <ChatCircleIcon size={18} weight="fill" aria-hidden="true" />
            채팅
          </h2>
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
