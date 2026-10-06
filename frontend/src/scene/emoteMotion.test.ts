import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { Quaternion, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { CHARACTER_MODELS } from '../data/characters';
import { applyEmote, EMOTE_DURATION, EMOTE_PROP, emoteFrame, prepareEmotes, smokePuffs } from './emoteMotion';
import { seatedModel } from './modelPose';

async function loadPlush(name: string) {
  const io = new NodeIO();
  const document = await io.read(
    fileURLToPath(new URL(`../../public/models/animals/${name}.glb`, import.meta.url)),
  );
  for (const material of document.getRoot().listMaterials()) material.setBaseColorTexture(null);
  const bytes = await io.writeBinary(document);
  return new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
}

describe('emote timing', () => {
  it('raises, holds and lowers the middle finger within three seconds', () => {
    expect(emoteFrame('MIDDLE_FINGER', -1, false).arm).toBe(0);
    expect(emoteFrame('MIDDLE_FINGER', 0, false).arm).toBe(0);
    expect(emoteFrame('MIDDLE_FINGER', 1500, false).arm).toBe(1);
    expect(emoteFrame('MIDDLE_FINGER', 2900, false).arm).toBeGreaterThan(0);
    expect(emoteFrame('MIDDLE_FINGER', EMOTE_DURATION.MIDDLE_FINGER, false).arm).toBe(0);
    expect(emoteFrame('MIDDLE_FINGER', 1500, false).prop).toBe(true);
    expect(emoteFrame('MIDDLE_FINGER', 3000, false).prop).toBe(false);
  });

  it('smokes twice with a glowing tip only while the hand is at the mouth', () => {
    for (const drag of [1400, 4400]) {
      expect(emoteFrame('SMOKE', drag, false)).toMatchObject({ arm: 1, glow: 1 });
    }
    expect(emoteFrame('SMOKE', 2600, false).arm).toBeLessThan(1);
    expect(emoteFrame('SMOKE', 2600, false).glow).toBe(0);
    expect(emoteFrame('SMOKE', 2600, false).prop).toBe(true);
    expect(emoteFrame('SMOKE', EMOTE_DURATION.SMOKE, false).prop).toBe(false);
  });

  it('holds the full pose without easing when motion is reduced', () => {
    expect(emoteFrame('MIDDLE_FINGER', 10, true).arm).toBe(1);
    expect(emoteFrame('SMOKE', 2600, true).arm).toBe(1);
  });

  it('puffs smoke after each drag and lets it fade', () => {
    expect(smokePuffs(1999)).toEqual([]);
    expect(smokePuffs(2000)).toEqual([0]);
    expect(smokePuffs(2600)[0]).toBeCloseTo(0.5);
    expect(smokePuffs(3300)).toEqual([]);
    expect(smokePuffs(5600)).toHaveLength(1);
  });
});

/** 왼손바닥 뼈에 주로 붙은 정점이 손 위치에서 direction 쪽으로 얼마나 뻗는지. 인형 손의 두께다. */
function pawReach(model: ReturnType<typeof seatedModel>, direction: Vector3) {
  let mesh: SkinnedMesh | undefined;
  model.scene.traverse((object) => {
    if (object instanceof SkinnedMesh) mesh = object;
  });
  if (!mesh) throw new Error('Plush model has no skinned mesh');
  const palm = mesh.skeleton.bones.findIndex((bone) => bone.name === 'LArmPalm');
  const hand = model.throwingHand.getWorldPosition(new Vector3());
  const skinIndex = mesh.geometry.getAttribute('skinIndex');
  const skinWeight = mesh.geometry.getAttribute('skinWeight');
  const vertex = new Vector3();
  let reach = 0;
  for (let index = 0; index < skinIndex.count; index++) {
    let weight = 0;
    for (let slot = 0; slot < 4; slot++)
      if (skinIndex.getComponent(index, slot) === palm) weight += skinWeight.getComponent(index, slot);
    if (weight < 0.5) continue;
    mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld);
    reach = Math.max(reach, vertex.sub(hand).dot(direction));
  }
  return reach;
}

describe('emote poses', () => {
  it.each(CHARACTER_MODELS)('%s props stick out of the round paw', async (name) => {
    const model = seatedModel(await loadPlush(name));
    const poses = prepareEmotes(model);
    for (const [kind, axis, tip] of [
      ['MIDDLE_FINGER', poses.fingerUp, EMOTE_PROP.fingerTip],
      ['SMOKE', poses.cigaretteForward, EMOTE_PROP.cigaretteTip],
    ] as const) {
      applyEmote(poses[kind], 1);
      model.scene.updateMatrixWorld(true);
      const world = axis
        .clone()
        .applyQuaternion(model.throwingHand.getWorldQuaternion(new Quaternion()))
        .normalize();
      expect(tip - pawReach(model, world)).toBeGreaterThan(0.12);
      applyEmote(poses[kind], 0);
    }
  });

  it.each(CHARACTER_MODELS)('%s points forward and brings a cigarette to the mouth', async (name) => {
    const model = seatedModel(await loadPlush(name));
    const poses = prepareEmotes(model);
    const hand = () => model.throwingHand.getWorldPosition(new Vector3());
    const mouth = model.face.getWorldPosition(new Vector3());
    const rest = hand();

    applyEmote(poses.MIDDLE_FINGER, 1);
    model.scene.updateMatrixWorld(true);
    const pointing = hand();
    const shoulder = (model.throwingArm[0]?.bone ?? model.throwingPalm).getWorldPosition(new Vector3());
    expect(pointing.z - rest.z).toBeGreaterThan(0.15);
    expect(pointing.y).toBeGreaterThan(shoulder.y);

    applyEmote(poses.SMOKE, 1);
    model.scene.updateMatrixWorld(true);
    expect(hand().distanceTo(mouth)).toBeLessThan(rest.distanceTo(mouth) * 0.6);

    applyEmote(poses.SMOKE, 0);
    model.scene.updateMatrixWorld(true);
    expect(hand().distanceTo(rest)).toBeLessThan(1e-6);
  });
});
