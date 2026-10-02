import { TimerIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

export function Timer({
  deadline,
  label = '남은 시간',
}: {
  readonly deadline: number;
  readonly label?: string;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <span
      role="timer"
      className={`timer ${seconds <= 3 ? 'timer-urgent' : ''}`}
      aria-label={`${label} ${seconds}초`}
    >
      <TimerIcon size={20} />
      <strong>{seconds.toString().padStart(2, '0')}</strong>
      <span>초</span>
    </span>
  );
}
