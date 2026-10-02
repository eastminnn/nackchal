import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Vector3 } from 'three';
import { type Chat, type Player, SELF } from '../game/types';
import { type LabelRect, placeLabel, SPEECH_DURATION, visibleSpeech } from './labelLayout';
import type { SeatedModel } from './modelPose';

export type CharacterLabelElements = Map<string, HTMLDivElement>;

export function CharacterLabels({
  players,
  messages,
  elements,
  onResize,
}: {
  readonly players: readonly Player[];
  readonly messages: readonly Chat[];
  readonly elements: CharacterLabelElements;
  readonly onResize: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  useLayoutEffect(() => onResize());
  useLayoutEffect(() => {
    const observer = new ResizeObserver(onResize);
    for (const player of players) {
      const element = elements.get(player.id);
      if (element) observer.observe(element);
    }
    onResize();
    return () => observer.disconnect();
  }, [elements, players, onResize]);
  const speech = visibleSpeech(messages, Math.max(now, Date.now()));
  useEffect(() => {
    const active = visibleSpeech(messages, Math.max(now, Date.now()));
    if (active.size === 0) return;
    const next = Math.min(...Array.from(active.values(), (message) => message.at + SPEECH_DURATION));
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, next - Date.now()));
    return () => clearTimeout(timer);
  }, [messages, now]);
  return (
    <div className="character-labels" aria-hidden="true">
      {players.map((player) => {
        const message = speech.get(player.id);
        return (
          <div
            className="character-label"
            data-player-id={player.id}
            key={player.id}
            ref={(node) => {
              if (node) elements.set(player.id, node);
              else elements.delete(player.id);
            }}
          >
            {message && (
              <div className="character-speech" key={message.id}>
                {message.body}
              </div>
            )}
            <div className="character-name">
              {player.id === SELF && <span>나</span>}
              <strong>{player.name}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CharacterLabelProjection({
  residents,
  elements,
}: {
  readonly residents: ReadonlyMap<string, SeatedModel>;
  readonly elements: CharacterLabelElements;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const point = useMemo(() => new Vector3(), []);
  const edge = useMemo(() => new Vector3(), []);
  useEffect(() => {
    invalidate();
    return () => {
      for (const element of elements.values()) element.style.visibility = 'hidden';
    };
  }, [elements, invalidate]);
  useFrame(({ camera, size }) => {
    camera.updateMatrixWorld();
    const obstacles: LabelRect[] = [];
    const labels: { element: HTMLDivElement; anchor: LabelRect }[] = [];
    for (const [id, element] of elements) {
      const model = residents.get(id);
      if (!model) {
        element.style.visibility = 'hidden';
        continue;
      }
      model.nameTag.getWorldPosition(point).project(camera);
      if (point.z < -1 || point.z > 1) {
        element.style.visibility = 'hidden';
        continue;
      }
      const x = ((point.x + 1) * size.width) / 2;
      const y = ((1 - point.y) * size.height) / 2;
      labels.push({ element, anchor: { x, y, width: element.offsetWidth, height: element.offsetHeight } });
      model.face.getWorldPosition(point).project(camera);
      const faceY = ((1 - point.y) * size.height) / 2;
      const headWidth = Math.max(32, faceY - y);
      obstacles.push({ x: x - headWidth / 2, y: y + 12, width: headWidth, height: headWidth });
      model.grip.updateWorldMatrix(true, false);
      point.set(0, 0.989, 0).applyMatrix4(model.grip.matrixWorld);
      edge.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(0.44).add(point).project(camera);
      point.project(camera);
      const radius = (Math.abs(edge.x - point.x) * size.width) / 2;
      obstacles.push({
        x: ((point.x + 1) * size.width) / 2 - radius,
        y: ((1 - point.y) * size.height) / 2 - radius,
        width: radius * 2,
        height: radius * 2,
      });
    }
    labels.sort((a, b) => a.anchor.y - b.anchor.y);
    for (const { element, anchor } of labels) {
      const rect = placeLabel(anchor, obstacles, size.width);
      obstacles.push(rect);
      const transform = `translate3d(${Math.round(rect.x)}px, ${Math.round(rect.y)}px, 0)`;
      if (element.style.transform !== transform) element.style.transform = transform;
      element.style.visibility = 'visible';
    }
  });
  return null;
}
