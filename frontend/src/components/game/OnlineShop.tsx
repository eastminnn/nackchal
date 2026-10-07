import { MinusIcon, PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import type { ShopItem } from '../../auth/api';
import type { ItemKind } from '../../game/types';
import { ObjectArt } from '../art/ObjectArt';
import { Button, Cash } from '../ui/primitives';

const DESCRIPTIONS: Readonly<Record<ItemKind, string>> = {
  tomato: '얼굴에 철퍽! 볼이 잠깐 빨개져요.',
  can: '통! 소리와 함께 캐릭터가 깜짝 놀라요.',
};

/** 서버 장난 상점. 가격과 보유 수량은 서버 값이며, 한 번에 1~10개를 산다. */
export function OnlineShop({
  items,
  cash,
  onBuy,
}: {
  readonly items: readonly ShopItem[];
  readonly cash: number | null;
  readonly onBuy: (item: ItemKind, quantity: number) => Promise<string | null>;
}) {
  const [counts, setCounts] = useState<Partial<Record<ItemKind, number>>>({});
  const [buying, setBuying] = useState<ItemKind | null>(null);
  const [message, setMessage] = useState('');
  if (items.length === 0) return <p role="status">상점을 불러오는 중이에요…</p>;
  return (
    <div className="shop-content">
      <p>친구의 선택이 수상할 땐, 토마토 하나. 게임 중에 한 판 3개까지 던질 수 있어요.</p>
      {cash !== null && <Cash amount={cash} />}
      <div className="shop-grid">
        {items.map((item) => {
          const count = counts[item.code] ?? 1;
          const total = item.price * count;
          const setCount = (next: number) =>
            setCounts((previous) => ({ ...previous, [item.code]: Math.min(10, Math.max(1, next)) }));
          return (
            <article className="shop-item" key={item.code}>
              <ObjectArt kind={item.code} />
              <h3>{item.name}</h3>
              <p>{DESCRIPTIONS[item.code]}</p>
              <span className="muted">
                {item.price}캐시 · 보유 {item.quantity}개
              </span>
              <div className="shop-quantity">
                <button
                  type="button"
                  aria-label={`${item.name} 하나 덜`}
                  disabled={count <= 1}
                  onClick={() => setCount(count - 1)}
                >
                  <MinusIcon size={14} />
                </button>
                <span aria-live="polite">{count}개</span>
                <button
                  type="button"
                  aria-label={`${item.name} 하나 더`}
                  disabled={count >= 10}
                  onClick={() => setCount(count + 1)}
                >
                  <PlusIcon size={14} />
                </button>
              </div>
              <Button
                variant="secondary"
                disabled={buying !== null || cash === null || cash < total}
                onClick={() => {
                  setBuying(item.code);
                  setMessage('');
                  void onBuy(item.code, count).then((error) => {
                    setBuying(null);
                    setMessage(error ?? `${item.name} ${count}개를 샀어요.`);
                  });
                }}
              >
                {buying === item.code ? '사는 중…' : `${total}캐시에 사기`}
              </Button>
            </article>
          );
        })}
      </div>
      <p className="shop-message" role="status">
        {message}
      </p>
    </div>
  );
}
