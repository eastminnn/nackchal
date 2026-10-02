import { createPortal, useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { MathUtils, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_MODELS } from '../data/characters';
import type { Effect, Player } from '../game/types';
import { BidPaddle } from './BidPaddle';
import { ModelAsset } from './ModelAsset';
import { type SeatedModel, seatedModel } from './modelPose';
import { applyHits, applyThrow, PRANK_IMPACT, PRANK_TIMING, prepareThrow } from './prankMotion';
import { SEATS } from './seats';

export function Resident({
  player,
  index,
  amount,
  leading,
  reducedMotion,
  effects,
  residents,
  targetable,
}: {
  readonly player: Player;
  readonly index: number;
  readonly amount: number;
  readonly leading: boolean;
  readonly reducedMotion: boolean;
  readonly effects: readonly Effect[];
  readonly residents: Map<string, SeatedModel>;
  readonly targetable: boolean;
}) {
  const filename = CHARACTER_MODELS[player.avatar % CHARACTER_MODELS.length] ?? CHARACTER_MODELS[0];
  const asset = useLoader(GLTFLoader, `/models/animals/${filename}.glb`);
  const model = useMemo(() => seatedModel(asset), [asset]);
  const progress = useRef(0);
  const animating = useRef(false);
  const throwing = useRef<{
    readonly effect: Effect;
    readonly poses: ReturnType<typeof prepareThrow>;
  } | null>(null);
  const targetPosition = useMemo(() => new Vector3(), []);
  const hits = useMemo(() => effects.filter((effect) => effect.target === player.id), [effects, player.id]);
  const toss = effects.findLast((effect) => effect.source === player.id);
  const invalidate = useThree((state) => state.invalidate);
  const seat = SEATS[index] ?? SEATS[0];
  useEffect(() => {
    if (reducedMotion || progress.current !== Number(leading) || effects.length > 0) invalidate();
  }, [leading, reducedMotion, effects, invalidate]);
  useEffect(() => {
    residents.set(player.id, model);
    return () => {
      residents.delete(player.id);
    };
  }, [model, player.id, residents]);
  useEffect(
    () => () => {
      model.scene.traverse((object) => {
        if (object instanceof SkinnedMesh) object.skeleton.dispose();
      });
      model.blush.dispose();
    },
    [model],
  );
  useFrame((_, delta) => {
    const target = Number(leading);
    const now = Date.now();
    const tossing = toss !== undefined && now - toss.at < PRANK_TIMING.recover;
    const reacting = hits.some(
      (effect) =>
        now - effect.at <
        (reducedMotion ? 0 : PRANK_IMPACT) +
          (effect.item === 'tomato' ? PRANK_TIMING.blush : PRANK_TIMING.wobble),
    );
    const active = progress.current !== target || tossing || reacting;
    if (!active && !animating.current) return;
    animating.current = active;
    progress.current =
      reducedMotion || Math.abs(progress.current - target) <= 0.002
        ? target
        : MathUtils.damp(progress.current, target, 10, Math.min(delta, 0.05));
    for (const arm of model.arms)
      arm.bone.quaternion.slerpQuaternions(arm.rest, arm.raised, progress.current);
    if (toss && now - toss.at < PRANK_TIMING.recover && throwing.current?.effect !== toss) {
      const recipient = residents.get(toss.target);
      if (recipient) {
        recipient.face.getWorldPosition(targetPosition);
        throwing.current = { effect: toss, poses: prepareThrow(model, targetPosition) };
      }
    }
    if (throwing.current)
      applyThrow(throwing.current.poses, toss ? now - throwing.current.effect.at : Infinity, reducedMotion);
    applyHits(model, hits, now, reducedMotion);
    model.scene.updateMatrixWorld(true);
    if (progress.current !== target || reacting || tossing) invalidate();
  }, -2);
  return (
    <group position={seat?.at ?? [0, 0, 0]} rotation={[0, seat?.rotation ?? 0, 0]}>
      <ModelAsset name="chair" size={[1.35, 1.7, 1.25]} />
      <group position={[0, 0.06, 0.02]} dispose={null}>
        <primitive object={model.scene} />
      </group>
      {createPortal(<BidPaddle amount={amount} seat={index} />, model.grip)}
      {targetable && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.75, 0.8, 32]} />
          <meshBasicMaterial color="#dfb876" />
        </mesh>
      )}
    </group>
  );
}
