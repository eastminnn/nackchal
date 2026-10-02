import type { Command, ItemKind, RoomState } from './types';
import { ITEM_NAMES, ITEM_PRICES, SELF } from './types';

export function placeBid(
  state: RoomState,
  bid: { readonly playerId: string; readonly amount: number; readonly round: number; readonly now: number },
): RoomState {
  const player = state.players.find((p) => p.id === bid.playerId);
  const reject = (error: string): RoomState => (bid.playerId === SELF ? { ...state, error } : state);
  if (state.phase !== 'auction' || bid.round !== state.round || bid.now >= state.deadline)
    return reject('이번 경매는 이미 마감됐어요.');
  if (!player || player.id === state.leader)
    return reject('이미 최고 입찰자예요. 다른 입찰을 기다려 주세요.');
  if (!Number.isSafeInteger(bid.amount) || bid.amount < (state.leader ? state.price + 1 : 5))
    return reject('현재 가격보다 높은 금액을 입력해 주세요.');
  if (bid.amount > player.balance) return reject('보유한 게임 머니가 부족해요.');
  const added =
    state.deadline - bid.now <= 3000
      ? Math.min(3000 - (state.deadline - bid.now), 15000 - state.extended)
      : 0;
  return {
    ...state,
    price: bid.amount,
    leader: player.id,
    deadline: state.deadline + added,
    extended: state.extended + added,
    error: '',
    bids: [
      { id: state.bids.length + 1, playerId: player.id, name: player.name, amount: bid.amount, at: bid.now },
      ...state.bids,
    ].slice(0, 40),
    announcement: `${player.name}님이 $${bid.amount}에 입찰했어요.`,
  };
}
export function applySocial(state: RoomState, command: Command, now: number): RoomState {
  const fail = (error: string): RoomState => ({ ...state, error });
  switch (command.type) {
    case 'JOIN_ROOM': {
      if (state.phase !== 'lobby') return state;
      const name = command.payload.nickname.trim();
      if (!name || [...name].length > 12) return fail('닉네임은 1~12자로 입력해 주세요.');
      return { ...state, players: state.players.map((p) => (p.id === SELF ? { ...p, name } : p)), error: '' };
    }
    case 'READY': {
      if (state.phase !== 'lobby') return state;
      const items = command.payload.items;
      if (
        items.length > 3 ||
        (['tomato', 'can'] as const).some(
          (item) => items.filter((v) => v === item).length > state.inventory[item],
        )
      )
        return fail('보유한 아이템 중 최대 3개를 골라 주세요.');
      return { ...state, loadout: [...items], error: '' };
    }
    case 'BUY_ITEM': {
      if (state.phase !== 'lobby') return fail('상점은 로비에서 이용할 수 있어요.');
      const item = command.payload.item;
      if (state.cash < ITEM_PRICES[item])
        return fail('캐시가 부족해요. 한 판을 마치면 캐시를 받을 수 있어요.');
      return {
        ...state,
        cash: state.cash - ITEM_PRICES[item],
        inventory: { ...state.inventory, [item]: state.inventory[item] + 1 },
        error: '',
      };
    }
    case 'USE_ITEM':
      return throwItem(state, command.payload, now);
    case 'SEND_CHAT': {
      const body = command.payload.body.trim();
      if (!body || [...body].length > 100) return fail('채팅은 1~100자로 입력해 주세요.');
      const previous = state.chats.findLast((c) => c.playerId === SELF);
      if (previous && now - previous.at < 1000) return fail('채팅은 1초에 한 번씩 보낼 수 있어요.');
      const name = state.players.find((p) => p.id === SELF)?.name ?? '나';
      return {
        ...state,
        error: '',
        chats: [...state.chats, { id: now, playerId: SELF, name, body, at: now }].slice(-30),
      };
    }
    case 'START_GAME':
    case 'PLACE_BID':
    case 'RETURN_LOBBY':
    case 'LEAVE_ROOM':
      return state;
  }
}
function throwItem(
  state: RoomState,
  payload: { readonly item: ItemKind; readonly target: string },
  now: number,
): RoomState {
  const fail = (error: string): RoomState => ({ ...state, error });
  if (!['auction', 'sold', 'reveal'].includes(state.phase))
    return fail('장난 아이템은 게임 중에 던질 수 있어요.');
  const slot = state.loadout.indexOf(payload.item);
  if (slot < 0) return fail('선택한 아이템을 모두 사용했어요.');
  if (payload.target === SELF || !state.players.some((p) => p.id === payload.target))
    return fail('다른 참가자를 골라 주세요.');
  const last = state.effects.findLast((effect) => effect.source === SELF && effect.target === payload.target);
  if (last && now - last.at < 5000) return fail('같은 친구에게는 5초 뒤에 다시 던질 수 있어요.');
  return {
    ...state,
    error: '',
    loadout: state.loadout.filter((_, i) => i !== slot),
    inventory: { ...state.inventory, [payload.item]: state.inventory[payload.item] - 1 },
    effects: [
      ...state.effects,
      {
        id: now,
        source: SELF,
        target: payload.target,
        item: payload.item,
        at: now,
        throughRound: state.round + 1,
      },
    ],
    announcement: `${state.players.find((p) => p.id === payload.target)?.name}님에게 ${ITEM_NAMES[payload.item]} 투척!`,
  };
}
