import { applySocial, placeBid } from './actions';
import { drawLot, initialState, rankPlayers } from './catalog';
import type { Command, GameTransport, RoomState, Secret, ServerEvent } from './types';
import { MIN_PLAYERS, SELF } from './types';

interface Runtime {
  readonly now: () => number;
  readonly random: () => number;
}
export class LocalGameServer implements GameTransport {
  private state: RoomState;
  private secret: Secret | null = null;
  private listeners = new Set<() => void>();
  private readonly runtime: Runtime;
  constructor(runtime: Partial<Runtime> = {}, state = initialState()) {
    this.state = state;
    this.runtime = {
      now: runtime.now ?? (() => Date.now()),
      random: runtime.random ?? Math.random,
    };
  }
  getSnapshot = (): RoomState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  connect = (): (() => void) => {
    const timer = setInterval(this.tick, 200);
    return () => clearInterval(timer);
  };
  private receive(event: ServerEvent) {
    this.state = event.payload;
    for (const listener of this.listeners) listener();
  }
  private publish(state: RoomState) {
    this.receive({ type: 'ROOM_STATE', payload: state });
  }
  send = (command: Command): void => {
    const now = this.runtime.now();
    switch (command.type) {
      case 'START_GAME':
        if (this.state.phase !== 'lobby') return;
        if (this.state.players.length < MIN_PLAYERS) {
          this.publish({ ...this.state, error: `${MIN_PLAYERS}명 이상 모이면 시작할 수 있어요.` });
          return;
        }
        this.state = {
          ...this.state,
          gameId: this.state.gameId + 1,
          round: 0,
          history: [],
          ranking: [],
          effects: [],
          bids: [],
          error: '',
          players: this.state.players.map((p) => ({ ...p, balance: 100 })),
        };
        this.beginRound(now);
        return;
      case 'PLACE_BID':
        this.publish(placeBid(this.state, { ...command.payload, playerId: SELF, now }));
        return;
      case 'RETURN_LOBBY':
        if (this.state.phase !== 'results') return;
        this.publish({ ...this.state, phase: 'lobby', error: '', revealed: null, loadout: [], effects: [] });
        return;
      case 'LEAVE_ROOM':
        this.secret = null;
        this.publish({
          ...this.state,
          phase: 'lobby',
          round: 0,
          deadline: 0,
          leader: null,
          price: 5,
          extended: 0,
          history: [],
          ranking: [],
          bids: [],
          effects: [],
          chats: [],
          revealed: null,
          error: '',
          announcement: '',
          players: this.state.players.map((player) => ({ ...player, balance: 100 })),
        });
        return;
      case 'JOIN_ROOM':
      case 'READY':
      case 'BUY_ITEM':
      case 'USE_ITEM':
      case 'SEND_CHAT':
        this.publish(applySocial(this.state, command, now));
        return;
    }
  };
  tick = (): void => {
    const now = this.runtime.now();
    switch (this.state.phase) {
      case 'lobby':
      case 'results':
        return;
      case 'auction':
        if (now >= this.state.deadline) {
          this.sell(now);
          return;
        }
        return;
      case 'sold':
        if (now >= this.state.deadline) this.reveal(now);
        return;
      case 'reveal':
        if (now < this.state.deadline) return;
        if (this.state.round < 10) {
          this.beginRound(now);
          return;
        }
        this.finish();
        return;
    }
  };
  private beginRound(now: number) {
    const round = this.state.round + 1;
    const { lot, secret } = drawLot(round, this.runtime.random);
    this.secret = secret;
    this.publish({
      ...this.state,
      phase: 'auction',
      round,
      lot,
      deadline: now + 20000,
      price: 5,
      leader: null,
      extended: 0,
      revealed: null,
      bids: [],
      error: '',
      effects: this.state.effects.filter((e) => e.throughRound >= round),
      announcement: `${round}라운드, ${lot.name} 경매를 시작합니다.`,
    });
  }
  private sell(now: number) {
    this.publish({
      ...this.state,
      phase: 'sold',
      deadline: now + 5000,
      error: '',
      players: this.state.players.map((p) =>
        p.id === this.state.leader ? { ...p, balance: p.balance - this.state.price } : p,
      ),
      announcement: this.state.leader
        ? '낙찰! 5초 뒤 실제 가치를 공개합니다.'
        : '유찰! 5초 뒤 실제 가치를 공개합니다.',
    });
  }
  private reveal(now: number) {
    const secret = this.secret;
    if (!secret) throw new Error('Cannot reveal a round without a value');
    this.publish({
      ...this.state,
      phase: 'reveal',
      deadline: now + 3000,
      revealed: secret,
      players: this.state.players.map((p) =>
        p.id === this.state.leader ? { ...p, balance: p.balance + secret.value } : p,
      ),
      history: [
        ...this.state.history,
        {
          round: this.state.round,
          lot: this.state.lot,
          winner: this.state.leader,
          price: this.state.leader ? this.state.price : 0,
          ...secret,
        },
      ],
      announcement: `${secret.grade}, 실제 가치는 $${secret.value}입니다.`,
    });
  }
  private finish() {
    const ranking = rankPlayers(this.state.players);
    const reward = ranking.find((r) => r.player.id === SELF)?.reward ?? 2;
    this.publish({
      ...this.state,
      phase: 'results',
      ranking,
      cash: this.state.cash + reward,
      effects: [],
      announcement: `게임 종료! ${reward}캐시를 받았어요.`,
    });
  }
}
