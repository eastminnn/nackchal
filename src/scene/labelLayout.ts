import type { Chat } from '../game/types';

export const SPEECH_DURATION = 7000;

export function visibleSpeech(messages: readonly Chat[], now: number) {
  const latest = new Map<string, Chat>();
  for (const message of messages) {
    if (now - message.at >= SPEECH_DURATION) continue;
    const previous = latest.get(message.playerId);
    if (!previous || message.at >= previous.at) latest.set(message.playerId, message);
  }
  return latest;
}

export interface LabelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function placeLabel(anchor: LabelRect, obstacles: readonly LabelRect[], viewportWidth: number) {
  const gap = 8;
  const x = Math.max(gap, Math.min(anchor.x - anchor.width / 2, viewportWidth - anchor.width - gap));
  let y = Math.max(gap, anchor.y - anchor.height);
  for (let step = 0; step <= obstacles.length; step++) {
    const collisions = obstacles.filter(
      (rect) =>
        x < rect.x + rect.width + gap &&
        x + anchor.width + gap > rect.x &&
        y < rect.y + rect.height + gap &&
        y + anchor.height + gap > rect.y,
    );
    if (collisions.length === 0) break;
    const next = Math.max(gap, Math.min(...collisions.map((rect) => rect.y)) - anchor.height - gap);
    if (next === y) break;
    y = next;
  }
  return { x, y, width: anchor.width, height: anchor.height };
}
