import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { baseUrl } from './auth-fixture.mjs';

export async function verifyJwtCookies(context, page) {
  const cookies = await context.cookies();
  const access = cookies.find(cookie => cookie.name === 'NACKCHAL_ACCESS');
  const refresh = cookies.find(cookie => cookie.name === 'NACKCHAL_REFRESH');
  assert(access && refresh);
  assert.equal(access.value.split('.').length, 3);
  assert.equal(access.httpOnly, true);
  assert.equal(refresh.httpOnly, true);
  assert.equal(access.sameSite, 'Lax');
  assert.equal(refresh.sameSite, 'Lax');
  assert.equal(cookies.some(cookie => cookie.name === 'NACKCHAL_SESSION'), false);
  const storage = await page.evaluate(() => ({
    cookies: document.cookie,
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }));
  for (const value of Object.values(storage)) {
    assert.equal(value.includes(access.value), false);
    assert.equal(value.includes(refresh.value), false);
  }
}

export async function verifyJwtRecovery(context, page) {
  const other = await context.newPage();
  await other.goto(baseUrl);
  await other.locator('.arrival-screen').waitFor({ state: 'hidden' });
  await expect(other.locator('.profile-account-name')).toHaveText('작은곰');
  const before = (await context.cookies()).find(cookie => cookie.name === 'NACKCHAL_REFRESH');
  assert(before);
  let refreshRequests = 0;
  const count = request => {
    if (new URL(request.url()).pathname === '/api/auth/refresh') refreshRequests++;
  };
  context.on('request', count);
  await context.clearCookies({ name: 'NACKCHAL_ACCESS' });
  assert.equal((await context.request.get(`${baseUrl}/api/auth/me`)).status(), 401);
  const userResponses = [page, other].map(tab => tab.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/auth/me' && response.status() === 200));
  await Promise.all([page, other].map(tab => tab.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('focus'));
  })));
  await Promise.all(userResponses);
  await expect(page.locator('.profile-account-name')).toHaveText('작은곰');
  await expect(other.locator('.profile-account-name')).toHaveText('작은곰');
  context.off('request', count);
  assert.equal(refreshRequests, 1);
  const after = (await context.cookies()).find(cookie => cookie.name === 'NACKCHAL_REFRESH');
  assert(after);
  assert.notEqual(after.value, before.value);
  await other.close();

  await context.clearCookies({ name: 'NACKCHAL_ACCESS' });
  await page.route('**/api/auth/refresh', route => route.fulfill({
    status: 503, json: { code: 'SERVICE_UNAVAILABLE' },
  }));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: '다시 연결하기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toHaveCount(0);
  await page.unroute('**/api/auth/refresh');
  await page.getByRole('button', { name: '다시 연결하기' }).click();
  await expect(page.locator('.profile-account-name')).toHaveText('작은곰');
  await verifyJwtCookies(context, page);
}
