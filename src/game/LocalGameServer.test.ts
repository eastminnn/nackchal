import { describe, expect, it } from 'vitest';
import { placeBid } from './actions';
import { initialState, rankPlayers } from './catalog';
import { LocalGameServer } from './LocalGameServer';
import type { RoomState } from './types';

function occupiedRoom(): RoomState {
  return {
    ...initialState(),
    players: [
      { id: 'me', name: '나', avatar: 0, balance: 100 },
      { id: 'player-2', name: '참가자2', avatar: 1, balance: 100 },
      { id: 'player-3', name: '참가자3', avatar: 2, balance: 100 },
      { id: 'player-4', name: '참가자4', avatar: 3, balance: 100 },
    ],
  };
}

function fixture() {
  let now = 100000;
  const server = new LocalGameServer({ now: () => now, random: () => 0.3 }, occupiedRoom());
  const advance = (milliseconds: number) => {
    now += milliseconds;
    server.tick();
  };
  const start = () => server.send({ type: 'START_GAME', payload: {} });
  return { server, advance, start };
}
describe('local auction server', () => {
  it('starts the local preview with only the current player', () => {
    const server = new LocalGameServer();
    expect(server.getSnapshot().players.map((player) => player.id)).toEqual(['me']);
  });
  it.each([0, 1])('keeps the room waiting with %i participants', (count) => {
    let now = 100000;
    const state = { ...initialState(), players: initialState().players.slice(0, count) };
    const server = new LocalGameServer({ now: () => now }, state);
    server.send({ type: 'START_GAME', payload: {} });
    now += 600000;
    server.tick();
    const result = server.getSnapshot();
    expect(result.phase).toBe('lobby');
    expect(result.round).toBe(0);
    expect(result.deadline).toBe(0);
    expect(result.gameId).toBe(0);
    expect(result.error).not.toBe('');
    expect(result.cash).toBe(state.cash);
    expect(result.players).toEqual(state.players);
    expect(result.bids).toEqual([]);
    expect(result.chats).toEqual([]);
    expect(result.effects).toEqual([]);
  });
  it('allows two participants to start and never acts on their behalf', () => {
    let now = 100000;
    const state = { ...occupiedRoom(), players: occupiedRoom().players.slice(0, 2) };
    const server = new LocalGameServer({ now: () => now, random: () => 0.1 }, state);
    server.send({ type: 'START_GAME', payload: {} });
    for (let second = 0; second < 19; second++) {
      now += 1000;
      server.tick();
    }
    const result = server.getSnapshot();
    expect(result.phase).toBe('auction');
    expect(result.round).toBe(1);
    expect(result.leader).toBeNull();
    expect(result.bids).toEqual([]);
    expect(result.chats).toEqual([]);
    expect(result.effects).toEqual([]);
  });
  it('leaves an active room without a reward and preserves purchased supplies', () => {
    const { server, start, advance } = fixture();
    server.send({ type: 'JOIN_ROOM', payload: { nickname: '경매사' } });
    server.send({ type: 'BUY_ITEM', payload: { item: 'tomato' } });
    start();
    server.send({ type: 'PLACE_BID', payload: { round: 1, amount: 5 } });
    server.send({ type: 'LEAVE_ROOM', payload: {} });
    advance(60000);
    const state = server.getSnapshot();
    expect(state.phase).toBe('lobby');
    expect(state.round).toBe(0);
    expect(state.leader).toBeNull();
    expect(state.history).toEqual([]);
    expect(state.cash).toBe(9);
    expect(state.inventory.tomato).toBe(3);
    expect(state.players[0]?.name).toBe('경매사');
    start();
    expect(server.getSnapshot().round).toBe(1);
    expect(server.getSnapshot().bids).toEqual([]);
  });
  it('keeps paddle ownership tied to player IDs when names match and bids are rejected', () => {
    const initial = occupiedRoom();
    const state = {
      ...initial,
      phase: 'auction' as const,
      round: 1,
      deadline: 20000,
      players: initial.players.map((player) => ({ ...player, name: '같은이름' })),
    };
    const mine = placeBid(state, { playerId: 'me', amount: 5, round: 1, now: 100 });
    const other = placeBid(mine, { playerId: 'player-2', amount: 10, round: 1, now: 200 });
    expect(other.bids.map((bid) => bid.playerId)).toEqual(['player-2', 'me']);
    expect(other.leader).toBe('player-2');
    const rejected = placeBid(other, { playerId: 'me', amount: 9, round: 1, now: 300 });
    expect(rejected.bids).toBe(other.bids);
    expect(rejected.leader).toBe('player-2');
    expect(rejected.price).toBe(10);
  });
  it('withholds the value until five seconds after the winner is charged', () => {
    const { server, start, advance } = fixture();
    start();
    server.send({ type: 'PLACE_BID', payload: { round: 1, amount: 5 } });
    advance(20000);
    expect(server.getSnapshot().players[0]?.balance).toBe(95);
    expect(server.getSnapshot().revealed).toBeNull();
    // 공개 1ms 전까지는 실제 가치가 상태에 노출되지 않아야 한다.
    advance(4999);
    expect(server.getSnapshot().revealed).toBeNull();
    advance(1);
    expect(server.getSnapshot().revealed?.value).toBe(10);
    expect(server.getSnapshot().players[0]?.balance).toBe(105);
    server.tick();
    expect(server.getSnapshot().players[0]?.balance).toBe(105);
  });
  it('rejects unaffordable, stale and self-overbids without changing the price', () => {
    const { server, start } = fixture();
    start();
    server.send({ type: 'PLACE_BID', payload: { round: 1, amount: 101 } });
    expect(server.getSnapshot().leader).toBeNull();
    server.send({ type: 'PLACE_BID', payload: { round: 2, amount: 30 } });
    expect(server.getSnapshot().leader).toBeNull();
    server.send({ type: 'PLACE_BID', payload: { round: 1, amount: 5 } });
    server.send({ type: 'PLACE_BID', payload: { round: 1, amount: 10 } });
    expect(server.getSnapshot().price).toBe(5);
  });
  it('rejects a bid arriving exactly at the deadline', () => {
    const state = { ...initialState(), phase: 'auction' as const, round: 1, deadline: 20000 };
    // 마감 처리 전이라도 마감 시각에 도착한 입찰은 거절한다.
    const result = placeBid(state, { playerId: 'me', amount: 5, round: 1, now: 20000 });
    expect(result.leader).toBeNull();
  });
  it('caps total deadline extensions at fifteen seconds', () => {
    let state = { ...occupiedRoom(), phase: 'auction' as const, round: 1, deadline: 20000 };
    // 마감 1ms 전에 번갈아 입찰해 연장 한도를 넘겨 본다.
    for (let i = 0; i < 20; i++) {
      const next = placeBid(state, {
        playerId: i % 2 === 0 ? 'me' : 'player-2',
        amount: 5 + i,
        round: 1,
        now: state.deadline - 1,
      });
      state = { ...next, phase: 'auction' };
    }
    expect(state.deadline).toBe(35000);
    expect(state.extended).toBe(15000);
  });
  it('allows throwing during appraisal without changing money or the winner', () => {
    const { server, start, advance } = fixture();
    start();
    server.send({ type: 'PLACE_BID', payload: { round: 1, amount: 5 } });
    advance(20000);
    const before = server.getSnapshot();
    server.send({ type: 'USE_ITEM', payload: { item: 'tomato', target: 'player-2' } });
    expect(server.getSnapshot().players).toEqual(before.players);
    expect(server.getSnapshot().leader).toBe(before.leader);
    expect(server.getSnapshot().inventory.tomato).toBe(1);
    expect(server.getSnapshot().effects).toHaveLength(1);
    server.send({ type: 'USE_ITEM', payload: { item: 'can', target: 'player-2' } });
    expect(server.getSnapshot().inventory.can).toBe(1);
  });
  it('keeps chat available when a player has spent every dollar', () => {
    const { server, start, advance } = fixture();
    start();
    server.send({ type: 'PLACE_BID', payload: { round: 1, amount: 100 } });
    advance(20000);
    // HTML 형태의 입력도 원문 그대로 보관한다.
    server.send({ type: 'SEND_CHAT', payload: { body: '<img src=x onerror=alert(1)>' } });
    expect(server.getSnapshot().players[0]?.balance).toBe(0);
    expect(server.getSnapshot().chats.at(-1)?.body).toBe('<img src=x onerror=alert(1)>');
  });
  it('finishes ten unsold rounds and rewards tied players only once', () => {
    const { server, start, advance } = fixture();
    start();
    for (let round = 0; round < 10; round++) {
      advance(20000);
      advance(5000);
      advance(3000);
    }
    // 종료 후 tick이 반복돼도 보상은 한 번만 지급한다.
    server.tick();
    server.tick();
    expect(server.getSnapshot().phase).toBe('results');
    expect(server.getSnapshot().history).toHaveLength(10);
    expect(server.getSnapshot().cash).toBe(22);
    expect(server.getSnapshot().ranking.every((r) => r.rank === 1 && r.reward === 10)).toBe(true);
  });
  it('preserves unspent inventory and cash across a replay', () => {
    const { server, start, advance } = fixture();
    start();
    for (let round = 0; round < 10; round++) {
      advance(20000);
      advance(5000);
      advance(3000);
    }
    server.send({ type: 'RETURN_LOBBY', payload: {} });
    server.send({ type: 'BUY_ITEM', payload: { item: 'can' } });
    expect(server.getSnapshot().cash).toBe(20);
    expect(server.getSnapshot().inventory).toEqual({ tomato: 2, can: 2 });
    expect(server.getSnapshot().loadout).toEqual([]);
  });
  it('skips the next rank after a first-place tie', () => {
    const players = occupiedRoom().players.map((p, i) => ({ ...p, balance: i < 2 ? 150 : 100 }));
    const ranks = rankPlayers(players);
    expect(ranks.map((r) => [r.rank, r.reward])).toEqual([
      [1, 10],
      [1, 10],
      [3, 2],
      [3, 2],
    ]);
  });
});
