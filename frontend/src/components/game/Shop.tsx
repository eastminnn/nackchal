import { CheckIcon, PlusIcon } from '@phosphor-icons/react';
import type { GameTransport, ItemKind, RoomState } from '../../game/types';
import { ITEM_NAMES, ITEM_PRICES } from '../../game/types';
import { ObjectArt } from '../art/ObjectArt';
import { Button, Cash } from '../ui/primitives';

export function Loadout({ state, server }: { readonly state: RoomState; readonly server: GameTransport }) {
  const add = (item: ItemKind) =>
    server.send({ type: 'READY', payload: { items: [...state.loadout, item] } });
  return (
    <section className="loadout-section">
      <div className="section-heading">
        <div>
          <h2>오늘의 장난 주머니</h2>
          <p className="muted">승부엔 영향 없이, 친구에게 장난만.</p>
        </div>
        <span className="slot-count">{state.loadout.length} / 3</span>
      </div>
      <div className="loadout-items">
        {(['tomato', 'can'] as const).map((item) => {
          const equipped = state.loadout.filter((v) => v === item).length;
          return (
            <button
              type="button"
              className="loadout-choice"
              key={item}
              onClick={() => add(item)}
              disabled={state.loadout.length >= 3 || equipped >= state.inventory[item]}
              aria-label={`${ITEM_NAMES[item]} 보유 ${state.inventory[item]}개, 장착`}
            >
              <ObjectArt kind={item} />
              <span>
                <strong>{ITEM_NAMES[item]}</strong>
                <small>보유 {state.inventory[item]}개</small>
              </span>
              <PlusIcon size={18} />
            </button>
          );
        })}
      </div>
      <div className="loadout-slots">
        {[0, 1, 2].map((index) => {
          const item = state.loadout[index];
          return item ? (
            <button
              key={`slot-${index}`}
              type="button"
              onClick={() =>
                server.send({
                  type: 'READY',
                  payload: { items: state.loadout.filter((_, i) => i !== index) },
                })
              }
              aria-label={`${index + 1}번 ${ITEM_NAMES[item]} 장착 해제`}
            >
              <CheckIcon size={14} />
              {ITEM_NAMES[item]}
              <span>×</span>
            </button>
          ) : (
            <span key={`slot-${index}`} className="empty-slot">
              빈 주머니
            </span>
          );
        })}
      </div>
    </section>
  );
}
export function Shop({ state, server }: { readonly state: RoomState; readonly server: GameTransport }) {
  return (
    <div className="shop-content">
      <p>친구의 선택이 수상할 땐, 토마토 하나.</p>
      <Cash amount={state.cash} />
      <div className="shop-grid">
        {(['tomato', 'can'] as const).map((item) => (
          <article className="shop-item" key={item}>
            <ObjectArt kind={item} />
            <h3>{ITEM_NAMES[item]}</h3>
            <p>
              {item === 'tomato'
                ? '얼굴에 철퍽! 다음 라운드까지 흔적이 남아요.'
                : '통! 소리와 함께 캐릭터가 깜짝 놀라요.'}
            </p>
            <span className="muted">보유 {state.inventory[item]}개</span>
            <Button
              variant="secondary"
              disabled={state.cash < ITEM_PRICES[item]}
              onClick={() => server.send({ type: 'BUY_ITEM', payload: { item } })}
            >
              {ITEM_PRICES[item]} 캐시로 구매
            </Button>
          </article>
        ))}
      </div>
      <p className="demo-note">데모 체험용 12캐시와 아이템이 지급됩니다. 새로고침하면 초기화돼요.</p>
    </div>
  );
}
