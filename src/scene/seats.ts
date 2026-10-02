import type { Point } from './primitives';
export const SEATS: readonly { readonly at: Point; readonly rotation: number }[] = [
  { at: [-0.75, 0, 3.4], rotation: Math.PI - 0.15 },
  { at: [-4.4, 0, -0.9], rotation: 1.05 },
  { at: [3.1, 0, 0.1], rotation: -0.9 },
  { at: [2.7, 0, -2.7], rotation: -0.65 },
];
