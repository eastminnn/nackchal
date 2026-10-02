import { useEffect, useMemo } from 'react';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const materials = {
  oak: '#b88858',
  wood: '#d9b58a',
  darkWood: '#694d37',
  sage: '#789a79',
  curtain: '#507b65',
  rug: '#dfb97c',
  cream: '#fff3db',
  ink: '#34382f',
  tomato: '#cb4b32',
  metal: '#a9b7ac',
};
export type Point = [number, number, number];
interface ShapeProps {
  readonly at?: Point;
  readonly size?: Point;
  readonly color?: string;
  readonly rotation?: Point;
}
export function Block({
  at = [0, 0, 0],
  size = [1, 1, 1],
  color = materials.wood,
  rotation = [0, 0, 0],
}: ShapeProps) {
  return (
    <mesh position={at} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}
export function SoftBox({
  at = [0, 0, 0],
  size = [1, 1, 1],
  color = materials.wood,
  rotation = [0, 0, 0],
}: ShapeProps) {
  const [x, y, z] = size;
  const geometry = useMemo(() => new RoundedBoxGeometry(x, y, z, 3, Math.min(x, y, z) * 0.16), [x, y, z]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={at} rotation={rotation} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}
export function Ball({
  at = [0, 0, 0],
  size = [1, 1, 1],
  color = materials.cream,
  rotation = [0, 0, 0],
}: ShapeProps) {
  return (
    <mesh position={at} scale={size} rotation={rotation} castShadow>
      <sphereGeometry args={[1, 20, 14]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}
export function Cylinder({
  at = [0, 0, 0],
  radius = 0.5,
  top = radius,
  height = 1,
  color = materials.wood,
  rotation = [0, 0, 0],
}: {
  readonly at?: Point;
  readonly radius?: number;
  readonly top?: number;
  readonly height?: number;
  readonly color?: string;
  readonly rotation?: Point;
}) {
  return (
    <mesh position={at} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[top, radius, height, 32]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}
