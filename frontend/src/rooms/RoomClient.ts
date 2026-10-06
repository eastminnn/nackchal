import type { ConnectionStatus, RoomCommand, RoomSummary, ServerMessage, SharedRoom } from './protocol';
import { RoomSocket } from './RoomSocket';

interface Snapshot {
  readonly status: ConnectionStatus;
  readonly rooms: readonly RoomSummary[];
  readonly room: SharedRoom | null;
  readonly error: string;
  readonly pending: boolean;
}
interface Pending {
  readonly type: RoomCommand['type'];
  readonly resolve: (accepted: boolean) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}
export class RoomClient {
  private state: Snapshot = { status: 'connecting', rooms: [], room: null, error: '', pending: false };
  private readonly listeners = new Set<() => void>();
  private readonly requests = new Map<string, Pending>();
  private listVersion = -1;
  private restoringRoomId: string | null = null;
  private readonly socket: RoomSocket;
  private readonly storageKey: string;
  constructor(userId: string) {
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
  private left() {
    this.clearRestore();
    this.publish({ room: null, error: '' });
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
        this.publish({ room: message.room });
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
        return;
      default:
        return message satisfies never;
    }
  };
}
