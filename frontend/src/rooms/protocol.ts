import { z } from 'zod';
import { CHARACTER_MODELS } from '../data/characters';
import { OBJECT_KINDS } from '../game/types';

const roomId = z
  .string()
  .regex(/^[A-Z0-9]{6}$/)
  .brand<'RoomId'>();
const userId = z.uuid().brand<'UserId'>();
const summary = z.object({
  id: roomId,
  name: z.string(),
  players: z.number().int().min(0).max(4),
  capacity: z.literal(4),
  status: z.enum(['waiting', 'full', 'playing']),
  hostUserId: userId,
});
const grade = z.enum(['일반', '레어', '에픽', '전설']);
const auctionSchema = z.object({
  price: z.number().int(),
  leaderUserId: userId.nullable(),
  bidVersion: z.number().int(),
  extendedMs: z.number().int(),
  bids: z.array(z.object({ userId, amount: z.number().int(), at: z.number() })),
});
const gameSchema = z.object({
  gameId: z.uuid(),
  status: z.enum(['AUCTION', 'SOLD', 'REVEAL', 'FINISHED', 'ABORTED']),
  round: z.number().int().min(1),
  totalRounds: z.number().int(),
  phaseEndsAt: z.number().nullable(),
  lot: z.object({ kind: z.enum(OBJECT_KINDS), name: z.string(), description: z.string(), hint: grade }),
  auction: auctionSchema,
  players: z.array(z.object({ userId, balance: z.number().int(), left: z.boolean() })),
  reveal: z
    .object({
      grade,
      value: z.number().int(),
      winnerUserId: userId.nullable(),
      price: z.number().int(),
      profit: z.number().int(),
    })
    .nullable(),
  history: z.array(
    z.object({
      round: z.number().int(),
      lotKind: z.enum(OBJECT_KINDS),
      lotName: z.string(),
      winnerUserId: userId.nullable(),
      price: z.number().int(),
      grade,
      value: z.number().int(),
    }),
  ),
  result: z
    .object({
      ranking: z.array(
        z.object({ userId, rank: z.number().int(), balance: z.number().int(), reward: z.number().int() }),
      ),
    })
    .nullable(),
});
export const sharedRoomSchema = z.object({
  id: roomId,
  name: z.string(),
  hostUserId: userId,
  capacity: z.literal(4),
  version: z.number().int(),
  players: z
    .array(
      z.object({
        userId,
        nickname: z.string(),
        avatarCode: z.enum(CHARACTER_MODELS),
        seat: z.number().int().min(0).max(3),
        ready: z.boolean(),
        connected: z.boolean(),
      }),
    )
    .max(4),
  chats: z
    .array(z.object({ id: z.number().int(), userId, nickname: z.string(), body: z.string(), at: z.number() }))
    .max(30),
  game: gameSchema.nullable(),
});
export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('WELCOME'),
    connectionId: z.string(),
    activeRoomId: roomId.nullable(),
    authExpiresAt: z.number().int(),
  }),
  z.object({ type: z.literal('AUTH_RENEWED'), expiresAt: z.number().int() }),
  z.object({ type: z.literal('ROOM_LIST'), version: z.number().int(), rooms: z.array(summary) }),
  z.object({ type: z.literal('ROOM_STATE'), serverTime: z.number(), room: sharedRoomSchema }),
  z.object({ type: z.literal('LEFT'), reason: z.enum(['left', 'expired', 'logout']) }),
  z.object({ type: z.literal('ACK'), requestId: z.uuid() }),
  z.object({ type: z.literal('PONG'), requestId: z.uuid() }),
  z.object({
    type: z.literal('ERROR'),
    requestId: z.uuid().nullable(),
    error: z.object({
      status: z.number(),
      code: z.string(),
      message: z.string(),
      errors: z.array(z.unknown()),
    }),
    auction: auctionSchema.optional(),
  }),
]);
export type SharedRoom = z.infer<typeof sharedRoomSchema>;
export type RoomSummary = z.infer<typeof summary>;
export type SharedGame = z.infer<typeof gameSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type RoomCommand =
  | { readonly type: 'CREATE_ROOM' }
  | { readonly type: 'JOIN_ROOM'; readonly roomId: string }
  | { readonly type: 'LEAVE_ROOM' }
  | { readonly type: 'SET_READY'; readonly ready: boolean }
  | { readonly type: 'SEND_CHAT'; readonly body: string }
  | { readonly type: 'PING' }
  | { readonly type: 'START_GAME' }
  | {
      readonly type: 'PLACE_BID';
      readonly gameId: string;
      readonly round: number;
      readonly expectedBidVersion: number;
      readonly amount: number;
    };
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'stopped';
