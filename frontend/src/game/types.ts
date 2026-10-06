export const OBJECT_KINDS = [
  'radio',
  'camera',
  'lamp',
  'shoe',
  'teapot',
  'duck',
  'clock',
  'plant',
  'controller',
  'vase',
  'tomato',
  'can',
] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

export type ItemKind = 'tomato' | 'can';
export type Grade = '일반' | '레어' | '에픽' | '전설';
type Phase = 'lobby' | 'auction' | 'sold' | 'reveal' | 'results';
export interface Player {
  readonly id: string;
  readonly name: string;
  readonly avatar: number;
  readonly balance: number;
}
export interface Lot {
  readonly kind: ObjectKind;
  readonly name: string;
  readonly description: string;
  readonly hint: Grade;
}
export interface Secret {
  readonly grade: Grade;
  readonly value: number;
}
export interface Chat {
  readonly id: number;
  readonly playerId: string;
  readonly name: string;
  readonly body: string;
  readonly at: number;
}
export interface Effect {
  readonly id: number;
  readonly source: string;
  readonly target: string;
  readonly item: ItemKind;
  readonly at: number;
  readonly throughRound: number;
}
interface Sale {
  readonly round: number;
  readonly lot: Lot;
  readonly winner: string | null;
  readonly price: number;
  readonly grade: Grade;
  readonly value: number;
}
interface Bid {
  readonly id: number;
  readonly playerId: string;
  readonly name: string;
  readonly amount: number;
  readonly at: number;
}
export interface Ranking {
  readonly player: Player;
  readonly rank: number;
  readonly reward: number;
}
export interface RoomState {
  readonly phase: Phase;
  readonly round: number;
  readonly gameId: number;
  readonly players: readonly Player[];
  readonly lot: Lot;
  readonly deadline: number;
  readonly price: number;
  readonly leader: string | null;
  readonly extended: number;
  readonly revealed: Secret | null;
  readonly history: readonly Sale[];
  readonly chats: readonly Chat[];
  readonly effects: readonly Effect[];
  readonly bids: readonly Bid[];
  readonly cash: number;
  readonly inventory: Readonly<Record<ItemKind, number>>;
  readonly loadout: readonly ItemKind[];
  readonly ranking: readonly Ranking[];
  readonly error: string;
  readonly announcement: string;
}
export type Command =
  | { readonly type: 'JOIN_ROOM'; readonly payload: { readonly nickname: string } }
  | { readonly type: 'READY'; readonly payload: { readonly items: readonly ItemKind[] } }
  | { readonly type: 'START_GAME'; readonly payload: Record<string, never> }
  | { readonly type: 'PLACE_BID'; readonly payload: { readonly round: number; readonly amount: number } }
  | { readonly type: 'USE_ITEM'; readonly payload: { readonly item: ItemKind; readonly target: string } }
  | { readonly type: 'SEND_CHAT'; readonly payload: { readonly body: string } }
  | { readonly type: 'BUY_ITEM'; readonly payload: { readonly item: ItemKind } }
  | { readonly type: 'RETURN_LOBBY'; readonly payload: Record<string, never> }
  | { readonly type: 'LEAVE_ROOM'; readonly payload: Record<string, never> };
export type ServerEvent = { readonly type: 'ROOM_STATE'; readonly payload: RoomState };
export interface GameTransport {
  readonly getSnapshot: () => RoomState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly send: (command: Command) => void;
  readonly connect: () => () => void;
}
export const ITEM_NAMES: Readonly<Record<ItemKind, string>> = { tomato: '토마토', can: '깡통' };
export const ITEM_PRICES: Readonly<Record<ItemKind, number>> = { tomato: 3, can: 2 };
export const SELF = 'me';
export const MIN_PLAYERS = 2;
