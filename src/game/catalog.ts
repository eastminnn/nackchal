import type { Grade, Lot, Player, Ranking, RoomState, Secret } from './types';

const ITEMS: readonly Omit<Lot, 'hint'>[] = [
  { kind: 'radio', name: '할아버지의 라디오', description: '주파수는 안 잡혀도, 분위기 하나는 확실해요.' },
  { kind: 'camera', name: '필름이 남은 카메라', description: '마지막 사진에는 어떤 장면이 담겼을까요?' },
  { kind: 'lamp', name: '초록빛 테이블 램프', description: '불이 들어오면 왠지 좋은 일이 생길 것 같아요.' },
  { kind: 'shoe', name: '누군가의 한정판 운동화', description: '밑창은 닳았는데, 신발끈은 새것이에요.' },
  { kind: 'teapot', name: '이야기가 담긴 주전자', description: '따뜻한 차 한 잔과 함께 온 오래된 물건.' },
  { kind: 'duck', name: '제법 당당한 고무 오리', description: '욕조 출신인지, 수집가의 진열장 출신인지.' },
  { kind: 'clock', name: '시간을 잊은 탁상시계', description: '하루에 두 번은 정확할지도 몰라요.' },
  { kind: 'plant', name: '이름 모를 작은 화분', description: '평범한 잎사귀 사이에 숨은 가능성.' },
  {
    kind: 'controller',
    name: '전설의 게임 컨트롤러',
    description: '시작 버튼에 누군가의 추억이 묻어 있어요.',
  },
  { kind: 'vase', name: '다락방에서 찾은 화병', description: '바닥의 작은 서명, 혹시 유명한 작가일까요?' },
];
const GRADES: readonly Grade[] = ['일반', '레어', '에픽', '전설'];
export const VALUES: Readonly<Record<Grade, readonly [number, number]>> = {
  일반: [1, 30],
  레어: [20, 80],
  에픽: [60, 150],
  전설: [150, 400],
};
export function drawLot(round: number, random: () => number): { readonly lot: Lot; readonly secret: Secret } {
  const roll = random();
  const grade: Grade = roll < 0.55 ? '일반' : roll < 0.85 ? '레어' : roll < 0.97 ? '에픽' : '전설';
  const range = VALUES[grade];
  const value = range[0] + Math.floor(random() * (range[1] - range[0] + 1));
  const alternatives = GRADES.filter((g) => g !== grade);
  const hint = random() < 0.7 ? grade : (alternatives[Math.floor(random() * alternatives.length)] ?? '일반');
  const item = ITEMS[(round - 1) % ITEMS.length];
  if (!item) throw new Error('Auction catalog is empty');
  return { lot: { ...item, hint }, secret: { grade, value } };
}
export function rankPlayers(players: readonly Player[]): readonly Ranking[] {
  return [...players]
    .sort((a, b) => b.balance - a.balance)
    .map((player) => {
      const rank = 1 + players.filter((other) => other.balance > player.balance).length;
      return { player, rank, reward: rank === 1 ? 10 : rank === 2 ? 5 : 2 };
    });
}
export function initialState(): RoomState {
  return {
    phase: 'lobby',
    round: 0,
    gameId: 0,
    deadline: 0,
    price: 5,
    leader: null,
    extended: 0,
    revealed: null,
    lot: drawLot(1, () => 0.3).lot,
    players: [{ id: 'me', name: '나', avatar: 0, balance: 100 }],
    history: [],
    chats: [],
    effects: [],
    bids: [],
    cash: 12,
    inventory: { tomato: 2, can: 1 },
    loadout: ['tomato', 'tomato', 'can'],
    ranking: [],
    error: '',
    announcement: '',
  };
}
