import { Ball, Cylinder, materials as m } from './primitives';

export function Plant({
  x,
  z,
  scale = 1,
}: {
  readonly x: number;
  readonly z: number;
  readonly scale?: number;
}) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <Cylinder at={[0, 0.28, 0]} radius={0.25} top={0.36} height={0.5} color={m.rug} />
      <Cylinder at={[0, 0.8, 0]} radius={0.045} height={0.8} color={m.darkWood} />
      {[-1, 1].flatMap((side) =>
        [0, 1, 2].map((level) => (
          <Ball
            key={`${side}-${level}`}
            at={[side * 0.22, 0.7 + level * 0.24, 0]}
            size={[0.36, 0.12, 0.2]}
            rotation={[0, level * 0.7, side * 0.5]}
            color={level % 2 ? m.curtain : m.sage}
          />
        )),
      )}
    </group>
  );
}
