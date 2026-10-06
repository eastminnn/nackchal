import { createPortal, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { ActiveEmote } from '../game/types';
import { type EmotePoses, emoteFrame, smokePuffs } from './emoteMotion';
import type { SeatedModel } from './modelPose';

/** 캐릭터별 손 색. 소품 주먹을 인형 팔과 같은 색으로 맞춘다. */
const PAW_COLORS = ['#c8693a', '#ece2d6', '#e8e4de', '#e8b64c'] as const;
const PUFFS = 2;

/** 왼손에 붙는 모션 소품(가운뎃손가락 주먹, 담배)과 입에서 나오는 연기. */
export function EmoteProps({
  model,
  poses,
  emote,
  avatar,
  reducedMotion,
}: {
  readonly model: SeatedModel;
  readonly poses: EmotePoses;
  readonly emote: ActiveEmote | undefined;
  readonly avatar: number;
  readonly reducedMotion: boolean;
}) {
  const finger = useRef<Group>(null);
  const cigarette = useRef<Group>(null);
  const tip = useRef<MeshStandardMaterial>(null);
  const puffs = useRef<(Mesh | null)[]>([]);
  const fingerTurn = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), poses.fingerUp.clone().normalize()),
    [poses],
  );
  const cigaretteTurn = useMemo(
    () =>
      new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), poses.cigaretteForward.clone().normalize()),
    [poses],
  );
  const paw = PAW_COLORS[avatar % PAW_COLORS.length] ?? PAW_COLORS[0];

  useFrame(() => {
    const age = emote ? Date.now() - emote.startedAt : -1;
    const frame = emote ? emoteFrame(emote.kind, age, reducedMotion) : emoteFrame('SMOKE', -1, reducedMotion);
    if (finger.current) finger.current.visible = frame.prop && emote?.kind === 'MIDDLE_FINGER';
    if (cigarette.current) cigarette.current.visible = frame.prop && emote?.kind === 'SMOKE';
    if (tip.current) tip.current.emissiveIntensity = 0.4 + frame.glow * 2.2;
    const visiblePuffs = emote?.kind === 'SMOKE' && !reducedMotion ? smokePuffs(age) : [];
    puffs.current.forEach((puff, index) => {
      if (!puff) return;
      const progress = visiblePuffs[index];
      puff.visible = progress !== undefined;
      if (progress === undefined) return;
      puff.position.set(0.04 * (index + 1), 0.08 + progress * 0.45, 0.14 + progress * 0.2);
      puff.scale.setScalar(0.05 + progress * 0.14);
      (puff.material as MeshBasicMaterial).opacity = 0.5 * (1 - progress);
    });
  }, -1);

  return (
    <>
      {createPortal(
        <>
          <group ref={finger} quaternion={fingerTurn} visible={false}>
            <mesh>
              <sphereGeometry args={[0.1, 20, 14]} />
              <meshStandardMaterial color={paw} roughness={0.95} />
            </mesh>
            <mesh position={[0, 0.13, 0.02]}>
              <capsuleGeometry args={[0.032, 0.11, 6, 12]} />
              <meshStandardMaterial color={paw} roughness={0.95} />
            </mesh>
          </group>
          <group ref={cigarette} quaternion={cigaretteTurn} visible={false}>
            <mesh position={[0, 0, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.016, 0.016, 0.16, 12]} />
              <meshStandardMaterial color="#f4f1ea" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0, 0.005]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.017, 0.017, 0.05, 12]} />
              <meshStandardMaterial color="#d98a3d" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0, 0.185]}>
              <sphereGeometry args={[0.018, 10, 8]} />
              <meshStandardMaterial ref={tip} color="#ff5a1f" emissive="#ff3b0a" emissiveIntensity={0.4} />
            </mesh>
          </group>
        </>,
        model.throwingHand,
      )}
      {createPortal(
        Array.from({ length: PUFFS }, (_, index) => (
          <mesh
            // biome-ignore lint/suspicious/noArrayIndexKey: 연기 퍼프는 개수가 고정된 자리다.
            key={index}
            ref={(mesh) => {
              puffs.current[index] = mesh;
            }}
            visible={false}
          >
            <sphereGeometry args={[1, 14, 10]} />
            <meshBasicMaterial color="#d9d6d0" transparent opacity={0} depthWrite={false} />
          </mesh>
        )),
        model.face,
      )}
    </>
  );
}
