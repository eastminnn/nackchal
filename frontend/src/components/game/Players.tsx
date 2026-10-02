import { CrownIcon, TargetIcon } from '@phosphor-icons/react';
import type { ItemKind, RoomState } from '../../game/types';
import { SELF } from '../../game/types';
import { Money } from '../ui/primitives';

export function Players({
  state,
  selected,
  onThrow,
}: {
  readonly state: RoomState;
  readonly selected: ItemKind | null;
  readonly onThrow: (target: string) => void;
}) {
  return (
    <div className={`players ${selected ? 'players-targeting' : ''}`}>
      {state.players.map((player, index) => {
        const leading = state.leader === player.id;
        return (
          <button
            type="button"
            className={`player ${leading ? 'player-leading' : ''}`}
            key={player.id}
            disabled={!selected || player.id === SELF}
            aria-label={selected ? `${player.name}에게 던지기` : `${player.name}, 잔액 ${player.balance}달러`}
            onClick={() => onThrow(player.id)}
          >
            <span className={`seat-number seat-${player.avatar % 4}`}>
              {selected && player.id !== SELF ? (
                <TargetIcon size={12} />
              ) : leading ? (
                <CrownIcon weight="fill" size={12} />
              ) : (
                `${index + 1}번 좌석`
              )}
            </span>
            <span className="player-name">
              {player.name}
              {player.id === SELF && <small>나</small>}
            </span>
            <Money amount={player.balance} />
          </button>
        );
      })}
    </div>
  );
}
