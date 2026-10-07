import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { baseUrl, testPassword } from './auth-fixture.mjs';

await mkdir('.qa/avatar', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const email = `qa-${randomUUID()}@example.test`;

  // 가입하면서 고양이를 고르면 왼쪽 인형도 고양이로 바뀐다.
  await page.goto(baseUrl);
  await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '회원가입하기' }).click();
  await expect(page.getByRole('radio', { name: '곰' })).toBeChecked();
  await page.getByLabel('닉네임').fill('고양이손님');
  await page.getByRole('radio', { name: '고양이' }).check({ force: true });
  await expect(page.locator('.auth-character img')).toHaveAttribute('src', '/art/residents/plush-cat.webp');
  await page.getByLabel('이메일').fill(email);
  await page.locator('#password').fill(testPassword);
  await page.locator('#confirm-password').fill(testPassword);
  await page.screenshot({ path: '.qa/avatar/signup.png' });
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await page.getByText('가입했어요!').waitFor();
  await page.locator('#password').fill(testPassword);
  await page.getByRole('button', { name: '로그인', exact: true }).click();

  // 로비의 내 자리에 고른 캐릭터가 보이고, 바꾸면 다른 탭에도 반영된다.
  const portrait = page.locator('.profile-character img');
  await expect(portrait).toHaveAttribute('src', '/art/residents/plush-cat.webp');
  await expect(page.locator('[data-connection="connected"]')).toBeVisible();
  const other = await context.newPage();
  await other.goto(baseUrl);
  await expect(other.locator('.profile-character img')).toHaveAttribute('src', '/art/residents/plush-cat.webp');
  await page.getByRole('button', { name: '캐릭터 바꾸기' }).click();
  await page.locator('.character-option').filter({ hasText: '강아지' }).click();
  await expect(portrait).toHaveAttribute('src', '/art/residents/plush-dog.webp');
  await page.screenshot({ path: '.qa/avatar/lobby-picker.png' });
  await expect(other.locator('.profile-character img')).toHaveAttribute('src', '/art/residents/plush-dog.webp');
  await other.close();
  await page.getByRole('button', { name: '다 골랐어요' }).click();

  // 방 안에서는 서버가 바꾸기를 거절한다.
  await page.getByRole('button', { name: '방 만들기', exact: true }).click();
  await expect(page.locator('.hud-round')).toHaveText('1 / 4명');
  const csrf = await (await page.request.get(`${baseUrl}/api/auth/csrf`)).json();
  const locked = await page.request.patch(`${baseUrl}/api/users/me/avatar`, {
    headers: { [csrf.headerName]: csrf.token },
    data: { avatarCode: 'plush-bunny' },
  });
  assert.equal(locked.status(), 409);
  assert.equal((await locked.json()).code, 'PROFILE_LOCKED_IN_ROOM');
  const me = await (await page.request.get(`${baseUrl}/api/auth/me`)).json();
  assert.equal(me.avatarCode, 'plush-dog');
  assert.deepEqual(errors, []);
  console.log('avatar QA passed');
} finally {
  await browser.close();
}
