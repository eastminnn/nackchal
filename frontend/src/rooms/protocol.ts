import { z } from 'zod';
import { CHARACTER_MODELS } from '../data/characters';

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
  status: z.enum(['waiting', 'full']),
  hostUserId: userId,
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
});
export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('WELCOME'), connectionId: z.string(), activeRoomId: roomId.nullable() }),
  z.object({ type: z.literal('ROOM_LIST'), version: z.number().int(), rooms: z.array(summary) }),
  z.object({ type: z.literal('ROOM_STATE'), room: sharedRoomSchema }),
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
  }),
]);
export type SharedRoom = z.infer<typeof sharedRoomSchema>;
export type RoomSummary = z.infer<typeof summary>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export type RoomCommand =
  | { readonly type: 'CREATE_ROOM' }
  | { readonly type: 'JOIN_ROOM'; readonly roomId: string }
  | { readonly type: 'LEAVE_ROOM' }
  | { readonly type: 'SET_READY'; readonly ready: boolean }
  | { readonly type: 'SEND_CHAT'; readonly body: string }
  | { readonly type: 'PING' };
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'stopped';
