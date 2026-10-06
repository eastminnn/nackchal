import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { authenticate, baseUrl } from './auth-fixture.mjs';

const output = process.env.NACKCHAL_ROOMS_EVIDENCE ?? '../.omo/evidence/rooms-frontend';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexts = [];
const errors = [];
const report = { scenarios: [], screenshots: [], errors };
const record = (scenario, observable) => report.scenarios.push({ scenario, observable, passed: true });
try {
  const pages = [];
  for (let index = 0; index < 5; index++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    contexts.push(context);
    await authenticate(context, `경매사${index + 1}`);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    pages.push(page);
    await page.goto(baseUrl);
    await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
    await expect(page.locator('[data-connection="connected"]')).toBeVisible();
  }
  const [host, second, third, fourth, fifth] = pages;
  await host.getByRole('button', { name: '방 만들기', exact: true }).click();
  await expect(host.locator('.hud-round')).toHaveText('1 / 4명');
  const roomName = await host.locator('h1').innerText();
  const roomId = (await host.locator('.hud-room small').innerText()).replace('#', '');
  assert.match(roomId, /^[A-Z0-9]{6}$/);
  const row = page => page.locator('.room-row').filter({ has: page.getByRole('heading', { name: roomName, exact: true }) });
  await expect(row(second)).toContainText('1 / 4');
  record('shared directory', 'second authenticated context sees host room and occupancy 1 / 4');
  const duplicate = await contexts[0].newPage();
  duplicate.on('pageerror', error => errors.push(error.message));
  await duplicate.goto(baseUrl);
  await duplicate.locator('.arrival-screen').waitFor({ state: 'hidden' });
  await row(duplicate).getByRole('button', { name: `${roomName} 입장`, exact: true }).click();
  await expect(duplicate.getByRole('alert')).toContainText('다른 탭에서 이미 방에 참여');
  await expect(duplicate.locator('.immersive-game')).toHaveCount(0);
  await expect(host.locator('.hud-round')).toHaveText('1 / 4명');
  record('duplicate account tab blocked', 'second tab remains in lobby, original host retains its one seat');
  for (const page of [second, third, fourth]) {
    await row(page).getByRole('button', { name: `${roomName} 입장`, exact: true }).click();
    await expect(page.locator('.immersive-game')).toBeVisible();
  }
  for (const page of [host, second, third, fourth]) {
    await expect(page.locator('.hud-round')).toHaveText('4 / 4명');
    await expect(page.locator('.room-participants li')).toHaveCount(4);
    await expect(page.locator('.character-name strong')).toHaveCount(4);
    await page.locator('.immersive-game[data-models-ready="true"]').waitFor();
  }
  await expect(row(fifth)).toContainText('4 / 4');
  await expect(row(fifth).getByRole('button')).toBeDisabled();
  const rejected = await fifth.evaluate(async id => {
    const url = new URL('/api/rooms/ws', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => { socket.close(); reject(new Error('join timeout')); }, 10000);
      socket.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.type === 'WELCOME') socket.send(JSON.stringify({ type: 'JOIN_ROOM', requestId: crypto.randomUUID(), roomId: id }));
        if (message.type === 'ERROR') { clearTimeout(timer); socket.close(); resolve(message.error.code); }
      };
    });
  }, roomId);
  assert.equal(rejected, 'ROOM_FULL');
  record('capacity enforced', 'all four members see four humans; fifth button disabled and direct WebSocket join returns ROOM_FULL');
  await second.getByRole('button', { name: '준비하기', exact: true }).click();
  await expect(host.locator('.room-participants li').filter({ hasText: '경매사2' })).toContainText('준비 완료');
  await expect(second.getByRole('button', { name: '준비 취소' })).toHaveAttribute('aria-pressed', 'true');
  await expect(host.getByRole('button', { name: '경매 시작하기' })).toHaveCount(0);
  record('shared ready without fake auction', 'host sees second participant ready; no start button exists');
  await second.getByLabel('채팅 메시지').fill('모두 함께 보이는 채팅');
  await second.getByRole('button', { name: '채팅 보내기' }).click();
  for (const page of [host, second, third, fourth]) {
    await expect(page.getByRole('log')).toContainText('모두 함께 보이는 채팅');
  }
  record('shared chat', 'all four authenticated pages render same accepted chat');
  for (const [width, height] of [[1440, 900], [1280, 720]]) {
    await host.setViewportSize({ width, height });
    await expect(host.locator('.character-name strong')).toHaveCount(4);
    await host.evaluate(() => document.fonts.ready);
    const path = `${output}/waiting-four-${width}x${height}.png`;
    await host.screenshot({ path, fullPage: true });
    report.screenshots.push(path);
    assert(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await second.reload();
  await second.locator('.arrival-screen').waitFor({ state: 'hidden' });
  await expect(second.locator('.hud-round')).toHaveText('4 / 4명');
  await expect(second.getByRole('button', { name: '준비하기', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(host.locator('.room-participants li').filter({ hasText: '경매사2' })).toContainText('준비 중');
  await expect(host.locator('.room-participants li')).toHaveCount(4);
  record('reload reconnect', 'same user restores the same room with ready reset and no extra seat');
  await host.getByRole('button', { name: '방 목록', exact: true }).click();
  await expect(host.locator('.immersive-game')).toHaveCount(0);
  await expect(second.locator('.hud-round')).toHaveText('3 / 4명');
  await expect(second.locator('.room-participants li').filter({ hasText: '경매사2' })).toContainText('방장');
  record('explicit leave and host transfer', 'seat released immediately; earliest remaining participant is host');
  await row(duplicate).getByRole('button', { name: `${roomName} 입장`, exact: true }).click();
  await expect(duplicate.locator('.hud-round')).toHaveText('4 / 4명');
  record('released duplicate account can join', 'same account second tab joins only after original tab explicitly leaves');
  await host.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(duplicate.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
  await expect(second.locator('.hud-round')).toHaveText('3 / 4명');
  record('logout releases room across tabs', 'duplicate tab returns to login and remaining room immediately has three seats');
  for (const page of [second, third, fourth]) await page.getByRole('button', { name: '방 목록', exact: true }).click();
  await expect(row(fifth)).toHaveCount(0);
  record('last leave deletes room', 'room no longer appears to independent fifth context');
  assert.deepEqual(errors, []);
  console.log('ROOMS PASS', JSON.stringify(report));
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
