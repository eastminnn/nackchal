import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { authenticate, baseUrl } from './auth-fixture.mjs';

// 두 계정이 실제 서버에서 경매를 시작해 입찰·낙찰·가치 공개·다음 라운드를 거친 뒤, 한 명이 나가 게임이 중단되는지 확인한다.
const output = process.env.NACKCHAL_AUCTION_EVIDENCE ?? '../.omo/evidence/auction-frontend';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexts = [];
const errors = [];
const report = { scenarios: [], screenshots: [], errors };
const record = (scenario, observable) => report.scenarios.push({ scenario, observable, passed: true });
const shot = async (page, name) => {
  const path = `${output}/${name}.png`;
  await page.screenshot({ path });
  report.screenshots.push(path);
};
try {
  const pages = [];
  for (const nickname of ['경매방장', '경매손님', '구경꾼']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    contexts.push(context);
    await authenticate(context, nickname);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    pages.push(page);
    await page.goto(baseUrl);
    await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
    await expect(page.locator('[data-connection="connected"]')).toBeVisible();
  }
  const [host, guest, watcher] = pages;
  await host.getByRole('button', { name: '방 만들기', exact: true }).click();
  await expect(host.locator('.hud-round')).toHaveText('1 / 4명');
  const roomName = await host.locator('h1').innerText();
  const roomId = (await host.locator('.hud-room small').innerText()).replace('#', '');
  const row = page => page.locator('.room-row').filter({ hasText: `#${roomId}` });
  await row(guest).getByRole('button', { name: `${roomName} 입장`, exact: true }).click();
  await expect(host.locator('.hud-round')).toHaveText('2 / 4명');
  const start = host.getByRole('button', { name: '경매 시작하기' });
  await expect(start).toBeDisabled();
  await guest.getByRole('button', { name: '준비하기', exact: true }).click();
  await expect(start).toBeEnabled();
  await start.click();
  for (const page of [host, guest]) {
    await expect(page.locator('.round-counter')).toHaveText('01 / 10');
    await expect(page.getByRole('timer')).toBeVisible();
    await expect(page.locator('.hud-wallet')).toContainText('100');
  }
  await expect(row(watcher)).toContainText('경매 중');
  await expect(row(watcher).getByRole('button')).toBeDisabled();
  record('host starts game', 'both players see round 01 with $100; lobby shows the room as 경매 중');

  await guest.getByRole('button', { name: '5달러 입찰', exact: true }).click();
  await expect(host.locator('.hud-leader')).toHaveText('경매손님');
  await expect(host.locator('.current-price')).toContainText('5');
  await expect(guest.getByRole('button', { name: '6달러 입찰', exact: true })).toBeDisabled();
  await host.getByRole('button', { name: '6달러 입찰', exact: true }).click();
  await expect(guest.locator('.hud-leader')).toHaveText('경매방장');
  await expect(guest.locator('.current-price')).toContainText('6');
  await shot(guest, 'bidding');
  record('bids broadcast', 'each accepted bid updates price and leader on the other page; leader cannot outbid self');

  await expect(host.locator('.room-sold')).toHaveText('낙찰!', { timeout: 30_000 });
  await expect(host.locator('.hud-wallet')).toContainText('94');
  await expect(host.locator('.hud-reveal')).toHaveCount(0);
  await expect(guest.locator('.hud-reveal')).toContainText('실제 가치', { timeout: 10_000 });
  await expect(guest.locator('.hud-reveal')).toContainText('경매방장 낙찰가 $6');
  await shot(guest, 'reveal');
  record('sold then reveal', 'winner is charged at sale; value appears only after the 5 second reveal delay');
  await expect(host.locator('.round-counter')).toHaveText('02 / 10', { timeout: 10_000 });
  record('next round', 'round 02 starts automatically after the reveal');

  await guest.getByRole('button', { name: '방 목록', exact: true }).click();
  await expect(host.getByRole('complementary', { name: '지난 게임 결과' })).toContainText('게임이 중단됐어요');
  await expect(host.getByRole('button', { name: '경매 시작하기' })).toBeDisabled();
  await shot(host, 'aborted');
  await host.getByRole('button', { name: '결과 닫기' }).click();
  await expect(host.getByRole('complementary', { name: '지난 게임 결과' })).toHaveCount(0);
  await expect(row(watcher)).toContainText('입장 가능');
  record('leave aborts game', 'remaining host sees an aborted result and the room becomes joinable again');
  assert.deepEqual(errors, []);
  console.log('AUCTION PASS', JSON.stringify(report));
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await Promise.all(contexts.map(context => context.close()));
  await browser.close();
}
