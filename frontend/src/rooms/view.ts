import type { User } from '../auth/api';
import { CHARACTER_MODELS } from '../data/characters';
import type { RoomInfo } from '../data/rooms';
import { type RoomState, SELF } from '../game/types';
import type { RoomSummary, SharedRoom } from './protocol';

export function roomInfo(room: RoomSummary): RoomInfo {
  return { ...room, subtitle: '함께 준비하는 경매 대기실', mood: 'lounge' };
}
export function waitingView(base: RoomState, room: SharedRoom | null, user: User): RoomState {
  const viewId = (id: string) => (id === user.id ? SELF : id);
  const players = room
    ? [...room.players]
        .sort((a, b) => {
          if (a.userId === user.id) return -1;
          if (b.userId === user.id) return 1;
          return a.seat - b.seat;
        })
        .map((player) => ({
          id: viewId(player.userId),
          name: player.nickname,
          avatar: CHARACTER_MODELS.indexOf(player.avatarCode),
          balance: 0,
        }))
    : [{ id: SELF, name: user.nickname, avatar: CHARACTER_MODELS.indexOf(user.avatarCode), balance: 0 }];
  return {
    ...base,
    players,
    chats: room?.chats.map((chat) => ({ ...chat, playerId: viewId(chat.userId), name: chat.nickname })) ?? [],
  };
}
