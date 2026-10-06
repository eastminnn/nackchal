import { ArrowRightIcon, MagnifyingGlassIcon, PlusIcon, UsersIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import type { User } from '../auth/api';
import { Loadout } from '../components/game/Shop';
import { Button } from '../components/ui/primitives';
import { ROOM_STATUS, type RoomInfo } from '../data/rooms';
import type { GameTransport, RoomState } from '../game/types';

const ROOM_PORTRAITS = {
  lounge: 'plush-bear',
  library: 'plush-bunny',
  midnight: 'plush-cat',
} as const;

export function Lobby({
  user,
  state,
  server,
  rooms,
  onEnter,
  onCreate,
  disabled = false,
}: {
  readonly disabled?: boolean;
  readonly user: User;
  readonly state: RoomState;
  readonly server: GameTransport;
  readonly rooms: readonly RoomInfo[];
  readonly onEnter: (room: RoomInfo, nickname: string) => void;
  readonly onCreate: (nickname: string) => void;
}) {
  const nickname = user.nickname;
  const [query, setQuery] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const filtered = rooms.filter(
    (room) => room.name.includes(query.trim()) && (!availableOnly || room.status === 'waiting'),
  );
  return (
    <main className="container directory">
      <div className="directory-layout">
        <aside className="directory-profile">
          <section className="profile-card">
            <div className="profile-character">
              <img
                src="/art/residents/plush-lobby.webp"
                width="600"
                height="680"
                alt="작은 귀와 둥근 발을 가진 곰 봉제인형 캐릭터"
                fetchPriority="high"
              />
            </div>
            <div className="profile-name">
              <span className="profile-tag">내 자리</span>
              <h2 className="profile-account-name">{nickname}</h2>
              <p className="error" role="status">
                {state.error}
              </p>
              <p className="profile-hint">오늘도 반가워, 경매사.</p>
            </div>
          </section>
          <details className="directory-loadout">
            <summary>
              장난 주머니 · 미리보기 <span>{state.loadout.length} / 3</span>
            </summary>
            <Loadout state={state} server={server} />
          </details>
          <p className="lobby-tip">팻말을 들 준비가 됐다면, 빈자리에 앉아 보세요.</p>
        </aside>
        <section className="room-directory" aria-labelledby="room-list-title">
          <div className="directory-toolbar">
            <div>
              <span className="board-label">경매 대기실</span>
              <h1 id="room-list-title">
                함께할 방 찾기 <small>{filtered.length}</small>
              </h1>
            </div>
            <Button variant="secondary" disabled={disabled} onClick={() => onCreate(nickname)}>
              <PlusIcon size={17} />방 만들기
            </Button>
          </div>
          <div className="room-filters">
            <label className="room-search">
              <MagnifyingGlassIcon size={19} />
              <input
                aria-label="방 이름 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="방 이름으로 찾아보기"
              />
            </label>
            <label className="available-toggle">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(event) => setAvailableOnly(event.target.checked)}
              />
              입장 가능한 방만
            </label>
          </div>
          <div className="room-list">
            {filtered.map((room) => (
              <article className="room-row" key={room.id}>
                <div className={`room-emblem mood-${room.mood}`}>
                  <img
                    src={`/art/residents/${ROOM_PORTRAITS[room.mood]}.webp`}
                    width="600"
                    height="680"
                    alt=""
                  />
                </div>
                <div className="room-row-copy">
                  <div className="room-row-title">
                    <h2>{room.name}</h2>
                    <span className={`room-state state-${room.status}`}>{ROOM_STATUS[room.status]}</span>
                  </div>
                  <p>{room.subtitle}</p>
                  <div className="room-meta">
                    <span>
                      <UsersIcon size={14} />
                      {room.players} / {room.capacity}
                    </span>
                    <span>#{room.id}</span>
                  </div>
                </div>
                <Button
                  variant={room.status === 'waiting' ? 'primary' : 'secondary'}
                  disabled={disabled || room.status !== 'waiting'}
                  aria-label={`${room.name} ${room.status === 'waiting' ? '입장' : ROOM_STATUS[room.status]}`}
                  onClick={() => onEnter(room, nickname)}
                >
                  {room.status === 'waiting' ? (
                    <>
                      입장
                      <ArrowRightIcon size={16} />
                    </>
                  ) : (
                    ROOM_STATUS[room.status]
                  )}
                </Button>
              </article>
            ))}
            {!filtered.length && (
              <div className="rooms-empty">
                <MagnifyingGlassIcon size={28} />
                <h2>{rooms.length ? '찾는 방이 없어요' : '아직 열린 방이 없어요'}</h2>
                <p>
                  {rooms.length
                    ? '다른 이름으로 검색하거나 필터를 해제해 보세요.'
                    : '방을 만들어 경매장을 먼저 둘러보세요.'}
                </p>
                {rooms.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setQuery('');
                      setAvailableOnly(false);
                    }}
                  >
                    전체 방 보기
                  </Button>
                )}
              </div>
            )}
          </div>
          <p className="directory-note">
            최대 4명이 함께 준비하고 채팅할 수 있어요.
            <span>2명부터 경매를 시작할 수 있어요</span>
          </p>
        </section>
      </div>
      <p className="lobby-footnote">
        nackchal · 미리보기{' '}
        <a href="/credits.html" target="_blank" rel="noreferrer">
          모델 출처
        </a>
      </p>
    </main>
  );
}
