import { useEffect, useState } from 'react';
import type { EmoteKind } from '../../game/types';

const EMOTES: readonly { readonly kind: EmoteKind; readonly icon: string; readonly label: string }[] = [
  { kind: 'MIDDLE_FINGER', icon: '🖕', label: '뻐큐' },
  { kind: 'SMOKE', icon: '🚬', label: '담배' },
];

/** 방 모션 버튼. 서버 쿨다운이 끝나는 시각(availableAt)까지 남은 초를 보여 주고 막는다. */
export function EmoteButtons({
  availableAt,
  disabled,
  onEmote,
}: {
  readonly availableAt: number | undefined;
  readonly disabled: boolean;
  readonly onEmote: (kind: EmoteKind) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const waiting = availableAt !== undefined && availableAt > now;
  useEffect(() => {
    if (availableAt === undefined || availableAt <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [availableAt]);
  const seconds = waiting ? Math.ceil((availableAt - now) / 1000) : 0;
  return (
    <fieldset className="hud-emotes">
      <legend>모션</legend>
      {EMOTES.map(({ kind, icon, label }) => (
        <button
          key={kind}
          type="button"
          className="hud-emote"
          disabled={disabled || waiting}
          aria-label={waiting ? `${label}, ${seconds}초 뒤 가능` : label}
          title={label}
          onClick={() => {
            setNow(Date.now());
            onEmote(kind);
          }}
        >
          <span aria-hidden="true">{icon}</span>
          {waiting && <small aria-hidden="true">{seconds}</small>}
        </button>
      ))}
    </fieldset>
  );
}
