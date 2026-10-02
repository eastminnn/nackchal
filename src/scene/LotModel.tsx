import type { ObjectKind } from '../game/types';
import { Plant } from './Plant';
import { Ball, Block, Cylinder, materials as m, SoftBox } from './primitives';

function Ring({
  x = 0,
  y,
  z = 0,
  radius,
  color = m.darkWood,
}: {
  readonly x?: number;
  readonly y: number;
  readonly z?: number;
  readonly radius: number;
  readonly color?: string;
}) {
  return (
    <mesh position={[x, y, z]} castShadow>
      <torusGeometry args={[radius, 0.07, 10, 28]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}
export function LotModel({ kind }: { readonly kind: ObjectKind }) {
  switch (kind) {
    case 'radio':
      return (
        <group>
          <SoftBox at={[0, 0.45, 0]} size={[1.3, 0.85, 0.5]} color={m.sage} />
          <SoftBox at={[0, 0.98, 0]} size={[0.7, 0.13, 0.16]} color={m.darkWood} />
          {[-0.3, 0.3].map((x) => (
            <Block key={x} at={[x, 0.86, 0]} size={[0.1, 0.25, 0.1]} color={m.darkWood} />
          ))}
          <Cylinder
            at={[-0.27, 0.43, 0.28]}
            radius={0.27}
            height={0.045}
            rotation={[Math.PI / 2, 0, 0]}
            color={m.cream}
          />
          {[-0.15, -0.05, 0.05, 0.15].map((offset) => (
            <Block key={offset} at={[-0.27, 0.43 + offset, 0.31]} size={[0.36, 0.018, 0.025]} color={m.oak} />
          ))}
          <Block at={[0.33, 0.62, 0.27]} size={[0.35, 0.18, 0.04]} color={m.darkWood} />
          <Cylinder
            at={[0.35, 0.28, 0.28]}
            radius={0.095}
            height={0.07}
            rotation={[Math.PI / 2, 0, 0]}
            color={m.cream}
          />
          <Cylinder
            at={[0.5, 1.15, -0.15]}
            radius={0.016}
            height={0.85}
            rotation={[0, 0, -0.2]}
            color={m.metal}
          />
        </group>
      );
    case 'camera':
      return (
        <group>
          <SoftBox at={[0, 0.36, 0]} size={[1.15, 0.65, 0.5]} color={m.darkWood} />
          <SoftBox at={[0, 0.72, 0]} size={[0.4, 0.18, 0.36]} color={m.metal} />
          <Cylinder
            at={[0, 0.38, 0.33]}
            radius={0.3}
            height={0.28}
            rotation={[Math.PI / 2, 0, 0]}
            color={m.metal}
          />
          <Cylinder
            at={[0, 0.38, 0.49]}
            radius={0.21}
            height={0.03}
            rotation={[Math.PI / 2, 0, 0]}
            color={m.ink}
          />
        </group>
      );
    case 'lamp':
      return (
        <group>
          <Cylinder at={[0, 0.08, 0]} radius={0.4} height={0.12} color={m.darkWood} />
          <Cylinder at={[0, 0.55, 0]} radius={0.06} height={0.95} color={m.darkWood} />
          <Cylinder at={[0, 1.05, 0]} radius={0.65} top={0.32} height={0.55} color={m.rug} />
        </group>
      );
    case 'shoe':
      return (
        <group>
          <SoftBox at={[0, 0.1, 0]} size={[0.6, 0.16, 1.25]} color={m.cream} />
          <SoftBox at={[0, 0.32, -0.22]} size={[0.56, 0.5, 0.65]} color={m.tomato} />
          <Ball at={[0, 0.23, 0.28]} size={[0.29, 0.18, 0.36]} color={m.tomato} />
          {[0, 0.12, 0.24].map((z) => (
            <Block key={z} at={[0, 0.45, z]} size={[0.4, 0.04, 0.04]} color={m.cream} />
          ))}
        </group>
      );
    case 'teapot':
      return (
        <group>
          <Ball at={[0, 0.45, 0]} size={[0.53, 0.43, 0.43]} color={m.cream} />
          <Cylinder at={[0, 0.81, 0]} radius={0.32} height={0.07} color={m.sage} />
          <Ball at={[0, 0.92, 0]} size={[0.1, 0.1, 0.1]} color={m.sage} />
          <Cylinder
            at={[-0.54, 0.5, 0]}
            radius={0.17}
            top={0.1}
            height={0.65}
            rotation={[0, 0, -0.8]}
            color={m.cream}
          />
          <Ring x={0.5} y={0.47} radius={0.29} color={m.sage} />
        </group>
      );
    case 'duck':
      return (
        <group>
          <Ball at={[0, 0.3, 0]} size={[0.55, 0.32, 0.42]} color={m.rug} />
          <Ball at={[0.2, 0.74, 0.12]} size={[0.32, 0.33, 0.3]} color={m.rug} />
          <Ball at={[0.26, 0.69, 0.45]} size={[0.2, 0.07, 0.19]} color={m.tomato} />
          <Ball at={[0.35, 0.82, 0.38]} size={[0.04, 0.055, 0.04]} color={m.ink} />
        </group>
      );
    case 'clock':
      return (
        <group>
          <Cylinder
            at={[0, 0.57, 0]}
            radius={0.55}
            height={0.3}
            rotation={[Math.PI / 2, 0, 0]}
            color={m.sage}
          />
          <Cylinder
            at={[0, 0.57, 0.17]}
            radius={0.46}
            height={0.025}
            rotation={[Math.PI / 2, 0, 0]}
            color={m.cream}
          />
          <Block at={[0, 0.71, 0.2]} size={[0.04, 0.3, 0.02]} color={m.ink} />
          <Block at={[0.12, 0.57, 0.2]} size={[0.27, 0.04, 0.02]} color={m.ink} />
          {[-0.35, 0.35].map((x) => (
            <Ball key={x} at={[x, 1.1, 0]} size={[0.24, 0.13, 0.18]} color={m.rug} />
          ))}
        </group>
      );
    case 'plant':
      return <Plant x={0} z={0} scale={0.9} />;
    case 'controller':
      return (
        <group rotation={[-0.3, 0, 0]}>
          <SoftBox at={[0, 0.4, 0]} size={[1.3, 0.6, 0.4]} color={m.cream} />
          <Block at={[-0.36, 0.4, 0.22]} size={[0.32, 0.08, 0.04]} color={m.ink} />
          <Block at={[-0.36, 0.4, 0.22]} size={[0.08, 0.32, 0.04]} color={m.ink} />
          <Ball at={[0.3, 0.48, 0.23]} size={[0.07, 0.07, 0.04]} color={m.tomato} />
          <Ball at={[0.47, 0.33, 0.23]} size={[0.07, 0.07, 0.04]} color={m.sage} />
        </group>
      );
    case 'vase':
      return (
        <group>
          <Ball at={[0, 0.4, 0]} size={[0.4, 0.45, 0.4]} color={m.sage} />
          <Cylinder at={[0, 0.84, 0]} radius={0.18} top={0.22} height={0.4} color={m.sage} />
          <Cylinder at={[0, 1.05, 0]} radius={0.16} height={0.012} color={m.darkWood} />
        </group>
      );
    case 'tomato':
      return (
        <group>
          <Ball size={[0.24, 0.21, 0.24]} color={m.tomato} />
          <Block at={[0, 0.21, 0]} size={[0.25, 0.025, 0.06]} color={m.curtain} />
        </group>
      );
    case 'can':
      return (
        <group>
          <Cylinder radius={0.15} height={0.4} color={m.metal} />
          <Cylinder at={[0, 0.2, 0]} radius={0.13} height={0.025} color={m.darkWood} />
        </group>
      );
  }
}
