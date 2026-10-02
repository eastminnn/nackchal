import { ArrowCounterClockwiseIcon, TrophyIcon } from '@phosphor-icons/react';
import { Avatar } from '../components/art/Avatar';
import { ObjectArt } from '../components/art/ObjectArt';
import { ChatComposer, ChatLog } from '../components/game/Chat';
import { Badge, Button, Cash, Money } from '../components/ui/primitives';
import type { GameTransport, RoomState } from '../game/types';
import { SELF } from '../game/types';

export function Results({ state, server }: { readonly state: RoomState; readonly server: GameTransport }) {
  const mine = state.ranking.find((r) => r.player.id === SELF);
  return (
    <main className="container results-page">
      <div className="result-title">
        <span className="trophy-mark">
          <TrophyIcon size={32} weight="duotone" />
        </span>
        <span className="eyebrow">최종 정산</span>
        <h1>오늘의 경매, 끝!</h1>
        <p>이번 경매의 낙찰 내역을 확인해 보세요.</p>
        <Badge>10라운드 모두 완료</Badge>
      </div>
      <section className="ranking-list panel" aria-label="최종 순위">
        {state.ranking.map(({ player, rank, reward }) => (
          <div className={`ranking-row ${player.id === SELF ? 'my-ranking' : ''}`} key={player.id}>
            <span className="rank-number">
              {rank === 1 ? <TrophyIcon weight="fill" size={24} /> : String(rank).padStart(2, '0')}
            </span>
            <div className="ranking-avatar">
              <Avatar index={player.avatar} />
            </div>
            <span className="ranking-name">
              <strong>{player.name}</strong>
              {player.id === SELF && <small>나</small>}
            </span>
            <Money amount={player.balance} />
            <Cash amount={reward} />
          </div>
        ))}
      </section>
      <div className="result-reward">
        <span>
          이번 판 보상 <strong>+{mine?.reward ?? 0} 캐시</strong>가 들어왔어요.
        </span>
        <Button onClick={() => server.send({ type: 'RETURN_LOBBY', payload: {} })}>
          <ArrowCounterClockwiseIcon size={20} />한 판 더 준비하기
        </Button>
      </div>
      <section className="history-section">
        <h2>오늘의 낙찰 기록</h2>
        <div className="history-grid">
          {state.history.map((sale) => (
            <article className="history-item" key={sale.round}>
              <ObjectArt kind={sale.lot.kind} />
              <div>
                <small>
                  ROUND {String(sale.round).padStart(2, '0')} · {sale.grade}
                </small>
                <h3>{sale.lot.name}</h3>
                <p>
                  {state.players.find((p) => p.id === sale.winner)?.name ?? '유찰'} · 낙찰가 ${sale.price} →
                  가치 ${sale.value}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <details className="lobby-chat">
        <summary>마지막 한마디</summary>
        <ChatLog messages={state.chats} />
        <ChatComposer server={server} />
      </details>
    </main>
  );
}
