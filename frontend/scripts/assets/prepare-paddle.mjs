import { readFile, mkdir } from 'node:fs/promises';
import { Document, NodeIO } from '@gltf-transform/core';
import { CircleGeometry } from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/assets/prepare-paddle.mjs <Paddle_0.stl>');
const bytes = await readFile(source);
const geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
geometry.computeBoundingBox();
const box = geometry.boundingBox;
const centerX = (box.min.x + box.max.x) / 2;
geometry.translate(-centerX, -box.min.y - 24, -2);
geometry.scale(0.0115, 0.0115, 0.0115);
geometry.computeVertexNormals();
const document = new Document();
const buffer = document.createBuffer();
const scene = document.createScene();
const wood = document.createMaterial('Walnut handle').setBaseColorFactor([0.38, 0.19, 0.12, 1]).setMetallicFactor(0).setRoughnessFactor(0.9);
const paper = document.createMaterial('Cream face').setBaseColorFactor([0.96, 0.87, 0.72, 1]).setMetallicFactor(0).setRoughnessFactor(0.95);
const pieces = [{ name: 'Original jumimo paddle', geometry, material: wood }];
for (const side of [1, -1]) {
  const face = new CircleGeometry(0.315, 64).toNonIndexed();
  if (side < 0) face.rotateY(Math.PI);
  face.translate(0, (140 - 30 - 24) * 0.0115, side * 0.026);
  pieces.push({ name: `Number face ${side}`, geometry: face, material: paper });
}
for (const piece of pieces) {
  const primitive = document.createPrimitive().setMaterial(piece.material);
  for (const [attribute, semantic] of [['position', 'POSITION'], ['normal', 'NORMAL']]) {
    primitive.setAttribute(semantic, document.createAccessor().setType('VEC3').setArray(piece.geometry.attributes[attribute].array).setBuffer(buffer));
  }
  const mesh = document.createMesh(piece.name).addPrimitive(primitive);
  scene.addChild(document.createNode(piece.name).setMesh(mesh));
}
await mkdir('public/models/props', { recursive: true });
await new NodeIO().write('public/models/props/auction-paddle.glb', document);
console.log('Converted jumimo paddle with cream number faces');
