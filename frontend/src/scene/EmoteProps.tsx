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
import { EMOTE_PROP, type EmotePoses, emoteFrame, smokePuffs } from './emoteMotion';
import type { SeatedModel } from './modelPose';

/** 캐릭터별 손끝 색. 인형 손끝의 밝은 커프와 같은 색으로 해서 가운뎃손가락이 손에서 자란 것처럼 보이게 한다. */
const PAW_COLORS = ['#f1e7da', '#efe4d6', '#ece8e2', '#f1e6d4'] as const;
const PUFFS = 2;

/** 왼손에 붙는 모션 소품(손 위로 솟은 가운뎃손가락, 담배)과 입에서 나오는 연기. */
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
      // 입 앞에서 시작해 옆으로 비껴 머리 위로 올라가며 사라진다.
      puff.position.set(0.1 + progress * 0.25, -0.05 + progress * 0.75, 0.3 + progress * 0.05);
      puff.scale.setScalar(0.04 + progress * 0.1);
      (puff.material as MeshBasicMaterial).opacity = 0.45 * (1 - progress);
    });
  }, -1);

  return (
    <>
      {createPortal(
        <>
          <group ref={finger} quaternion={fingerTurn} visible={false}>
            <mesh position={[0, EMOTE_PROP.fingerTip - 0.125, 0]}>
              <capsuleGeometry args={[0.052, 0.16, 6, 12]} />
              <meshStandardMaterial color={paw} roughness={0.95} />
            </mesh>
          </group>
          <group ref={cigarette} quaternion={cigaretteTurn} visible={false}>
            <mesh position={[0, 0, EMOTE_PROP.cigaretteTip - 0.105]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.022, 0.022, 0.16, 12]} />
              <meshStandardMaterial color="#f4f1ea" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0, EMOTE_PROP.cigaretteTip - 0.2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.023, 0.023, 0.06, 12]} />
              <meshStandardMaterial color="#d98a3d" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0, EMOTE_PROP.cigaretteTip - 0.02]}>
              <sphereGeometry args={[0.024, 10, 8]} />
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
