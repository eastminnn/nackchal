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
    game: null,
    starting: false,
  });
const loadWallet = vi.fn(() => Promise.resolve(7));
const loadShop = vi.fn(() =>
  Promise.resolve([
    { code: 'tomato' as const, name: '토마토', price: 3, quantity: 2 },
    { code: 'can' as const, name: '깡통', price: 2, quantity: 0 },
  ]),
);
function setup() {
  const client = new RoomClient(userId, loadWallet, loadShop);
  const call = vi.mocked(RoomSocket).mock.calls.at(-1);
  if (!call) throw new Error('Room socket was not constructed');
  const [handlers] = call;
  handlers.onStatus('connected');
  return { client, handlers };
}
function error(requestId: string, code: string): ServerMessage {
  return { type: 'ERROR', requestId, error: { code, status: 409, message: '입장할 수 없어요.', errors: [] } };
}
describe('wallet', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', { setItem: vi.fn(), getItem: vi.fn(() => null), removeItem: vi.fn() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it('loads my cash on every welcome and follows WALLET events', async () => {
    const { client, handlers } = setup();
    expect(client.getSnapshot().cash).toBeNull();
    handlers.onMessage({ type: 'WELCOME', connectionId: 'a', activeRoomId: null, authExpiresAt: 1 });
    await vi.waitFor(() => expect(client.getSnapshot().cash).toBe(7));
    handlers.onMessage({ type: 'WALLET', balance: 17 });
    expect(client.getSnapshot().cash).toBe(17);
    expect(loadWallet).toHaveBeenCalledTimes(1);
  });
  it('ignores a lookup that started before a newer WALLET event', async () => {
    const { client, handlers } = setup();
    let finish: (cash: number) => void = () => {};
    loadWallet.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    handlers.onMessage({ type: 'WELCOME', connectionId: 'a', activeRoomId: null, authExpiresAt: 1 });
    handlers.onMessage({ type: 'WALLET', balance: 20 });
    finish(10);
    await Promise.resolve();
    expect(client.getSnapshot().cash).toBe(20);
  });
  it('keeps the last known cash when the lookup fails', async () => {
    const { client, handlers } = setup();
    handlers.onMessage({ type: 'WALLET', balance: 3 });
    loadWallet.mockRejectedValueOnce(new Error('offline'));
    handlers.onMessage({ type: 'WELCOME', connectionId: 'a', activeRoomId: null, authExpiresAt: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect(client.getSnapshot().cash).toBe(3);
    expect(client.getSnapshot().error).toBe('');
  });
  it('accepts wallet, starting and settlement fields from the server', () => {
    expect(serverMessageSchema.parse({ type: 'WALLET', balance: 27 })).toEqual({
      type: 'WALLET',
      balance: 27,
    });
    expect(sharedRoomSchema.parse({ ...fixture(), starting: true }).starting).toBe(true);
    expect(() => serverMessageSchema.parse({ type: 'WALLET', balance: -1 })).toThrow();
  });
});

describe('items', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', { setItem: vi.fn(), getItem: vi.fn(() => null), removeItem: vi.fn() });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it('loads the shop on welcome and follows my inventory', async () => {
    const { client, handlers } = setup();
    handlers.onMessage({ type: 'WELCOME', connectionId: 'a', activeRoomId: null, authExpiresAt: 1 });
    await vi.waitFor(() => expect(client.getSnapshot().shop).toHaveLength(2));
    handlers.onMessage({ type: 'INVENTORY', item: 'tomato', quantity: 1, gameRemaining: 2 });
    expect(client.getSnapshot().shop[0]?.quantity).toBe(1);
    expect(client.getSnapshot().throws).toBeNull();
  });
  it('turns thrown items into local-time effects that expire', () => {
    vi.setSystemTime(10_000);
    const { client, handlers } = setup();
    handlers.onMessage({ type: 'ROOM_STATE', serverTime: 12_000, room: fixture() });
    handlers.onMessage(
      serverMessageSchema.parse({
        type: 'ITEM_EFFECT',
        userId: peerId,
        targetUserId: userId,
        item: 'can',
        at: 12_000,
      }),
    );
    expect(client.getSnapshot().effects).toEqual([
      { id: 1, source: peerId, target: userId, item: 'can', at: 10_000, throughRound: 0 },
    ]);
    const user: User = { id: fixture().hostUserId, nickname: '고양이', avatarCode: 'plush-cat' };
    const view = waitingView(initialState(), fixture(), user, 0, {}, client.getSnapshot().effects);
    expect(view.effects[0]).toMatchObject({ source: peerId, target: 'me' });
    vi.advanceTimersByTime(6000);
    expect(client.getSnapshot().effects).toEqual([]);
  });
  it('rejects unknown items', () => {
    expect(() =>
      serverMessageSchema.parse({
        type: 'ITEM_EFFECT',
        userId: peerId,
        targetUserId: userId,
        item: 'banana',
        at: 1,
      }),
    ).toThrow();
  });
});

describe('emotes', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', { setItem: vi.fn(), getItem: vi.fn(() => null), removeItem: vi.fn() });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it('accepts known emotes only', () => {
    const event = { type: 'EMOTE', userId: peerId, emote: 'SMOKE', startedAt: 1_000, endsAt: 7_000 };
    expect(serverMessageSchema.parse(event)).toEqual(event);
    expect(() => serverMessageSchema.parse({ ...event, emote: 'DANCE' })).toThrow();
  });
  it('keeps a running emote in local time until it may be used again', () => {
    vi.setSystemTime(10_000);
    const { client, handlers } = setup();
    handlers.onMessage({ type: 'ROOM_STATE', serverTime: 12_000, room: fixture() });
    handlers.onMessage(
      serverMessageSchema.parse({
        type: 'EMOTE',
        userId: peerId,
        emote: 'MIDDLE_FINGER',
        startedAt: 12_000,
        endsAt: 15_000,
      }),
    );
    expect(client.getSnapshot().emotes[peerId]).toEqual({
      kind: 'MIDDLE_FINGER',
      startedAt: 10_000,
      endsAt: 13_000,
      availableAt: 14_000,
    });
    vi.advanceTimersByTime(3_999);
    expect(client.getSnapshot().emotes[peerId]).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(client.getSnapshot().emotes[peerId]).toBeUndefined();
  });
  it('shows emotes on the right resident, mapping my own to me', () => {
    const user: User = { id: fixture().hostUserId, nickname: '고양이', avatarCode: 'plush-cat' };
    const emote = { kind: 'SMOKE', startedAt: 1, endsAt: 6_001, availableAt: 6_001 } as const;
    const view = waitingView(initialState(), fixture(), user, 0, { [userId]: emote });
    expect(view.players.find((player) => player.id === 'me')?.emote).toEqual(emote);
    expect(view.players.find((player) => player.id === peerId)?.emote).toBeUndefined();
  });
});

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
    handlers.onMessage({ type: 'ROOM_STATE', serverTime: 0, room });
    handlers.onMessage({
      type: 'ROOM_LIST',
      version: 4,
      rooms: [{ ...room, players: 2, status: 'waiting' }],
    });
    handlers.onMessage({ type: 'ROOM_STATE', serverTime: 0, room: { ...room, version: 1, players: [] } });
    handlers.onMessage({ type: 'ROOM_LIST', version: 3, rooms: [] });
    expect(client.getSnapshot().room?.players).toHaveLength(2);
    expect(client.getSnapshot().rooms).toHaveLength(1);
  });
  it('leaves an existing room unchanged when a different join fails', async () => {
    const { client, handlers } = setup();
    handlers.onMessage({ type: 'ROOM_STATE', serverTime: 0, room: fixture() });
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
    handlers.onMessage({ type: 'ROOM_STATE', serverTime: 0, room: fixture() });
    handlers.onMessage(error('00000000-0000-4000-8000-000000000009', 'ROOM_CONNECTION_CONFLICT'));
    handlers.onMessage({
      type: 'WELCOME',
      connectionId: 'new',
      activeRoomId: fixture().id,
      authExpiresAt: Date.now() + 15 * 60000,
    });
    expect(client.getSnapshot().room).toBeNull();
    expect(client.getSnapshot().error).toContain('다른 탭');
    expect(sessionStorage.getItem(`nackchal-room:${userId}`)).toBeNull();
    expect(client.getSnapshot().pending).toBe(false);
  });
  it('clears room and restore intent only after leave is acknowledged', async () => {
    const { client, handlers } = setup();
    handlers.onMessage({ type: 'ROOM_STATE', serverTime: 0, room: fixture() });
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
  it('maps a live auction to local time and hides leadership after the game ends', () => {
    const room = fixture();
    const game = {
      gameId: '00000000-0000-4000-8000-0000000000aa',
      status: 'AUCTION',
      round: 3,
      totalRounds: 10,
      phaseEndsAt: 50_000,
      lot: { kind: 'radio', name: '라디오', description: '', hint: '레어' },
      auction: {
        price: 12,
        leaderUserId: userId,
        bidVersion: 2,
        extendedMs: 0,
        bids: [{ userId, amount: 12, at: 40_000 }],
      },
      players: [
        { userId, balance: 88, left: false },
        { userId: peerId, balance: 100, left: false },
      ],
      reveal: null,
      history: [],
      result: null,
      settlement: null,
    };
    const user: User = { id: room.hostUserId, nickname: '고양이', avatarCode: 'plush-cat' };
    const live = waitingView(initialState(), sharedRoomSchema.parse({ ...room, game }), user, 1_000);
    expect(live.phase).toBe('auction');
    expect(live.deadline).toBe(49_000);
    expect(live.leader).toBe('me');
    expect(live.bids[0]).toMatchObject({ playerId: 'me', amount: 12, at: 39_000 });
    expect(live.players.map((player) => [player.id, player.balance])).toEqual([
      ['me', 88],
      [peerId, 100],
    ]);
    expect(live.revealed).toBeNull();

    const finished = sharedRoomSchema.parse({
      ...room,
      game: {
        ...game,
        status: 'FINISHED',
        phaseEndsAt: null,
        result: { ranking: [{ userId: peerId, rank: 1, balance: 140, reward: 10 }] },
      },
    });
    const results = waitingView(initialState(), finished, user);
    expect(results.phase).toBe('results');
    expect(results.leader).toBeNull();
    expect(results.ranking[0]).toMatchObject({ player: { id: peerId, name: '토끼' }, rank: 1, reward: 10 });
  });
  it('records server clock offset from room snapshots', () => {
    vi.setSystemTime(10_000);
    const { client, handlers } = setup();
    handlers.onMessage({ type: 'ROOM_STATE', serverTime: 12_500, room: fixture() });
    expect(client.getSnapshot().clockOffset).toBe(2_500);
  });
});
