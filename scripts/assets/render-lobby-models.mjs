import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const imports = { imports: {
  three: '/three/build/three.module.js',
  'three/addons/': '/three/examples/jsm/',
} };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<script type="importmap">${JSON.stringify(imports)}</script>`);
    return;
  }
  const path = url.pathname.startsWith('/three/')
    ? `node_modules/three/${url.pathname.slice(7)}`
    : `public${url.pathname}`;
  if (url.pathname.includes('..')) { response.writeHead(400).end(); return; }
  try {
    response.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    response.end(await readFile(path));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await mkdir('public/art/residents', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (const name of ['plush-bear', 'plush-bunny', 'plush-cat', 'plush-dog', 'plush-lobby']) {
    const data = await page.evaluate(async name => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const hero = name === 'plush-lobby';
      const loader = new GLTFLoader();
      const asset = await loader.loadAsync(`/models/animals/${hero ? 'plush-bear' : name}.glb`);
      const scene = new THREE.Scene();
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(600, 680);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0, 0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      const model = asset.scene;
      model.updateMatrixWorld(true);
      for (const side of ['L', 'R']) {
        const bone = model.getObjectByName(`${side}Arm1`);
        const child = model.getObjectByName(`${side}Arm2`);
        if (!bone || !child) throw new Error(`Missing plush arm: ${name}`);
        const from = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
        const to = new THREE.Vector3(side === 'L' ? 0.45 : -0.45, -1, 0.1).normalize();
        const world = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromUnitVectors(from, to));
        bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
        model.updateMatrixWorld(true);
      }
      model.rotation.y = hero ? -0.14 : 0;
      model.traverse(object => {
        if (object.isMesh) { object.castShadow = true; object.frustumCulled = false; }
      });
      const subject = new THREE.Group();
      subject.add(model);
      scene.add(subject);
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model, true);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const half = hero ? size.y * 0.56 : size.y * 0.37;
      if (!hero) center.y += size.y * 0.18;
      const camera = new THREE.OrthographicCamera(-half * 600 / 680, half * 600 / 680, half, -half, 0.1, 100);
      camera.position.set(center.x + size.x * 0.06, center.y + size.y * 0.03, center.z + 7);
      camera.lookAt(center);
      scene.add(new THREE.HemisphereLight('#fff8ee', '#c5b1a1', 2.0));
      const light = new THREE.DirectionalLight('#fff6ed', 2.5);
      light.position.set(-3, 7, 5);
      scene.add(light);
      renderer.render(scene, camera);
      const image = renderer.domElement.toDataURL('image/webp', 0.94);
      renderer.dispose();
      return image;
    }, name);
    await writeFile(`public/art/residents/${name.toLowerCase()}.webp`, Buffer.from(data.split(',')[1], 'base64'));
    console.log(`Rendered ${name}`);
  }
} finally {
  await browser.close();
  server.close();
}
