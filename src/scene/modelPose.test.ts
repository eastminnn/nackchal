import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { Box3, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { CHARACTER_MODELS } from '../data/characters';
import type { Effect } from '../game/types';
import { seatedModel } from './modelPose';
import { applyHits, applyThrow, PRANK_IMPACT, PRANK_TIMING, prepareThrow } from './prankMotion';

async function loadPlush(name: string) {
  const io = new NodeIO();
  const document = await io.read(
    fileURLToPath(new URL(`../../public/models/animals/${name}.glb`, import.meta.url)),
  );
  for (const material of document.getRoot().listMaterials()) material.setBaseColorTexture(null);
  const bytes = await io.writeBinary(document);
  return new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, '');
}

describe('plush bidding poses', () => {
  it.each(CHARACTER_MODELS)(
    '%s raises a rigid hand attachment without moving another resident',
    async (name) => {
      const asset = await loadPlush(name);
      const bidder = seatedModel(asset);
      const neighbor = seatedModel(asset);
      const restPosition = bidder.grip.getWorldPosition(new Vector3());
      const neighborPosition = neighbor.grip.getWorldPosition(new Vector3());
      const restScale = bidder.grip.getWorldScale(new Vector3());
      const top = new Box3().setFromObject(bidder.scene, true).max.y;
      expect(bidder.nameTag.getWorldPosition(new Vector3()).y).toBeCloseTo(top + 0.18, 3);
      expect(bidder.nameTag.parent).toBe(bidder.head);

      for (const arm of bidder.arms) arm.bone.quaternion.copy(arm.raised);
      bidder.scene.updateMatrixWorld(true);

      expect(bidder.grip.getWorldPosition(new Vector3()).y - restPosition.y).toBeGreaterThan(0.35);
      expect(bidder.grip.getWorldScale(new Vector3()).distanceTo(restScale)).toBeLessThan(0.0001);
      expect(restScale.distanceTo(new Vector3(1, 1, 1))).toBeLessThan(0.0001);
      expect(neighbor.grip.getWorldPosition(new Vector3()).distanceTo(neighborPosition)).toBeLessThan(0.0001);
      expect(bidder.grip.parent?.type).toBe('Bone');
    },
  );
});

describe.each(CHARACTER_MODELS)('%s prank reactions', (name) => {
  const tomato: Effect = {
    id: 1,
    at: 1000,
    source: 'me',
    target: 'player-2',
    item: 'tomato',
    throughRound: 2,
  };

  it('throws with the free hand while keeping a raised paddle still', async () => {
    const model = seatedModel(await loadPlush(name));
    for (const arm of model.arms) arm.bone.quaternion.copy(arm.raised);
    const paddle = model.grip.getWorldPosition(new Vector3());
    const hand = model.throwingHand.getWorldPosition(new Vector3());
    const poses = prepareThrow(model, new Vector3(-3, 2, 1));

    applyThrow(poses, PRANK_TIMING.windup, false);

    expect(model.throwingHand.getWorldPosition(new Vector3()).y - hand.y).toBeGreaterThan(0.2);
    expect(model.grip.getWorldPosition(new Vector3()).distanceTo(paddle)).toBeLessThan(0.0001);
    applyThrow(poses, PRANK_TIMING.recover, false);
    expect(model.throwingHand.getWorldPosition(new Vector3()).distanceTo(hand)).toBeLessThan(0.0001);
  });

  it('reacts on impact, tints only its own head and returns to rest', async () => {
    const asset = await loadPlush(name);
    const target = seatedModel(asset);
    const neighbor = seatedModel(asset);

    applyHits(target, [tomato], tomato.at + PRANK_IMPACT - 1, false);
    expect(target.head.quaternion.angleTo(target.headRest)).toBeLessThan(0.0001);
    expect(target.blush.strength.value).toBe(0);

    applyHits(target, [tomato], tomato.at + PRANK_IMPACT + 80, false);
    expect(target.head.quaternion.angleTo(target.headRest)).toBeGreaterThan(0.04);
    expect(target.blush.strength.value).toBeGreaterThan(0.9);
    expect(neighbor.blush.strength.value).toBe(0);
    expect(neighbor.head.quaternion.angleTo(neighbor.headRest)).toBeLessThan(0.0001);
    target.scene.traverse((object) => {
      if (!(object instanceof SkinnedMesh)) return;
      const mask = object.geometry.getAttribute('plushHeadWeight');
      const weights = Array.from({ length: mask.count }, (_, index) => mask.getX(index));
      expect(weights.some((weight) => weight === 0)).toBe(true);
      expect(weights.some((weight) => weight > 0.9)).toBe(true);
    });

    applyHits(target, [tomato], tomato.at + PRANK_IMPACT + PRANK_TIMING.blush, false);
    expect(target.head.quaternion.angleTo(target.headRest)).toBeLessThan(0.0001);
    expect(target.blush.strength.value).toBe(0);
  });

  it('keeps can impacts uncolored and respects reduced motion', async () => {
    const model = seatedModel(await loadPlush(name));
    applyHits(model, [{ ...tomato, item: 'can' }], tomato.at + PRANK_IMPACT + 80, false);
    expect(model.head.quaternion.angleTo(model.headRest)).toBeGreaterThan(0.04);
    expect(model.blush.strength.value).toBe(0);

    applyHits(model, [tomato], tomato.at + 80, true);
    expect(model.head.quaternion.angleTo(model.headRest)).toBeLessThan(0.0001);
    expect(model.blush.strength.value).toBeGreaterThan(0.9);
    const poses = prepareThrow(model, new Vector3(3, 2, 1));
    applyThrow(poses, PRANK_TIMING.windup, true);
    for (const pose of poses) expect(pose.bone.quaternion.angleTo(pose.rest)).toBeLessThan(0.0001);
  });
});
