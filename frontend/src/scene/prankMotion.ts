import { MathUtils, Quaternion, Vector3 } from 'three';
import type { Effect, ItemKind } from '../game/types';
import { aimBone, type SeatedModel } from './modelPose';

export const PRANK_TIMING = {
  windup: 180,
  release: 320,
  recover: 600,
  flight: 650,
  wobble: 720,
  blush: 3800,
  bounce: 420,
} as const;
export const PRANK_IMPACT = PRANK_TIMING.release + PRANK_TIMING.flight;

export function prepareThrow(model: SeatedModel, target: Vector3) {
  const direction = target.clone().sub(model.throwingHand.getWorldPosition(new Vector3())).normalize();
  const orientation = model.scene.getWorldQuaternion(new Quaternion());
  const [upper, lower] = model.throwingArm;
  if (!upper || !lower) return [];
  aimBone(upper.bone, lower.bone, new Vector3(0.7, 0.55, -0.2).applyQuaternion(orientation));
  aimBone(lower.bone, model.throwingPalm, new Vector3(0.15, 0.8, -0.5).applyQuaternion(orientation));
  const windup = model.throwingArm.map(({ bone }) => bone.quaternion.clone());
  aimBone(upper.bone, lower.bone, new Vector3(direction.x, 0.3, direction.z));
  aimBone(lower.bone, model.throwingPalm, direction);
  const poses = model.throwingArm.map((arm, index) => ({
    ...arm,
    windup: windup[index] ?? arm.rest,
    release: arm.bone.quaternion.clone(),
  }));
  for (const arm of model.throwingArm) arm.bone.quaternion.copy(arm.rest);
  return poses;
}

export function applyThrow(poses: ReturnType<typeof prepareThrow>, age: number, reducedMotion: boolean) {
  for (const pose of poses) {
    if (reducedMotion || age < 0 || age >= PRANK_TIMING.recover) pose.bone.quaternion.copy(pose.rest);
    else if (age < PRANK_TIMING.windup)
      pose.bone.quaternion.slerpQuaternions(
        pose.rest,
        pose.windup,
        MathUtils.smoothstep(age, 0, PRANK_TIMING.windup),
      );
    else if (age < PRANK_TIMING.release)
      pose.bone.quaternion.slerpQuaternions(
        pose.windup,
        pose.release,
        MathUtils.smoothstep(age, PRANK_TIMING.windup, PRANK_TIMING.release),
      );
    else
      pose.bone.quaternion.slerpQuaternions(
        pose.release,
        pose.rest,
        MathUtils.smoothstep(age, PRANK_TIMING.release, PRANK_TIMING.recover),
      );
  }
}

export function hitReaction(age: number, item: ItemKind, reducedMotion: boolean) {
  const sinceImpact = age - (reducedMotion ? 0 : PRANK_IMPACT);
  if (sinceImpact < 0) return { roll: 0, pitch: 0, blush: 0, contact: 0 };
  const t = MathUtils.clamp(sinceImpact / PRANK_TIMING.wobble, 0, 1);
  const wave = Math.sin(t * Math.PI * 5) * (1 - t) ** 2;
  return {
    roll: reducedMotion ? 0 : wave * (item === 'can' ? 0.18 : 0.13),
    pitch: reducedMotion ? 0 : Math.sin(t * Math.PI * 3) * (1 - t) ** 2 * 0.09,
    blush: item === 'tomato' ? 1 - MathUtils.smoothstep(sinceImpact, 800, PRANK_TIMING.blush) : 0,
    contact: 1 - MathUtils.smoothstep(sinceImpact, 100, 450),
  };
}

const rollTurn = new Quaternion();
const pitchTurn = new Quaternion();

export function applyHits(
  model: SeatedModel,
  effects: readonly Effect[],
  now: number,
  reducedMotion: boolean,
) {
  let roll = 0;
  let pitch = 0;
  let blush = 0;
  for (const effect of effects) {
    const reaction = hitReaction(now - effect.at, effect.item, reducedMotion);
    roll += reaction.roll;
    pitch += reaction.pitch;
    blush = Math.max(blush, reaction.blush);
  }
  model.head.quaternion
    .copy(model.headRest)
    .multiply(rollTurn.setFromAxisAngle(model.headRollAxis, MathUtils.clamp(roll, -0.18, 0.18)))
    .multiply(pitchTurn.setFromAxisAngle(model.headPitchAxis, MathUtils.clamp(pitch, -0.12, 0.12)));
  model.blush.strength.value = blush;
}
