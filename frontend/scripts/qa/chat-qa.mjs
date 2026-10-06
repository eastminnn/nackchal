import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { authenticate, baseUrl } from './auth-fixture.mjs';

await mkdir('.qa/chat', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
    const page = await context.newPage();
    await authenticate(context);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseUrl);
    await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
    await expect(page.locator('.profile-account-name')).toHaveText('동민');
    await page.getByRole('button', { name: '방 만들기', exact: true }).click();
    await page.getByRole('button', { name: '경매 시작하기' }).waitFor();
    await expect(page.locator('.character-name')).toHaveCount(1);
    await expect(page.locator('.character-label').first()).toBeVisible();
    assert.deepEqual(await page.locator('.character-name strong').allTextContents(), ['동민']);
    const composer = page.getByRole('textbox', { name: '채팅 메시지' });
    const send = page.getByRole('button', { name: '채팅 보내기' });
    const log = page.getByRole('log', { name: '채팅 기록' });
    const bubble = page.locator('.character-label[data-player-id="me"] .character-speech');
    const speak = async body => { await composer.fill(body); await send.click(); await expect(composer).toBeEnabled(); };
    await composer.fill('한글 조합 중');
    await composer.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
    await expect(composer).toHaveValue('한글 조합 중');
    await expect(bubble).toHaveCount(0);
    await speak('안녕! 오늘은 좋은 물건 건져보자');
    await expect(bubble).toHaveText('안녕! 오늘은 좋은 물건 건져보자');
    await expect(composer).toHaveValue('');
    await speak('너무 빠른 두 번째 메시지');
    await expect(page.locator('.hud-feedback')).not.toBeEmpty();
    await expect(composer).toHaveValue('너무 빠른 두 번째 메시지');
    await expect(bubble).toHaveText('안녕! 오늘은 좋은 물건 건져보자');
    await page.waitForTimeout(1000);
    const longMessage = '가나다라마바사아자차카타파하'.repeat(7).slice(0, 98) + '!!';
    await speak(longMessage);
    await expect(bubble).toHaveText(longMessage);
    assert.equal(await page.locator('.character-speech').count(), 1);
    const layouts = [];
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(160);
      const labels = await page.locator('.character-label').evaluateAll(nodes => nodes.map(node => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { id: node.dataset.playerId, x, y, width, height, visible: getComputedStyle(node).visibility };
      }));
      for (const rect of labels) {
        assert.equal(rect.visible, 'visible');
        assert(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
      }
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j];
        assert(a.x >= b.x + b.width || a.x + a.width <= b.x || a.y >= b.y + b.height || a.y + a.height <= b.y, `overlapping labels: ${a.id}, ${b.id}`);
      }
      assert(await page.locator('.hud-chat').evaluate(node => node.clientWidth >= 318 && node.clientHeight >= 258));
      assert(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `.qa/chat/${reducedMotion}-${width}.png` });
      layouts.push({ width, height, labels });
    }
    await page.waitForTimeout(7000);
    await expect(bubble).toHaveCount(0);
    await expect(log).toContainText(longMessage);
    await speak('<b>채팅은 글자로 보여요</b>');
    await expect(bubble).toHaveText('<b>채팅은 글자로 보여요</b>');
    assert.equal(await bubble.locator('b').count(), 0);
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(1050);
      await speak(`채팅 기록 ${i + 1} — 지난 메시지도 읽을 수 있어요`);
    }
    assert(await log.evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight < 3));
    await log.hover();
    await page.mouse.wheel(0, -2000);
    await expect.poll(() => log.evaluate(node => node.scrollTop)).toBe(0);
    await page.waitForTimeout(1100);
    await speak('읽던 위치는 그대로');
    assert.equal(await log.evaluate(node => node.scrollTop), 0);
    assert.equal(await log.locator('p').count(), 16);
    await composer.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: '최신 메시지로' })).toBeFocused();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    assert(await log.evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight < 3));
    await page.keyboard.press('PageUp');
    await page.waitForTimeout(300);
    assert(await log.evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight > 32));
    await page.keyboard.press('Enter');
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    assert.deepEqual(violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) })), []);
    await page.waitForTimeout(60000);
    await expect(page.getByRole('button', { name: '경매 시작하기' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '준비하기', exact: true })).toHaveCount(0);
    await expect(page.locator('.character-name')).toHaveCount(1);
    await expect(log.locator('p')).toHaveCount(16);
    await expect(page.locator('.character-speech')).toHaveCount(0);
    await speak('친구들과 함께할 준비 중');
    await page.screenshot({ path: `.qa/chat/${reducedMotion}-waiting.png` });
    await page.getByRole('button', { name: '방 목록', exact: true }).click();
    await expect(page.locator('.character-labels')).toHaveCount(0);
    assert.deepEqual(errors, []);
    report.push({ reducedMotion, layouts, errors, violations });
    console.log('CHAT', reducedMotion, errors);
    await context.close();
  }
} finally {
  await writeFile('.qa/chat/report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
