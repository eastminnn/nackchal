import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../auth/api';
import { initialState } from '../game/catalog';
import { type ServerMessage, serverMessageSchema, sharedRoomSchema } from './protocol';
import { RoomClient } from './RoomClient';
import { RoomSocket } from './RoomSocket';
import { waitingView } from './view';

vi.mock('./RoomSocket', () => ({
  RoomSocket: vi.fn(
    class {
      start = vi.fn(() => () => {});
      send = vi.fn(() => true);
    },
  ),
}));
const userId = '00000000-0000-4000-8000-000000000001';
const peerId = '00000000-0000-4000-8000-000000000002';
const fixture = () =>
  sharedRoomSchema.parse({
    id: 'ABC123',
    name: '함께하는 방',
    hostUserId: userId,
    capacity: 4,
    version: 2,
    players: [
      { userId: peerId, nickname: '토끼', avatarCode: 'plush-bunny', seat: 0, ready: false, connected: true },
      { userId, nickname: '고양이', avatarCode: 'plush-cat', seat: 2, ready: true, connected: true },
    ],
    chats: [{ id: 1, userId: peerId, nickname: '토끼', body: '안녕', at: 10 }],
  });
function setup() {
  const client = new RoomClient(userId);
  const call = vi.mocked(RoomSocket).mock.calls.at(-1);
  if (!call) throw new Error('Room socket was not constructed');
  const [handlers] = call;
  handlers.onStatus('connected');
  return { client, handlers };
}
function error(requestId: string, code: string): ServerMessage {
  return { type: 'ERROR', requestId, error: { code, status: 409, message: '입장할 수 없어요.', errors: [] } };
}
describe('shared room state boundary', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      setItem: (key: string, value: string) => data.set(key, value),
      getItem: (key: string) => data.get(key) ?? null,
      removeItem: (key: string) => data.delete(key),
    });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it('preserves the newest room and directory when stale snapshots arrive', () => {
    const { client, handlers } = setup();
    const room = fixture();
    handlers.onMessage({ type: 'ROOM_STATE', room });
    handlers.onMessage({
      type: 'ROOM_LIST',
      version: 4,
      rooms: [{ ...room, players: 2, status: 'waiting' }],
    });
    handlers.onMessage({ type: 'ROOM_STATE', room: { ...room, version: 1, players: [] } });
    handlers.onMessage({ type: 'ROOM_LIST', version: 3, rooms: [] });
    expect(client.getSnapshot().room?.players).toHaveLength(2);
    expect(client.getSnapshot().rooms).toHaveLength(1);
  });
  it('leaves an existing room unchanged when a different join fails', async () => {
    const { client, handlers } = setup();
    handlers.onMessage({ type: 'ROOM_STATE', room: fixture() });
    const id = '00000000-0000-4000-8000-000000000009';
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(id);
    const sent = client.command({ type: 'JOIN_ROOM', roomId: 'OTHER1' });
    handlers.onMessage(error(id, 'ROOM_ALREADY_JOINED'));
    expect(await sent).toBe(false);
    expect(client.getSnapshot().room?.id).toBe('ABC123');
  });
  it('keeps a rejected chat unacknowledged and clears a pending command on disconnect', async () => {
    const { client, handlers } = setup();
    const sent = client.command({ type: 'SEND_CHAT', body: '안녕' });
    handlers.onStatus('reconnecting');
    expect(await sent).toBe(false);
    expect(client.getSnapshot().pending).toBe(false);
    expect(client.getSnapshot().status).toBe('reconnecting');
  });
  it('clears restore intent after duplicate connection rejection', () => {
    const { client, handlers } = setup();
    handlers.onMessage({ type: 'ROOM_STATE', room: fixture() });
    handlers.onMessage(error('00000000-0000-4000-8000-000000000009', 'ROOM_CONNECTION_CONFLICT'));
    handlers.onMessage({ type: 'WELCOME', connectionId: 'new', activeRoomId: fixture().id });
    expect(client.getSnapshot().room).toBeNull();
    expect(client.getSnapshot().error).toContain('다른 탭');
    expect(sessionStorage.getItem(`nackchal-room:${userId}`)).toBeNull();
    expect(client.getSnapshot().pending).toBe(false);
  });
  it('clears room and restore intent only after leave is acknowledged', async () => {
    const { client, handlers } = setup();
    handlers.onMessage({ type: 'ROOM_STATE', room: fixture() });
    const id = '00000000-0000-4000-8000-000000000009';
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(id);
    const sent = client.command({ type: 'LEAVE_ROOM' });
    expect(client.getSnapshot().room?.id).toBe('ABC123');
    handlers.onMessage({ type: 'ACK', requestId: id });
    expect(await sent).toBe(true);
    expect(client.getSnapshot().room).toBeNull();
    expect(sessionStorage.getItem(`nackchal-room:${userId}`)).toBeNull();
  });
  it('rejects malformed participant avatars and impossible occupancy at the boundary', () => {
    const room = fixture();
    expect(
      serverMessageSchema.safeParse({
        type: 'ROOM_STATE',
        room: { ...room, players: [{ ...room.players[0], avatarCode: 'unknown' }] },
      }).success,
    ).toBe(false);
    expect(
      serverMessageSchema.safeParse({
        type: 'ROOM_LIST',
        version: 1,
        rooms: [{ ...room, players: 5, status: 'full' }],
      }).success,
    ).toBe(false);
  });
  it('maps only self identity for the 3D view and retains authoritative avatars', () => {
    const room = fixture();
    const user: User = { id: room.hostUserId, nickname: '고양이', avatarCode: 'plush-cat' };
    const view = waitingView(initialState(), room, user);
    expect(view.players.map((player) => [player.id, player.avatar])).toEqual([
      ['me', 2],
      [peerId, 1],
    ]);
    expect(view.chats[0]?.playerId).toBe(peerId);
    expect(room.players[1]?.userId).toBe(userId);
  });
});
