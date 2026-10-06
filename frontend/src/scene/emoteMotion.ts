import { type Bone, MathUtils, Quaternion, Vector3 } from 'three';
import type { EmoteKind } from '../game/types';
import { aimBone, type SeatedModel } from './modelPose';

/** 모션 길이(ms). 서버의 EmoteKind와 같다. */
export const EMOTE_DURATION: Readonly<Record<EmoteKind, number>> = { MIDDLE_FINGER: 3000, SMOKE: 6000 };

/**
 * 손 소품이 손바닥 뼈에서 소품 방향으로 끝나는 거리. 인형 손은 둥근 장갑이라(손바닥에서 0.13~0.22) 이보다 길어야 보인다.
 * 주먹은 인형 손 자체를 쓰고 가운뎃손가락만 손 위로 솟게 한다.
 */
export const EMOTE_PROP = { fingerTip: 0.37, cigaretteTip: 0.4 } as const;

const FINGER_RAISE = 400;
const FINGER_LOWER = 2600;
const SMOKE_CYCLE = 3000;
const SMOKE_AT_MOUTH = 800;
const SMOKE_LOWER = 2000;
const PUFF_LIFE = 1200;

/** 모션 시작 후 age(ms)의 팔 진행도(0~1), 담배 끝 밝기, 소품 표시 여부. */
export function emoteFrame(kind: EmoteKind, age: number, reducedMotion: boolean) {
  if (age < 0 || age >= EMOTE_DURATION[kind]) return { arm: 0, glow: 0, prop: false };
  if (kind === 'MIDDLE_FINGER') {
    if (reducedMotion) return { arm: 1, glow: 0, prop: true };
    const arm =
      age < FINGER_RAISE
        ? MathUtils.smoothstep(age, 0, FINGER_RAISE)
        : age < FINGER_LOWER
          ? 1
          : 1 - MathUtils.smoothstep(age, FINGER_LOWER, EMOTE_DURATION.MIDDLE_FINGER);
    return { arm, glow: 0, prop: true };
  }
  // 담배는 3초 주기를 두 번 반복한다. 입에 대고 있는 동안만 끝이 밝아진다.
  const t = age % SMOKE_CYCLE;
  const glow = t >= SMOKE_AT_MOUTH && t < SMOKE_LOWER ? 1 : 0;
  if (reducedMotion) return { arm: 1, glow, prop: true };
  const arm =
    t < SMOKE_AT_MOUTH
      ? MathUtils.smoothstep(t, 0, SMOKE_AT_MOUTH)
      : t < SMOKE_LOWER
        ? 1
        : 1 - MathUtils.smoothstep(t, SMOKE_LOWER, SMOKE_CYCLE);
  return { arm, glow, prop: true };
}

/** 담배 모션 age(ms)에 보이는 연기 퍼프의 진행도(0~1). 손을 내릴 때마다 하나씩 나온다. */
export function smokePuffs(age: number) {
  return [SMOKE_LOWER, SMOKE_CYCLE + SMOKE_LOWER]
    .map((start) => (age - start) / PUFF_LIFE)
    .filter((progress) => progress >= 0 && progress < 1);
}

interface ArmPose {
  readonly bone: Bone;
  readonly rest: Quaternion;
  readonly target: Quaternion;
}

/**
 * 왼팔(입찰 패들을 들지 않는 팔)로 하는 모션 자세를 미리 계산한다. 모델이 장면에 붙기 전에 호출하므로
 * 방향은 모델 기준이며 +z가 앞쪽이다. 손 소품이 세계 기준으로 어느 쪽을 향해야 하는지도 손 기준 방향으로 돌려준다.
 */
export function prepareEmotes(model: SeatedModel) {
  const [upper, lower] = model.throwingArm;
  if (!upper || !lower) throw new Error('Plush model is missing the left arm');
  const palm = model.throwingPalm;
  const handSpace = (direction: Vector3) =>
    direction.clone().applyQuaternion(model.throwingHand.getWorldQuaternion(new Quaternion()).invert());
  const capture = (aim: () => void) => {
    aim();
    model.scene.updateMatrixWorld(true);
    return [upper, lower].map(({ bone, rest }) => ({ bone, rest, target: bone.quaternion.clone() }));
  };

  const finger = capture(() => {
    aimBone(upper.bone, lower.bone, new Vector3(0.25, 0.35, 1));
    aimBone(lower.bone, palm, new Vector3(0.05, 0.45, 1));
  });
  const fingerUp = handSpace(new Vector3(0, 1, 0));

  const smoke = capture(() => {
    aimBone(upper.bone, lower.bone, new Vector3(0.5, -0.35, 0.55));
    lower.bone.updateWorldMatrix(true, false);
    const elbow = lower.bone.getWorldPosition(new Vector3());
    const mouth = model.face.getWorldPosition(new Vector3());
    aimBone(lower.bone, palm, mouth.sub(elbow));
  });
  const cigaretteForward = handSpace(new Vector3(-0.2, 0.15, 1).normalize());

  for (const { bone, rest } of [upper, lower]) bone.quaternion.copy(rest);
  model.scene.updateMatrixWorld(true);
  return { MIDDLE_FINGER: finger, SMOKE: smoke, fingerUp, cigaretteForward };
}

export type EmotePoses = ReturnType<typeof prepareEmotes>;

/** 팔을 쉬는 자세와 모션 자세 사이 weight(0~1)로 옮긴다. */
export function applyEmote(poses: readonly ArmPose[], weight: number) {
  for (const pose of poses) pose.bone.quaternion.slerpQuaternions(pose.rest, pose.target, weight);
}
