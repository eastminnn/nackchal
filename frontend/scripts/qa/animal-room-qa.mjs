import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { authenticate, baseUrl } from './auth-fixture.mjs';

await mkdir('.qa/animals', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
try {
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height }, ...(width === 1280 ? { recordVideo: { dir: '.qa/animals/video', size: { width, height } } } : {}) });
    const page = await context.newPage();
    await authenticate(context);
    const errors = [];
    const failures = [];
    const models = new Set();
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().endsWith('.glb')) {
        models.add(new URL(response.url()).pathname);
        if (!response.ok()) failures.push(response.status());
      }
    });
    await page.goto(baseUrl);
    await page.locator('.arrival-screen').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `.qa/animals/intro-${width}.png` });
    await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
    await page.locator('.lobby-backdrop[data-ready="true"]').waitFor({ timeout: 30000 });
    await page.locator('.profile-character img').evaluate(image => image.decode());
    await page.screenshot({ path: `.qa/animals/lobby-${width}.png`, fullPage: true });
    const canvas = page.locator('.lobby-backdrop canvas');
    const first = await canvas.screenshot();
    const start = await page.evaluate(() => performance.now());
    await page.waitForFunction(start => performance.now() - start > 1200, start);
    const second = await canvas.screenshot();
    assert.equal(first.equals(second), false, 'Background camera should move');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.lobby-backdrop[data-moving="false"]').waitFor();
    await page.screenshot({ path: `.qa/animals/reduced-${width}.png`, fullPage: true });
    const stillA = await canvas.screenshot();
    const stillB = await canvas.screenshot();
    assert.equal(stillA.equals(stillB), true, 'Reduced motion should freeze the scene');
    const lobbyAxe = await new AxeBuilder({ page }).analyze();
    await expect(page.locator('.profile-account-name')).toHaveText('동민');
    await page.getByRole('button', { name: '방 만들기', exact: true }).click();
    await expect(page.getByRole('button', { name: '준비하기', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '경매 시작하기' })).toHaveCount(0);
    assert.equal(await page.locator('.lobby-backdrop').count(), 0);
    await page.locator('.immersive-game[data-models-ready="true"]').waitFor();
    await page.screenshot({ path: `.qa/animals/room-${width}.png` });
    await expect(page.locator('.character-label')).toHaveCount(1);
    await expect(page.locator('.character-name strong')).toHaveText('동민');
    const gameAxe = await new AxeBuilder({ page }).analyze();
    assert.deepEqual([...models].filter(path => path.includes('/animals/')), ['/models/animals/plush-bear.glb']);
    assert.ok([...models].filter(path => path.includes('/bakery/')).length >= 10);
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    const violations = [...lobbyAxe.violations, ...gameAxe.violations].map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
    report.push({ width, height, errors, failures, models: [...models], violations });
    console.log('ANIMALS', width, JSON.stringify(violations));
    await page.getByRole('button', { name: '방 목록', exact: true }).click();
    await context.close();
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await authenticate(page.context(), '빠른입장');
  let releaseModels;
  const modelsAllowed = new Promise(resolve => { releaseModels = resolve; });
  await page.route('**/*.glb', async route => { await modelsAllowed; await route.continue(); });
  await page.goto(baseUrl);
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click();
  await expect(page.locator('.profile-account-name')).toHaveText('빠른입장');
  await page.getByRole('button', { name: '방 만들기', exact: true }).click();
  await expect(page.getByRole('button', { name: '준비하기', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '경매 시작하기' })).toHaveCount(0);
  releaseModels();
  await page.locator('.immersive-game[data-models-ready="true"]').waitFor();
  await expect(page.getByRole('button', { name: '준비하기', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '경매 시작하기' })).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
  await page.locator('.immersive-game[data-models-ready="true"]').waitFor();
  await expect(page.locator('.character-name strong')).toHaveText('빠른입장');
  await expect(page.locator('.hud-round')).toHaveText('1 / 4명');
  await page.getByRole('button', { name: '준비하기', exact: true }).waitFor();
  await page.getByRole('button', { name: '방 목록', exact: true }).click();
  await page.locator('.lobby-backdrop[data-ready="true"][data-moving="false"]').waitFor();
  console.log('PASS skip intro, enter before models arrive, reduced-motion startup');
  await page.close();
} finally {
  await writeFile('.qa/animals/report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
assert.ok(report.every(result => result.violations.length === 0));
