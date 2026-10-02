import { Bone, Box3, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { plushBlush } from './plushBlush';

export function aimBone(bone: Bone, child: Bone, direction: Vector3) {
  bone.updateWorldMatrix(true, true);
  const origin = bone.getWorldPosition(new Vector3());
  const current = child.getWorldPosition(new Vector3()).sub(origin).normalize();
  const turn = new Quaternion().setFromUnitVectors(current, direction.normalize());
  const world = bone.getWorldQuaternion(new Quaternion()).premultiply(turn);
  const parent = bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
  bone.quaternion.copy(parent.invert().multiply(world)).normalize();
  bone.updateWorldMatrix(true, true);
}

export function seatedModel(asset: GLTF) {
  const scene = clone(asset.scene);
  const joints = new Map<string, Bone>();
  scene.traverse((object) => {
    if (object instanceof Bone) joints.set(object.name, object);
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = false;
    }
  });
  const joint = (name: string) => {
    const bone = joints.get(name);
    if (!bone) throw new Error(`Plush model is missing joint: ${name}`);
    return bone;
  };
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene);
  scene.scale.multiplyScalar(2.5 / bounds.getSize(new Vector3()).y);
  scene.updateMatrixWorld(true);
  for (const side of ['L', 'R']) {
    aimBone(joint(`${side}Leg1`), joint(`${side}Leg2`), new Vector3(side === 'L' ? 0.1 : -0.1, -0.1, 1));
    aimBone(joint(`${side}Leg2`), joint(`${side}LegAnkle`), new Vector3(0, -1, 0.12));
    aimBone(joint(`${side}Arm1`), joint(`${side}Arm2`), new Vector3(side === 'L' ? 0.45 : -0.55, -1, 0.1));
    aimBone(joint(`${side}Arm2`), joint(`${side}ArmPalm`), new Vector3(side === 'L' ? 0.15 : -0.2, -0.3, 1));
  }
  const hip = joints.get('Hips') ?? joint('Hub001');
  const hipPosition = hip.getWorldPosition(new Vector3());
  scene.position.add(new Vector3(-hipPosition.x, 1.08 - hipPosition.y, -0.04 - hipPosition.z));
  scene.updateMatrixWorld(true);
  const armBones = [joint('RArm1'), joint('RArm2')] as const;
  const rest = armBones.map((bone) => bone.quaternion.clone());
  aimBone(armBones[0], joint('RArm2'), new Vector3(-0.78, 0.62, 0.08));
  aimBone(armBones[1], joint('RArmPalm'), new Vector3(-0.15, 1, 0.12));
  const hand = joint('RArmPalm');
  const grip = new Object3D();
  grip.name = 'PaddleGrip';
  grip.quaternion.copy(hand.getWorldQuaternion(new Quaternion()).invert());
  const worldScale = hand.getWorldScale(new Vector3());
  grip.scale.set(1 / worldScale.x, 1 / worldScale.y, 1 / worldScale.z);
  hand.add(grip);
  const arms = armBones.map((bone, index) => ({
    bone,
    rest: rest[index] ?? bone.quaternion.clone(),
    raised: bone.quaternion.clone(),
  }));
  for (const arm of arms) arm.bone.quaternion.copy(arm.rest);
  scene.updateMatrixWorld(true);
  const head = joint('Head');
  const headroom = new Box3().setFromObject(scene, true).max.y - head.getWorldPosition(new Vector3()).y;
  const headInverse = head.getWorldQuaternion(new Quaternion()).invert();
  const socket = (bone: Bone, offset: Vector3) => {
    const anchor = new Object3D();
    anchor.position.copy(bone.worldToLocal(bone.getWorldPosition(new Vector3()).add(offset)));
    anchor.quaternion.copy(bone.getWorldQuaternion(new Quaternion()).invert());
    const scale = bone.getWorldScale(new Vector3());
    anchor.scale.set(1 / scale.x, 1 / scale.y, 1 / scale.z);
    bone.add(anchor);
    return anchor;
  };
  return {
    scene,
    arms,
    grip,
    head,
    nameTag: socket(head, new Vector3(0, headroom + 0.18, 0)),
    headRest: head.quaternion.clone(),
    headRollAxis: new Vector3(0, 0, 1).applyQuaternion(headInverse),
    headPitchAxis: new Vector3(1, 0, 0).applyQuaternion(headInverse),
    face: socket(head, new Vector3(0, 0.2, 0.32)),
    throwingHand: socket(joint('LArmPalm'), new Vector3()),
    throwingPalm: joint('LArmPalm'),
    throwingArm: [joint('LArm1'), joint('LArm2')].map((bone) => ({ bone, rest: bone.quaternion.clone() })),
    blush: plushBlush(scene),
  };
}

export type SeatedModel = ReturnType<typeof seatedModel>;
