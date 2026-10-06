import { AuthError, getUser, renewSession } from '../auth/api';
import { type ConnectionStatus, type ServerMessage, serverMessageSchema } from './protocol';

interface Handlers {
  readonly userId: string;
  readonly onMessage: (message: ServerMessage) => void;
  readonly onStatus: (status: ConnectionStatus) => void;
  readonly onAuthLost: () => void;
  readonly onError: (message: string) => void;
}
export class RoomSocket {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private renewal: ReturnType<typeof setTimeout> | undefined;
  private active = false;
  private generation = 0;
  private attempts = 0;
  private lastPong = 0;
  constructor(private readonly handlers: Handlers) {}
  start = () => {
    this.active = true;
    void this.open();
    window.addEventListener('pagehide', this.pause);
    window.addEventListener('pageshow', this.resume);
    return this.stop;
  };
  stop = () => {
    this.pause();
    window.removeEventListener('pagehide', this.pause);
    window.removeEventListener('pageshow', this.resume);
  };
  private pause = () => {
    this.active = false;
    ++this.generation;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    clearTimeout(this.renewal);
    this.socket?.close();
    this.socket = null;
    this.handlers.onStatus('stopped');
  };
  private resume = () => {
    if (this.active) return;
    this.active = true;
    void this.open();
  };
  send(message: string): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(message);
    return true;
  }
  private schedule() {
    if (!this.active) return;
    this.handlers.onStatus('reconnecting');
    const delay = Math.min(1000 * 2 ** this.attempts++, 10000);
    this.retry = setTimeout(() => {
      void this.open();
    }, delay);
  }
  /**
   * 서버는 연결의 인증 만료 시각에 4401로 연결을 닫는다. 만료 1분 전에 토큰을 갱신하면 서버가
   * AUTH_RENEWED로 새 만료 시각을 알려 주고, 그 시각으로 다음 갱신을 다시 예약한다.
   * 시계가 어긋나도 갱신이 연달아 일어나지 않도록 최소 30초 간격을 둔다.
   */
  private scheduleRenewal(expiresAt: number) {
    clearTimeout(this.renewal);
    const delay = Math.max(expiresAt - Date.now() - 60000, 30000);
    this.renewal = setTimeout(() => {
      // 실패하면 서버가 4401로 닫고 기존 재연결 흐름이 인증을 다시 확인한다.
      renewSession().catch(() => undefined);
    }, delay);
  }
  private async open() {
    const generation = ++this.generation;
    this.handlers.onStatus(this.attempts ? 'reconnecting' : 'connecting');
    try {
      const user = await getUser();
      if (!this.active || generation !== this.generation) return;
      if (user?.id !== this.handlers.userId) {
        this.stop();
        this.handlers.onAuthLost();
        window.dispatchEvent(new Event('focus'));
        return;
      }
      const url = new URL('/api/rooms/ws', window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url);
      this.socket = socket;
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (generation !== this.generation) return;
        try {
          const parsed = serverMessageSchema.safeParse(
            typeof event.data === 'string' ? JSON.parse(event.data) : null,
          );
          if (!parsed.success) {
            this.handlers.onError('대기실 응답을 확인하지 못했어요. 다시 연결하고 있어요.');
            socket.close();
            return;
          }
          const message = parsed.data;
          if (message.type === 'WELCOME') {
            this.attempts = 0;
            this.lastPong = Date.now();
            this.handlers.onStatus('connected');
            this.heartbeat = setInterval(() => {
              if (Date.now() - this.lastPong > 25000) {
                socket.close();
                return;
              }
              this.send(JSON.stringify({ type: 'PING', requestId: crypto.randomUUID() }));
            }, 10000);
          }
          if (message.type === 'WELCOME' || message.type === 'AUTH_RENEWED')
            this.scheduleRenewal(message.type === 'WELCOME' ? message.authExpiresAt : message.expiresAt);
          if (message.type === 'PONG') this.lastPong = Date.now();
          this.handlers.onMessage(message);
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          this.handlers.onError('대기실 응답 형식이 올바르지 않아요.');
          socket.close();
        }
      };
      socket.onclose = (event) => {
        if (generation !== this.generation) return;
        clearInterval(this.heartbeat);
        clearTimeout(this.renewal);
        this.socket = null;
        if (event.code === 4403) {
          this.stop();
          this.handlers.onAuthLost();
          window.dispatchEvent(new Event('focus'));
          return;
        }
        this.schedule();
      };
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      if (!this.active || generation !== this.generation) return;
      this.handlers.onError(error.message);
      this.schedule();
    }
  }
}
