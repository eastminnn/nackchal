import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { authenticate, baseUrl } from './auth-fixture.mjs';

await mkdir('.qa/desktop', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
try {
  for (const [width, height] of [[1280,720], [1440,900], [1920,1080]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await authenticate(context);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseUrl);
    await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
    await expect(page.locator('[data-connection="connected"]')).toBeVisible();
    await expect(page.locator('.room-list')).toBeVisible();
    await expect(page.locator('.profile-account-name')).toHaveText('동민');
    await page.getByRole('button', { name: '방 만들기', exact: true }).click();
    const roomId = (await page.locator('.hud-room small').innerText()).replace('#', '');
    const waiting = page.getByRole('button', { name: '경매 시작하기' });
    await expect(waiting).toBeDisabled();
    await expect(page.getByRole('button', { name: '준비하기', exact: true })).toHaveCount(0);
    await expect(page.locator('.character-label')).toHaveCount(1);
    await expect(page.locator('.character-name strong')).toHaveText('동민');
    await expect(page.locator('.character-name')).toBeVisible();
    const initialName = await page.locator('.character-name').boundingBox();
    await expect(page.locator('.round-counter')).toHaveText('1 / 4명');
    assert.equal(await page.locator('.site-header,.site-footer,.players,.hud-bidding,.hud-items').count(), 0);
    const bounds = await page.locator('.room-canvas canvas').boundingBox();
    assert.deepEqual(bounds, { x:0, y:0, width, height });
    assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '.qa/desktop/waiting-' + width + '.png' });
    const waitingAxe = await new AxeBuilder({ page }).analyze();
    await page.getByRole('textbox', { name: '채팅 메시지' }).fill('함께할 준비 완료');
    await page.getByRole('button', { name: '채팅 보내기' }).click();
    await expect(page.getByRole('log', { name: '채팅 기록' })).toContainText('함께할 준비 완료');
    await expect(page.locator('.character-speech')).toHaveText('함께할 준비 완료');
    await expect.poll(async () => {
      const speakingName = await page.locator('.character-name').boundingBox();
      return initialName && speakingName
        ? Math.max(Math.abs(initialName.x - speakingName.x), Math.abs(initialName.y - speakingName.y))
        : Infinity;
    }, { message: 'Adding a bubble keeps the name anchored above the head' }).toBeLessThan(2);
    await page.screenshot({ path: '.qa/desktop/chat-' + width + '.png' });
    await page.waitForTimeout(7100);
    await expect(waiting).toBeDisabled();
    await expect(page.getByRole('button', { name: '준비하기', exact: true })).toHaveCount(0);
    await expect(page.locator('.character-label')).toHaveCount(1);
    await expect(page.locator('.character-speech')).toHaveCount(0);
    await expect.poll(async () => {
      const settledName = await page.locator('.character-name').boundingBox();
      return initialName && settledName ? Math.max(Math.abs(initialName.x - settledName.x), Math.abs(initialName.y - settledName.y)) : Infinity;
    }, { message: 'The idle name stays in the same place before and after chat' }).toBeLessThan(2);
    await expect(page.locator('.chat-log p')).toHaveCount(1);
    await expect(page.locator('.room-status')).toHaveAttribute('data-paddle-player', '');
    assert.equal(await page.locator('.hud-lot,.hud-reveal,.result-title').count(), 0);
    const chatAxe = await new AxeBuilder({ page }).analyze();
    await page.getByRole('button', { name: '방 목록', exact: true }).click();
    await expect(page.locator('.profile-account-name')).toHaveText('동민');
    await expect(page.locator('.room-row').filter({ hasText: `#${roomId}` })).toHaveCount(0);
    await page.locator('.directory-loadout summary').click();
    await page.getByRole('button', { name: '1번 토마토 장착 해제' }).click();
    await page.getByRole('button', { name: /토마토 보유 .*장착/ }).click();
    await page.locator('.directory-loadout summary').click();
    await page.getByRole('button', { name: '방 만들기', exact: true }).click();
    await expect(waiting).toBeDisabled();
    await expect(page.getByRole('button', { name: '준비하기', exact: true })).toHaveCount(0);
    await expect(page.locator('.round-counter')).toHaveText('1 / 4명');
    await expect(page.locator('.character-label')).toHaveCount(1);
    await expect(page.locator('.chat-log')).not.toContainText('함께할 준비 완료');
    await page.getByRole('button', { name: '방 목록', exact: true }).click();
    const violations = [...waitingAxe.violations, ...chatAxe.violations];
    report.push({ width, height, bounds, errors, violations, soloWaitMilliseconds: 7100 });
    console.log('WAITING ROOM', width, height, errors, violations.map(v => v.id));
    assert.deepEqual(errors, []);
    assert.deepEqual(violations, []);
    await context.close();
  }
} finally {
  await writeFile('.qa/desktop/report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
