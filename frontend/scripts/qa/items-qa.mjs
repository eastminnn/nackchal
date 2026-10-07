import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { authenticate, baseUrl } from './auth-fixture.mjs';

// 로컬 Docker Compose 전용: 새 계정에 시험용 캐시를 SQL로 넣은 뒤 상점에서 사고, 게임 중 상대에게 던진다.
// 운영 DB에는 실행하지 않는다.
const out = process.env.NACKCHAL_ITEMS_EVIDENCE ?? '.qa/items';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const pages = [];
const tag = Date.now().toString(36).slice(-4);
for (const name of [`던짐${tag}`, `맞음${tag}`]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await authenticate(context, name);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  await page.goto(baseUrl);
  await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
  await expect(page.locator('[data-connection="connected"]')).toBeVisible();
  pages.push(page);
}
const [host, guest] = pages;
// 로컬 개발 DB에서만 시험용 캐시를 넣는다.
execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'nackchal', '-d', 'nackchal', '-c',
  `UPDATE wallets SET balance = 20 WHERE user_id = (SELECT id FROM users WHERE nickname = '던짐${tag}')`], {
  cwd: new URL('../../..', import.meta.url),
});
await host.reload();
await expect(host.locator('[data-connection="connected"]')).toBeVisible();
await host.getByRole('button', { name: '장난 상점' }).click();
await host.getByRole('button', { name: '토마토 하나 더' }).click();
await host.screenshot({ path: `${out}/shop.png` });
await host.getByRole('button', { name: '6캐시에 사기' }).click();
await expect(host.getByText('토마토 2개를 샀어요.')).toBeVisible();
await expect(host.locator('.site-header .cash')).toContainText('14');
await host.keyboard.press('Escape');
await host.getByRole('button', { name: '방 만들기', exact: true }).click();
const roomId = (await host.locator('.hud-room small').innerText()).replace('#', '');
const roomName = await host.locator('h1').innerText();
await guest.locator('.room-row').filter({ hasText: `#${roomId}` }).getByRole('button', { name: `${roomName} 입장` }).click();
// 산 아이템은 대기실에서도 보이고, 경매가 시작되기 전에는 던질 수 없다.
await expect(host.getByRole('button', { name: /^토마토 선택, 2개 보유/ })).toBeDisabled();
await expect(host.locator('.hud-items-left')).toHaveText('경매가 시작되면 던질 수 있어요');
await host.screenshot({ path: `${out}/waiting-items.png` });
await guest.getByRole('button', { name: '준비하기', exact: true }).click();
await host.getByRole('button', { name: '경매 시작하기' }).click();
await expect(host.locator('.round-counter')).toHaveText('01 / 10');
await host.waitForTimeout(2500);
await host.getByRole('button', { name: /^토마토 선택/ }).click();
await host.screenshot({ path: `${out}/targeting.png` });
await host.getByRole('button', { name: `맞음${tag}에게 던지기` }).click();
await guest.waitForTimeout(700);
await guest.screenshot({ path: `${out}/hit-guest.png` });
await host.waitForTimeout(300);
await host.screenshot({ path: `${out}/hit-host.png` });
await expect(host.getByRole('button', { name: /^토마토 선택, 1개 보유/ })).toBeVisible();
await expect(host.locator('.hud-items-left')).toHaveText('이번 판 2/3');
console.log('ITEMS PASS');
await browser.close();
