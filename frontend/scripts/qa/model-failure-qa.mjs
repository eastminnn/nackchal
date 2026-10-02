import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
await mkdir('.qa/models', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route('**/models/animals/plush-bear.glb', route => route.abort());
  await page.goto('http://127.0.0.1:4185/');
  await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
  await page.getByLabel('오늘의 경매사 이름').fill('연결검증');
  await page.getByRole('button', { name: '방 만들기', exact: true }).click();
  await page.getByRole('button', { name: '모델 다시 불러오기' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '모델 불러오는 중…' }).isDisabled(), true);
  await page.screenshot({ path: '.qa/models/model-failure.png', fullPage: true });
  await page.unroute('**/models/animals/plush-bear.glb');
  await page.getByRole('button', { name: '모델 다시 불러오기' }).click();
  await expect(page.getByRole('button', { name: '참가자를 기다리는 중' })).toBeDisabled();
  await expect(page.locator('.character-label')).toHaveCount(1);
  assert.equal(await page.locator('.room-canvas canvas').count(), 1);
  await page.screenshot({ path: '.qa/models/model-recovered.png', fullPage: true });
  console.log('PASS failed model blocks start, retry recovers inside same room');
} finally { await browser.close(); }
