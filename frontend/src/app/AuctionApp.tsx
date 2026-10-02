import { QuestionIcon, SpeakerHighIcon, SpeakerSlashIcon, StorefrontIcon } from '@phosphor-icons/react';
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AuthError, type User } from '../auth/api';
import { BrandMark } from '../components/brand/BrandMark';
import { Shop } from '../components/game/Shop';
import { Modal } from '../components/ui/Modal';
import { Button, Cash } from '../components/ui/primitives';
import type { RoomInfo } from '../data/rooms';
import { LocalGameServer } from '../game/LocalGameServer';
import { useSound } from '../hooks/useSound';
import { Game } from '../pages/Game';
import { Lobby } from '../pages/Lobby';
import { Results } from '../pages/Results';

const LobbyBackdrop = lazy(() => import('../scene/LobbyBackdrop'));

export function AuctionApp({
  user,
  arriving,
  onLogout,
}: {
  readonly user: User;
  readonly arriving: boolean;
  readonly onLogout: () => Promise<void>;
}) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const handleLogout = async () => {
    setLoggingOut(true);
    setSessionError('');
    try {
      await onLogout();
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      setSessionError(error.message);
    } finally {
      setLoggingOut(false);
    }
  };
  const [brandReplay, setBrandReplay] = useState(0);
  const lastBrandPlay = useRef(0);
  const replayBrand = () => {
    const now = performance.now();
    if (arriving || now - lastBrandPlay.current < 1500) return;
    lastBrandPlay.current = now;
    setBrandReplay((previous) => previous + 1);
  };
  const [server] = useState(() => new LocalGameServer());
  const state = useSyncExternalStore(server.subscribe, server.getSnapshot);
  const [modal, setModal] = useState<'rules' | 'shop' | null>(null);
  const [sound, setSound] = useState(false);
  const [rooms, setRooms] = useState<readonly RoomInfo[]>([]);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const enterRoom = (next: RoomInfo, nickname: string) => {
    if (next.status !== 'waiting') return;
    server.send({ type: 'JOIN_ROOM', payload: { nickname } });
    if (!server.getSnapshot().error) {
      const entered = { ...next, players: server.getSnapshot().players.length };
      setRoom(entered);
      setRooms((previous) => previous.map((item) => (item.id === next.id ? entered : item)));
    }
  };
  const leaveRoom = () => {
    server.send({ type: 'LEAVE_ROOM', payload: {} });
    setRooms((previous) => previous.map((item) => (item.id === room?.id ? { ...item, players: 0 } : item)));
    setRoom(null);
  };
  const createRoom = (nickname: string) => {
    const next: RoomInfo = {
      id: String(101 + rooms.length),
      name: `${nickname}의 경매장`,
      subtitle: '내가 만든 작은 경매 모임',
      players: 0,
      capacity: 4,
      status: 'waiting',
      mood: 'lounge',
    };
    setRooms((previous) => [next, ...previous]);
    enterRoom(next, nickname);
  };
  useEffect(() => server.connect(), [server]);
  useSound(sound, state);
  const inRoom = room !== null && state.phase !== 'results';
  const content = (() => {
    switch (state.phase) {
      case 'lobby':
        return room ? (
          <Game key={room.id} state={state} server={server} room={room} onLeave={leaveRoom} />
        ) : (
          <Lobby
            user={user}
            state={state}
            server={server}
            rooms={rooms}
            onEnter={enterRoom}
            onCreate={createRoom}
          />
        );
      case 'auction':
      case 'sold':
      case 'reveal':
        return room ? (
          <Game key={room.id} state={state} server={server} room={room} onLeave={leaveRoom} />
        ) : null;
      case 'results':
        return <Results state={state} server={server} />;
    }
  })();
  return (
    <div className={!inRoom ? 'lobby-shell' : undefined}>
      {state.phase === 'lobby' && !room && (
        <Suspense fallback={null}>
          <LobbyBackdrop state={state} />
        </Suspense>
      )}
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      {!inRoom && (
        <header className="site-header container">
          <a
            className="wordmark"
            href="/"
            aria-label="nackchal 홈"
            onPointerEnter={replayBrand}
            onFocus={replayBrand}
          >
            <BrandMark key={brandReplay} compact animated={!arriving} />
          </a>
          <nav aria-label="메인 메뉴">
            {state.phase === 'results' && (
              <Button variant="ghost" onClick={leaveRoom}>
                방 목록
              </Button>
            )}
            <Button variant="ghost" aria-label="게임 방법" onClick={() => setModal('rules')}>
              <QuestionIcon size={20} />
              <span>게임 방법</span>
            </Button>
            <Button
              variant="ghost"
              aria-label="장난 상점"
              onClick={() => setModal('shop')}
              disabled={state.phase !== 'lobby'}
            >
              <StorefrontIcon size={20} />
              <span>장난 상점</span>
            </Button>
            <span className="header-divider" />
            <Cash amount={state.cash} />
            <Button
              variant="ghost"
              disabled={loggingOut}
              onClick={() => {
                void handleLogout();
              }}
            >
              {loggingOut ? '로그아웃 중…' : '로그아웃'}
            </Button>
            <Button
              variant="icon"
              onClick={() => setSound((v) => !v)}
              aria-label={sound ? '효과음 끄기' : '효과음 켜기'}
              aria-pressed={sound}
            >
              {sound ? <SpeakerHighIcon size={20} /> : <SpeakerSlashIcon size={20} />}
            </Button>
          </nav>
        </header>
      )}
      {sessionError && (
        <p className="session-error container" role="alert">
          {sessionError}
        </p>
      )}
      <div id="main-content">{content}</div>
      {!inRoom && state.phase === 'results' && (
        <footer className="site-footer container">
          <span className="footer-brand">
            nackchal<span>.</span>
          </span>
          <p>좋은 물건보다, 좋은 한 판.</p>
        </footer>
      )}
      {modal === 'shop' && (
        <Modal title="장난 상점" onClose={() => setModal(null)}>
          <Shop state={state} server={server} />
          <p className="error" role="status">
            {state.error}
          </p>
        </Modal>
      )}
      {modal === 'rules' && (
        <Modal title="경매는 진지하게, 장난은 자유롭게." onClose={() => setModal(null)}>
          <div className="rules-list">
            <section>
              <span>01</span>
              <div>
                <h3>$100으로 시작해요</h3>
                <p>물건을 보고 +$1, +$5, +$10으로 입찰해요. 첫 입찰은 $5부터. 총 10라운드를 진행해요.</p>
              </div>
            </section>
            <section>
              <span>02</span>
              <div>
                <h3>낙찰 5초 뒤, 진짜 가치 공개</h3>
                <p>
                  낙찰가는 바로 차감되고, 실제 가치는 공개 순간 돌려받아요. 겉모습의 등급 힌트는 70%만 맞아요.
                </p>
              </div>
            </section>
            <section>
              <span>03</span>
              <div>
                <h3>친구의 얼굴에 토마토를!</h3>
                <p>
                  아이템을 고른 다음 친구의 캐릭터를 누르세요. 장난은 입찰이나 돈에 영향을 주지 않아요. 같은
                  친구에게는 5초 간격으로 던져요.
                </p>
              </div>
            </section>
            <section>
              <span>04</span>
              <div>
                <h3>마지막에 돈이 가장 많으면 승리</h3>
                <p>
                  1등은 10캐시, 2등은 5캐시, 나머지는 2캐시를 받아요. 채팅은 낙찰 여부와 상관없이 언제든
                  가능해요.
                </p>
              </div>
            </section>
          </div>
          <p className="demo-note">
            지금은 방 화면과 채팅을 미리 볼 수 있어요. 사람들과 함께하는 온라인 플레이는 준비 중이에요.
          </p>
          <Button className="rules-close" onClick={() => setModal(null)}>
            좋아, 이해했어!
          </Button>
        </Modal>
      )}
    </div>
  );
}
