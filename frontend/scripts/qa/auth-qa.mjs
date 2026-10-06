import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { chromium, expect } from '@playwright/test';
import { baseUrl, testPassword } from './auth-fixture.mjs';
import { verifyJwtCookies, verifyJwtRecovery } from './auth-jwt-qa.mjs';

await mkdir('.qa/auth', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = [];
try {
  for (const [width, height] of [[1280, 720], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const email = `qa-${randomUUID()}@example.test`;
    const shot = async name => {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `.qa/auth/${name}-${width}.png`, fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    };
    await page.goto(baseUrl);
    await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
    await expect(page.getByRole('heading', { name: '어서 와, 경매사.' })).toBeVisible();
    assert.equal((await context.request.get(`${baseUrl}/api/auth/me`)).status(), 401);
    await shot('login');
    assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
    await page.getByRole('button', { name: '회원가입하기' }).click();
    await shot('register');
    assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
    await page.getByLabel('닉네임', { exact: true }).fill('작은곰');
    await page.getByLabel('이메일', { exact: true }).fill(email);
    await page.getByLabel('비밀번호', { exact: true }).fill(testPassword);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('different');
    await page.getByRole('button', { name: '회원가입', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('서로 달라요');
    await shot('validation');
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(testPassword);
    await page.getByRole('button', { name: '비밀번호 보기', exact: true }).click();
    await expect(page.locator('#password')).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: '비밀번호 숨기기', exact: true }).click();
    const [registrationResponse] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/register'
        && response.request().method() === 'POST'),
      page.getByRole('button', { name: '회원가입', exact: true }).click(),
    ]);
    assert.equal(registrationResponse.status(), 201);
    await expect(page.getByRole('status')).toContainText('가입했어요');
    await expect(page.getByLabel('이메일', { exact: true })).toHaveValue(email);
    await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('');
    await shot('registered');
    await page.getByLabel('비밀번호', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('이메일이나 비밀번호');
    await shot('rejected');
    let release;
    const allowed = new Promise(resolve => { release = resolve; });
    let submissions = 0;
    await page.route('**/api/auth/login', async route => {
      submissions++;
      await allowed;
      await route.continue();
    });
    await page.getByLabel('비밀번호', { exact: true }).fill(testPassword);
    await page.getByLabel('비밀번호', { exact: true }).press('Enter');
    await expect(page.getByRole('button', { name: '잠깐만 기다려 줘…' })).toBeDisabled();
    await expect.poll(() => submissions).toBe(1);
    await shot('pending');
    release();
    await expect(page.locator('.profile-account-name')).toHaveText('작은곰');
    await page.unroute('**/api/auth/login');
    await page.locator('.lobby-backdrop[data-ready="true"]').waitFor();
    await shot('lobby');
    assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
    const me = await (await context.request.get(`${baseUrl}/api/auth/me`)).json();
    await page.reload();
    await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
    await expect(page.locator('.profile-account-name')).toHaveText('작은곰');
    assert.equal((await (await context.request.get(`${baseUrl}/api/auth/me`)).json()).id, me.id);
    await verifyJwtCookies(context, page);
    await verifyJwtRecovery(context, page);
    await page.getByRole('button', { name: '방 만들기', exact: true }).click();
    await expect(page.locator('.character-name strong')).toHaveText('작은곰');
    await expect(page.getByRole('button', { name: '경매 시작하기' })).toBeDisabled();
    await expect(page.locator('.hud-round')).toHaveText('1 / 4명');
    await page.getByLabel('채팅 메시지').fill('로그인한 내 이름');
    await page.getByRole('button', { name: '채팅 보내기' }).click();
    await expect(page.locator('.character-speech')).toHaveText('로그인한 내 이름');
    await shot('room');
    await page.getByRole('button', { name: '방 목록', exact: true }).click();
    const other = await context.newPage();
    await other.goto(baseUrl);
    await other.locator('.arrival-screen').waitFor({ state: 'hidden' });
    await expect(other.locator('.profile-account-name')).toHaveText('작은곰');
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    await expect(other.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    assert.equal((await context.request.get(`${baseUrl}/api/auth/me`)).status(), 401);
    assert.equal((await context.cookies()).some(cookie =>
      ['NACKCHAL_ACCESS', 'NACKCHAL_REFRESH'].includes(cookie.name)), false);
    await other.close();
    await shot('logout');
    await page.getByLabel('이메일', { exact: true }).fill(email);
    await page.getByLabel('비밀번호', { exact: true }).fill(testPassword);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.locator('.room-row').filter({ hasText: '작은곰의 경매장' })).toHaveCount(0);
    await expect(page.locator('.profile-account-name')).toHaveText('작은곰');
    await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }));
    await page.route('**/api/auth/refresh', route => route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    await shot('expired');
    await page.unroute('**/api/auth/me');
    await page.unroute('**/api/auth/refresh');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.locator('.profile-account-name')).toHaveText('작은곰');
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    await page.route('**/api/auth/me', route => route.abort());
    await page.reload();
    await page.locator('.arrival-screen').waitFor({ state: 'hidden' });
    await expect(page.getByRole('button', { name: '다시 연결하기' })).toBeVisible();
    await shot('offline');
    assert.deepEqual((await new AxeBuilder({ page }).analyze()).violations, []);
    await page.unroute('**/api/auth/me');
    await page.getByRole('button', { name: '다시 연결하기' }).click();
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByLabel('이메일', { exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('비밀번호', { exact: true })).toBeFocused();
    assert.notEqual(await page.locator(':focus').evaluate(node => getComputedStyle(node).outlineStyle), 'none');
    await shot('focus-reduced');
    assert.deepEqual(errors, []);
    report.push({ width, height, registration: true, jwtRefresh: true, concurrentRefresh: true,
      httpOnlyTokens: true, refreshOutageRecovery: true, crossTabLogout: true,
      roomIdentity: true, expiredCredentials: true, offlineRecovery: true, errors, axeViolations: 0 });
    await context.close();
  }
  console.log('AUTH PASS', report);
} finally {
  await writeFile('.qa/auth/report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
