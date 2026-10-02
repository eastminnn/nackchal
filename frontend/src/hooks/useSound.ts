import { useEffect, useRef } from 'react';
import type { RoomState } from '../game/types';

export function useSound(enabled: boolean, state: RoomState) {
  const context = useRef<AudioContext | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const audio = new AudioContext();
    context.current = audio;
    return () => {
      context.current = null;
      void audio.close();
    };
  }, [enabled]);
  const effectId = state.effects.at(-1)?.id;
  const previousEffect = useRef(effectId);
  useEffect(() => {
    const audio = context.current;
    if (!enabled || !audio) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime;
    oscillator.type = effectId !== previousEffect.current ? 'triangle' : 'sine';
    previousEffect.current = effectId;
    oscillator.frequency.setValueAtTime(state.phase === 'reveal' ? 660 : 330, start);
    oscillator.frequency.exponentialRampToValueAtTime(180, start + 0.14);
    gain.gain.setValueAtTime(0.07, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(start + 0.2);
  }, [enabled, state.phase, effectId]);
}
