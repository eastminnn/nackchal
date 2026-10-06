import type { User } from '../auth/api';
import { CHARACTER_MODELS } from '../data/characters';
import type { RoomInfo } from '../data/rooms';
import { type RoomState, SELF } from '../game/types';
import type { RoomSummary, SharedGame, SharedRoom } from './protocol';

const PHASES: Readonly<Record<SharedGame['status'], RoomState['phase']>> = {
  AUCTION: 'auction',
  SOLD: 'sold',
  REVEAL: 'reveal',
  FINISHED: 'results',
  ABORTED: 'lobby',
};

export function roomInfo(room: RoomSummary): RoomInfo {
  return {
    ...room,
    subtitle: room.status === 'playing' ? '경매가 진행 중인 방' : '함께 준비하는 경매 대기실',
    mood: 'lounge',
  };
}
/** 진행 중인 게임이 있는지. 끝난 게임은 결과 표시용으로만 남는다. */
export function inProgress(game: SharedGame): boolean {
  return game.status !== 'FINISHED' && game.status !== 'ABORTED';
}
/**
 * 서버 방 상태를 3D 장면과 HUD가 쓰는 RoomState로 바꾼다. 내 계정은 장면에서 SELF로 표시하고,
 * 서버 마감 시각은 clockOffset을 빼서 브라우저 시계 기준으로 바꾼다.
 */
export function waitingView(
  base: RoomState,
  room: SharedRoom | null,
  user: User,
  clockOffset = 0,
): RoomState {
  const viewId = (id: string) => (id === user.id ? SELF : id);
  const game = room?.game ?? null;
  const balance = (id: string) => game?.players.find((player) => player.userId === id)?.balance ?? 0;
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
          balance: balance(player.userId),
        }))
    : [{ id: SELF, name: user.nickname, avatar: CHARACTER_MODELS.indexOf(user.avatarCode), balance: 0 }];
  const name = (id: string) =>
    room?.players.find((player) => player.userId === id)?.nickname ?? '떠난 참가자';
  const chats =
    room?.chats.map((chat) => ({ ...chat, playerId: viewId(chat.userId), name: chat.nickname })) ?? [];
  if (!game) return { ...base, players, chats };
  const live = inProgress(game);
  return {
    ...base,
    players,
    chats,
    phase: PHASES[game.status],
    round: game.round,
    lot: game.lot,
    deadline: (game.phaseEndsAt ?? 0) - clockOffset,
    price: live ? game.auction.price : base.price,
    leader: live && game.auction.leaderUserId ? viewId(game.auction.leaderUserId) : null,
    extended: game.auction.extendedMs,
    bids: live
      ? game.auction.bids.map((bid, index) => ({
          id: game.auction.bidVersion - index,
          playerId: viewId(bid.userId),
          name: name(bid.userId),
          amount: bid.amount,
          at: bid.at - clockOffset,
        }))
      : [],
    revealed: game.reveal ? { grade: game.reveal.grade, value: game.reveal.value } : null,
    history: game.history.map((sale) => ({
      round: sale.round,
      lot: { kind: sale.lotKind, name: sale.lotName, description: '', hint: sale.grade },
      winner: sale.winnerUserId ? viewId(sale.winnerUserId) : null,
      price: sale.price,
      grade: sale.grade,
      value: sale.value,
    })),
    ranking:
      game.result?.ranking.map((entry) => ({
        player: {
          id: viewId(entry.userId),
          name: name(entry.userId),
          avatar: CHARACTER_MODELS.indexOf(
            room?.players.find((player) => player.userId === entry.userId)?.avatarCode ?? 'plush-bear',
          ),
          balance: entry.balance,
        },
        rank: entry.rank,
        reward: entry.reward,
      })) ?? [],
  };
}
