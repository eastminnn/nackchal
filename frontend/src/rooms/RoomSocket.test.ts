import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUser, type User } from '../auth/api';
import { sharedRoomSchema } from './protocol';
import { RoomSocket } from './RoomSocket';

vi.mock('../auth/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../auth/api')>();
  return { ...original, getUser: vi.fn() };
});
class SocketBoundary {
  static readonly OPEN = 1;
  static instances: SocketBoundary[] = [];
  readyState = 1;
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onclose: ((event: { readonly code: number }) => void) | null = null;
  sent: string[] = [];
  constructor(readonly url: URL) {
    SocketBoundary.instances.push(this);
  }
  send(message: string) {
    this.sent.push(message);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  message(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
}
const user: User = {
  id: sharedRoomSchema.shape.hostUserId.parse('00000000-0000-4000-8000-000000000001'),
  nickname: '작은곰',
  avatarCode: 'plush-bear',
};
function boundary() {
  const socket = SocketBoundary.instances.at(-1);
  if (!socket) throw new Error('Expected WebSocket connection');
  return socket;
}
function setup() {
  const handlers = {
    userId: user.id,
    onMessage: vi.fn(),
    onStatus: vi.fn(),
    onError: vi.fn(),
    onAuthLost: vi.fn(),
  };
  const transport = new RoomSocket(handlers);
  const stop = transport.start();
  return { handlers, transport, stop };
}
describe('room socket lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    SocketBoundary.instances = [];
    vi.stubGlobal('WebSocket', SocketBoundary);
    vi.stubGlobal(
      'window',
      Object.assign(new EventTarget(), { location: { href: 'https://auction.example/' } }),
    );
    vi.mocked(getUser).mockResolvedValue(user);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it('announces connected only after validated welcome and uses same-origin secure socket', async () => {
    const { handlers, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);
    expect(handlers.onStatus).not.toHaveBeenCalledWith('connected');
    expect(boundary().url.href).toBe('wss://auction.example/api/rooms/ws');
    boundary().message({ type: 'WELCOME', connectionId: 'socket-1', activeRoomId: null });
    expect(handlers.onStatus).toHaveBeenLastCalledWith('connected');
    stop();
  });
  it('refreshes authentication before reconnecting after a transport close', async () => {
    const { handlers, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);
    boundary().close();
    expect(handlers.onStatus).toHaveBeenLastCalledWith('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(SocketBoundary.instances).toHaveLength(2);
    stop();
  });
  it('stops retries and clears membership when the server closes a revoked session', async () => {
    const { handlers, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);
    boundary().onclose?.({ code: 4403 });
    window.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(30000);
    expect(handlers.onAuthLost).toHaveBeenCalledOnce();
    expect(handlers.onStatus).toHaveBeenLastCalledWith('stopped');
    expect(SocketBoundary.instances).toHaveLength(1);
    stop();
  });
  it('releases the socket on pagehide and reconnects after a persisted page returns', async () => {
    const { handlers, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);
    const previous = boundary();
    window.dispatchEvent(new Event('pagehide'));
    expect(previous.readyState).toBe(3);
    expect(handlers.onStatus).toHaveBeenLastCalledWith('stopped');
    window.dispatchEvent(new Event('pageshow'));
    await vi.advanceTimersByTimeAsync(0);
    expect(SocketBoundary.instances).toHaveLength(2);
    stop();
  });
  it('stops claiming connected when heartbeat responses disappear', async () => {
    const { handlers, stop } = setup();
    await vi.advanceTimersByTimeAsync(0);
    boundary().message({ type: 'WELCOME', connectionId: 'socket-1', activeRoomId: null });
    await vi.advanceTimersByTimeAsync(30000);
    expect(handlers.onStatus).toHaveBeenLastCalledWith('reconnecting');
    expect(boundary().sent).toHaveLength(2);
    stop();
  });
});
