import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type Group, MathUtils, type Mesh, type MeshBasicMaterial, Vector3 } from 'three';
import type { Effect } from '../game/types';
import { LotModel } from './LotModel';
import type { SeatedModel } from './modelPose';
import { hitReaction, PRANK_IMPACT, PRANK_TIMING } from './prankMotion';

export function PrankEffect({
  effect,
  residents,
  reducedMotion,
}: {
  readonly effect: Effect;
  readonly residents: ReadonlyMap<string, SeatedModel>;
  readonly reducedMotion: boolean;
}) {
  const object = useRef<Group>(null);
  const contact = useRef<Mesh>(null);
  const contactMaterial = useRef<MeshBasicMaterial>(null);
  const path = useMemo(() => ({ from: new Vector3(), to: new Vector3(), released: false }), []);
  useFrame(({ camera, invalidate }) => {
    if (!object.current || !contact.current || !contactMaterial.current) return;
    const age = Date.now() - effect.at;
    const source = residents.get(effect.source);
    const target = residents.get(effect.target);
    object.current.visible = false;
    contact.current.visible = false;
    if (!source || !target || age < 0) return;
    const reaction = hitReaction(age, effect.item, reducedMotion);
    if (reaction.contact > 0) {
      contact.current.visible = true;
      target.face.getWorldPosition(contact.current.position);
      contact.current.lookAt(camera.position);
      contactMaterial.current.opacity = reaction.contact * 0.55;
    }
    const end = PRANK_IMPACT + (effect.item === 'can' ? PRANK_TIMING.bounce : 0);
    if (!reducedMotion && age < end) {
      object.current.visible = true;
      if (age < PRANK_TIMING.release) {
        source.throwingHand.getWorldPosition(object.current.position);
      } else {
        if (!path.released) {
          source.throwingHand.getWorldPosition(path.from);
          target.face.getWorldPosition(path.to);
          path.released = true;
        }
        const flight = MathUtils.clamp((age - PRANK_TIMING.release) / PRANK_TIMING.flight, 0, 1);
        object.current.position.lerpVectors(path.from, path.to, flight);
        object.current.position.y += Math.sin(flight * Math.PI) * 1.15;
        if (age >= PRANK_IMPACT) {
          const bounce = (age - PRANK_IMPACT) / PRANK_TIMING.bounce;
          object.current.position.lerp(path.from, bounce * 0.12);
          object.current.position.y += Math.sin(bounce * Math.PI) * 0.35 - bounce * bounce * 1.8;
          object.current.scale.setScalar(1 - MathUtils.smoothstep(bounce, 0.7, 1));
        }
      }
      object.current.rotation.set(age * 0.007, 0, age * 0.011);
    }
    if (age < (reducedMotion ? 450 : Math.max(end, PRANK_IMPACT + 450))) invalidate();
  }, -1);
  return (
    <>
      <group ref={object} visible={false}>
        <LotModel kind={effect.item} />
      </group>
      <mesh ref={contact} visible={false}>
        <ringGeometry args={[0.38, 0.42, 24]} />
        <meshBasicMaterial
          ref={contactMaterial}
          color={effect.item === 'tomato' ? '#d85849' : '#fff3db'}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
