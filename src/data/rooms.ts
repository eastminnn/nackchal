export interface RoomInfo {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly status: 'waiting' | 'playing' | 'full';
  readonly players: number;
  readonly capacity: number;
  readonly mood: 'lounge' | 'library' | 'midnight';
}
export const ROOM_STATUS = { waiting: '입장 가능', playing: '경매 중', full: '만석' } as const;
