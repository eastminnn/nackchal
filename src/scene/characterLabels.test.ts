import { describe, expect, it } from 'vitest';
import type { Chat } from '../game/types';
import { placeLabel, visibleSpeech } from './labelLayout';

const message = (playerId: string, at: number, body = '안녕'): Chat => ({
  id: at,
  playerId,
  name: playerId,
  body,
  at,
});

describe('character speech', () => {
  it('keeps the latest message for each speaker, including simultaneous messages', () => {
    const messages = [message('me', 1000), message('player-2', 2000), message('me', 2000, '다시 안녕')];
    const speech = visibleSpeech(messages, 2500);
    expect(speech.size).toBe(2);
    expect(speech.get('me')?.body).toBe('다시 안녕');
    expect(speech.get('player-2')?.body).toBe('안녕');
  });

  it('expires each speaker independently after seven seconds', () => {
    const messages = [message('me', 1000), message('player-2', 2000)];
    expect([...visibleSpeech(messages, 7999).keys()]).toEqual(['me', 'player-2']);
    expect([...visibleSpeech(messages, 8000).keys()]).toEqual(['player-2']);
    expect(visibleSpeech(messages, 9000).size).toBe(0);
  });
});

describe('character label placement', () => {
  it('keeps a clear label centered immediately above its anchor', () => {
    expect(placeLabel({ x: 500, y: 300, width: 120, height: 30 }, [], 1280)).toEqual({
      x: 440,
      y: 270,
      width: 120,
      height: 30,
    });
  });

  it('clears overlapping paddles and other bubbles and stays inside the viewport', () => {
    const obstacles = [
      { x: 15, y: 220, width: 100, height: 40 },
      { x: 15, y: 140, width: 100, height: 50 },
    ];
    expect(placeLabel({ x: 30, y: 280, width: 220, height: 80 }, obstacles, 1280)).toEqual({
      x: 8,
      y: 52,
      width: 220,
      height: 80,
    });
    expect(placeLabel({ x: 1270, y: 20, width: 220, height: 80 }, [], 1280).x).toBe(1052);
    expect(placeLabel({ x: 1270, y: 20, width: 220, height: 80 }, [], 1280).y).toBe(8);
  });
});
