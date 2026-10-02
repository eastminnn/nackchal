import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export const baseUrl = process.env.NACKCHAL_URL ?? 'http://127.0.0.1:4185';
export const testPassword = 'Plush-test-password-42';

export async function authenticate(context, nickname = '동민') {
  const email = `qa-${randomUUID()}@example.test`;
  const csrf = await context.request.get(`${baseUrl}/api/auth/csrf`);
  assert.equal(csrf.status(), 200);
  const token = await csrf.json();
  const headers = { [token.headerName]: token.token };
  const registration = await context.request.post(`${baseUrl}/api/auth/register`, {
    headers, data: { email, password: testPassword, nickname },
  });
  assert.equal(registration.status(), 201);
  const login = await context.request.post(`${baseUrl}/api/auth/login`, {
    headers, data: { email, password: testPassword },
  });
  assert.equal(login.status(), 204);
  return email;
}
