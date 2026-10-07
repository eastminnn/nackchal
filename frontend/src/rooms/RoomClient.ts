import { buyItem, getShop, getWallet, type ShopItem } from '../auth/api';
import type { ActiveEmote, Effect, ItemKind } from '../game/types';
import type { ConnectionStatus, RoomCommand, RoomSummary, ServerMessage, SharedRoom } from './protocol';
import { RoomSocket } from './RoomSocket';

interface Snapshot {
  readonly status: ConnectionStatus;
  readonly rooms: readonly RoomSummary[];
  readonly room: SharedRoom | null;
  readonly error: string;
  readonly pending: boolean;
  /** 서버 시각 - 브라우저 시각(ms). 단계 마감 시각을 브라우저 시계로 바꿀 때 뺀다. */
  readonly clockOffset: number;
  /** 내 캐시 잔액. 아직 불러오지 못했으면 null. */
  readonly cash: number | null;
  /** 사용자 ID별 진행 중인 모션. 다시 쓸 수 있는 시각이 지나면 사라진다. */
  readonly emotes: Readonly<Record<string, ActiveEmote>>;
  /** 판매 중인 아이템과 내 보유 수량. 아직 불러오지 못했으면 비어 있다. */
  readonly shop: readonly ShopItem[];
  /** 진행 중인 던지기 연출. 사용자 ID 기준이며 연출이 끝나면 사라진다. */
  readonly effects: readonly Effect[];
  /** 이번 판에 내가 더 던질 수 있는 수. 다른 판의 값이면 무시하고 판당 최대값으로 본다. */
  readonly throws: { readonly gameId: string; readonly remaining: number } | null;
}
/** 던지기 연출(날아가는 시간 + 토마토 홍조)이 끝난 뒤 지운다. */
const EFFECT_LIFETIME = 6000;
/** 서버와 같은 최소 모션 간격(ms). 동작이 더 길면 동작이 끝나야 다시 쓸 수 있다. */
const EMOTE_COOLDOWN = 4000;
interface Pending {
  readonly type: RoomCommand['type'];
  readonly resolve: (accepted: boolean) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}
export class RoomClient {
  private state: Snapshot = {
    status: 'connecting',
    rooms: [],
    room: null,
    error: '',
    pending: false,
    clockOffset: 0,
    cash: null,
    emotes: {},
    shop: [],
    effects: [],
    throws: null,
  };
  private effectSequence = 0;
  private readonly listeners = new Set<() => void>();
  private readonly requests = new Map<string, Pending>();
  private listVersion = -1;
  private restoringRoomId: string | null = null;
  private readonly emoteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** WALLET 이벤트마다 증가한다. 그보다 먼저 시작한 조회 결과는 버린다. */
  private walletVersion = 0;
  private readonly socket: RoomSocket;
  private readonly storageKey: string;
  constructor(
    userId: string,
    private readonly loadWallet: () => Promise<number> = getWallet,
    private readonly loadShop: () => Promise<ShopItem[]> = getShop,
  ) {
    this.storageKey = `nackchal-room:${userId}`;
    this.socket = new RoomSocket({
      userId,
      onMessage: this.receive,
      onAuthLost: () => this.left(),
      onStatus: (status) => {
        if (status !== 'connected') this.failRequests();
        this.publish({ status });
      },
      onError: (error) => this.publish({ error }),
    });
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  connect = () => this.socket.start();
  clearRestore = () => sessionStorage.removeItem(this.storageKey);
  private publish(next: Partial<Snapshot>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
  private settle(id: string, accepted: boolean) {
    const request = this.requests.get(id);
    if (!request) return;
    clearTimeout(request.timer);
    this.requests.delete(id);
    if (accepted && request.type === 'LEAVE_ROOM') this.left();
    request.resolve(accepted);
    this.publish({ pending: this.requests.size > 0 });
  }
  private failRequests() {
    for (const id of this.requests.keys()) this.settle(id, false);
  }
  /** 아이템을 산다. 성공하면 캐시와 보유 수량을 바로 바꾸고, 실패하면 이유를 돌려준다. */
  buy = async (item: ItemKind, quantity: number): Promise<string | null> => {
    try {
      const purchase = await buyItem(item, quantity, crypto.randomUUID());
      this.walletVersion++;
      this.publish({ cash: purchase.balance, shop: this.withQuantity(purchase.itemCode, purchase.quantity) });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : '구매하지 못했어요.';
    }
  };
  private withQuantity(item: ItemKind, quantity: number) {
    return this.state.shop.map((entry) => (entry.code === item ? { ...entry, quantity } : entry));
  }
  private left() {
    this.clearRestore();
    for (const timer of this.emoteTimers.values()) clearTimeout(timer);
    this.emoteTimers.clear();
    this.publish({ room: null, error: '', emotes: {} });
  }
  /** 서버 시각의 모션을 브라우저 시각으로 바꿔 보관하고, 다시 쓸 수 있는 시각에 지운다. */
  private emote(userId: string, emote: Omit<ActiveEmote, 'availableAt'>) {
    const startedAt = emote.startedAt - this.state.clockOffset;
    const endsAt = emote.endsAt - this.state.clockOffset;
    const availableAt = startedAt + Math.max(EMOTE_COOLDOWN, endsAt - startedAt);
    clearTimeout(this.emoteTimers.get(userId));
    this.emoteTimers.set(
      userId,
      setTimeout(() => {
        this.emoteTimers.delete(userId);
        const { [userId]: _expired, ...rest } = this.state.emotes;
        this.publish({ emotes: rest });
      }, availableAt - Date.now()),
    );
    this.publish({
      emotes: { ...this.state.emotes, [userId]: { kind: emote.kind, startedAt, endsAt, availableAt } },
    });
  }
  command = (command: RoomCommand): Promise<boolean> => {
    if (this.state.status !== 'connected') {
      this.publish({ error: '연결이 끊겼어요. 다시 연결된 뒤 시도해 주세요.' });
      return Promise.resolve(false);
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.publish({ error: '응답이 늦어지고 있어요. 연결 상태를 확인해 주세요.' });
        this.settle(requestId, false);
      }, 10000);
      this.requests.set(requestId, { type: command.type, resolve, timer });
      this.publish({ pending: true, error: '' });
      if (!this.socket.send(JSON.stringify({ ...command, requestId }))) this.settle(requestId, false);
    });
  };
  private receive = (message: ServerMessage) => {
    switch (message.type) {
      case 'WELCOME': {
        this.listVersion = -1;
        // 연결할 때마다 잔액을 다시 읽어 끊긴 동안 놓친 WALLET 이벤트를 메운다.
        this.loadShop().then(
          (shop) => this.publish({ shop }),
          () => {},
        );
        const version = this.walletVersion;
        this.loadWallet().then(
          (cash) => {
            if (version === this.walletVersion) this.publish({ cash });
          },
          () => {},
        );
        const restore = sessionStorage.getItem(this.storageKey);
        this.restoringRoomId = restore;
        if (restore) void this.command({ type: 'JOIN_ROOM', roomId: restore });
        return;
      }
      case 'ROOM_LIST':
        if (message.version < this.listVersion) return;
        this.listVersion = message.version;
        this.publish({ rooms: message.rooms });
        return;
      case 'ROOM_STATE':
        if (this.state.room?.id === message.room.id && this.state.room.version > message.room.version) return;
        this.restoringRoomId = null;
        sessionStorage.setItem(this.storageKey, message.room.id);
        this.publish({ room: message.room, clockOffset: message.serverTime - Date.now() });
        return;
      case 'EMOTE':
        this.emote(message.userId, {
          kind: message.emote,
          startedAt: message.startedAt,
          endsAt: message.endsAt,
        });
        return;
      case 'ITEM_EFFECT': {
        const effect: Effect = {
          id: ++this.effectSequence,
          source: message.userId,
          target: message.targetUserId,
          item: message.item,
          at: message.at - this.state.clockOffset,
          throughRound: 0,
        };
        this.publish({ effects: [...this.state.effects, effect] });
        setTimeout(
          () => this.publish({ effects: this.state.effects.filter((other) => other.id !== effect.id) }),
          EFFECT_LIFETIME,
        );
        return;
      }
      case 'INVENTORY':
        this.publish({
          shop: this.withQuantity(message.item, message.quantity),
          throws: this.state.room?.game
            ? { gameId: this.state.room.game.gameId, remaining: message.gameRemaining }
            : null,
        });
        return;
      case 'WALLET':
        this.walletVersion++;
        this.publish({ cash: message.balance });
        return;
      case 'LEFT':
        this.left();
        return;
      case 'ACK':
        this.settle(message.requestId, true);
        return;
      case 'ERROR': {
        const conflict = message.error.code === 'ROOM_CONNECTION_CONFLICT';
        if (conflict || message.error.code === 'ROOM_NOT_FOUND' || message.error.code === 'ROOM_EXPIRED') {
          this.clearRestore();
          if (conflict || this.state.room?.id === this.restoringRoomId) this.publish({ room: null });
          this.restoringRoomId = null;
        }
        this.publish({
          error: conflict
            ? '다른 탭에서 이미 방에 참여하고 있어요. 그 탭에서 나간 뒤 다시 입장해 주세요.'
            : message.error.message,
        });
        if (message.requestId) this.settle(message.requestId, false);
        return;
      }
      case 'PONG':
      case 'AUTH_RENEWED':
        return;
      default:
        return message satisfies never;
    }
  };
}
