import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const [bakeryPath] = process.argv.slice(2);
if (!bakeryPath) throw new Error('Usage: node scripts/assets/prepare-animal-room.mjs <Bakery pack folder>');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await mkdir('public/models/bakery', { recursive: true });
const furnishings = [
  'chair', 'floor_wood', 'rug', 'table_round_A', 'counter_table',
  'wall_modular_panelled_bakery_straight_A', 'wall_modular_panelled_bakery_window_large_A',
  'window_large_modular', 'curtains', 'wall_shelf_bakery_A',
  'countertop_closet_A_large', 'display_case_long', 'coffee_machine', 'cookie_jar',
  'pastry_stand_A_decorated', 'mug_B',
];
for (const name of furnishings) {
  const document = await io.read(resolve(bakeryPath, 'Assets/gltf', `${name}.gltf`));
  await io.write(`public/models/bakery/${name}.glb`, document);
}
await copyFile(resolve(bakeryPath, 'License.txt'), 'public/models/licenses/Tiny-Treats-Bakery.txt');
console.log(`Prepared ${furnishings.length} bakery models`);
