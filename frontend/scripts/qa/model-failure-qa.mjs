import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { authenticate, baseUrl } from './auth-fixture.mjs';
await mkdir('.qa/models', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await authenticate(page.context(), '연결검증');
  await page.route('**/models/animals/plush-bear.glb', route => route.abort());
  await page.goto(baseUrl);
  await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
  await expect(page.locator('.profile-account-name')).toHaveText('연결검증');
  await page.getByRole('button', { name: '방 만들기', exact: true }).click();
  await page.getByRole('button', { name: '모델 다시 불러오기' }).waitFor();
  await expect(page.getByRole('button', { name: '경매 시작하기' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '준비하기', exact: true })).toHaveCount(0);
  await page.screenshot({ path: '.qa/models/model-failure.png', fullPage: true });
  await page.unroute('**/models/animals/plush-bear.glb');
  await page.getByRole('button', { name: '모델 다시 불러오기' }).click();
  await expect(page.getByRole('button', { name: '경매 시작하기' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '준비하기', exact: true })).toHaveCount(0);
  await expect(page.locator('.character-label')).toHaveCount(1);
  await page.locator('.immersive-game[data-models-ready="true"]').waitFor();
  assert.equal(await page.locator('.room-canvas canvas').count(), 1);
  await page.screenshot({ path: '.qa/models/model-recovered.png', fullPage: true });
  await page.getByRole('button', { name: '방 목록', exact: true }).click();
  console.log('PASS failed model keeps room controls usable, retry recovers without enabling auction');
} finally { await browser.close(); }
