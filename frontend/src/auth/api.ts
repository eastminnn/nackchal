import ky, { HTTPError, NetworkError, TimeoutError } from 'ky';
import { z } from 'zod';
import { CHARACTER_MODELS } from '../data/characters';

const userSchema = z
  .object({
    id: z.uuid().brand<'UserId'>(),
    nickname: z.string().min(1).max(24),
    avatarCode: z.enum(CHARACTER_MODELS),
  })
  .readonly();
const csrfSchema = z.object({ headerName: z.literal('X-CSRF-TOKEN'), token: z.string().min(1) });
export type User = z.infer<typeof userSchema>;
export const registrationSchema = z.object({
  email: z.string().trim().toLowerCase().email('이메일 주소를 확인해 주세요.').max(254),
  password: z.string().min(10, '비밀번호는 10자 이상으로 적어 주세요.').max(128),
  nickname: z
    .string()
    .trim()
    .regex(/^[\p{L}\p{N}_-]{1,12}$/u, '닉네임은 1~12자의 글자, 숫자, _ 또는 -로 적어 주세요.'),
});
export type Registration = Readonly<z.infer<typeof registrationSchema>>;
export type Login = Readonly<Pick<Registration, 'email' | 'password'>>;

export class AuthError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const api = ky.create({ credentials: 'same-origin', timeout: 10000, retry: 0 });
const errorMessages: Readonly<Record<number, string>> = {
  400: '입력한 내용을 확인해 주세요.',
  401: '이메일이나 비밀번호를 확인해 주세요.',
  403: '요청이 만료됐어요. 다시 시도해 주세요.',
  409: '이미 사용 중인 이메일이에요.',
  429: '시도가 너무 많아요. 잠시 후 다시 해 주세요.',
};

async function request<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof HTTPError) {
      const message = errorMessages[error.response.status];
      throw new AuthError(
        error.response.status,
        message ?? '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    }
    if (error instanceof TimeoutError || error instanceof NetworkError || error instanceof TypeError) {
      throw new AuthError(0, '서버에 연결하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.');
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new AuthError(0, '서버 응답을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    throw error;
  }
}

async function csrfHeaders() {
  const csrf = csrfSchema.parse(await api.get('/api/auth/csrf').json());
  return { [csrf.headerName]: csrf.token };
}

async function readUser(): Promise<User | null> {
  const response = await api.get('/api/auth/me', { throwHttpErrors: false });
  if (response.status === 401) return null;
  if (!response.ok)
    throw new AuthError(response.status, '로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.');
  return userSchema.parse(await response.json());
}

function withAuthLock<T>(action: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request('nackchal-auth', action) : action();
}

let refreshing: Promise<User | null> | null = null;

function refreshUser(): Promise<User | null> {
  if (refreshing) return refreshing;
  refreshing = withAuthLock(async () => {
    // 다른 탭이 먼저 갱신했다면 회전된 refresh 쿠키를 다시 사용하지 않는다.
    const user = await readUser();
    if (user) return user;
    const response = await api.post('/api/auth/refresh', {
      headers: await csrfHeaders(),
      throwHttpErrors: false,
    });
    if (response.status === 401) return null;
    if (!response.ok)
      throw new AuthError(response.status, '로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.');
    return readUser();
  }).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** 액세스 토큰이 아직 유효해도 갱신한다. 열린 WebSocket의 인증 만료 전에 호출해 연결을 유지한다. */
export function renewSession(): Promise<boolean> {
  return request(() =>
    withAuthLock(async () => {
      const response = await api.post('/api/auth/refresh', {
        headers: await csrfHeaders(),
        throwHttpErrors: false,
      });
      return response.ok;
    }),
  );
}

const walletSchema = z.object({ balance: z.number().int().min(0) });

/** 내 캐시 잔액. 다른 사람의 잔액은 조회할 수 없다. */
export function getWallet(): Promise<number> {
  return request(async () => walletSchema.parse(await api.get('/api/wallet').json()).balance);
}

export function getUser(): Promise<User | null> {
  return request(async () => (await readUser()) ?? refreshUser());
}

export function register(input: Registration): Promise<void> {
  return request(async () => {
    await api.post('/api/auth/register', { json: input, headers: await csrfHeaders() });
  });
}

export function login(input: Login): Promise<User> {
  return request(() =>
    withAuthLock(async () => {
      await api.post('/api/auth/login', {
        json: { email: input.email, password: input.password },
        headers: await csrfHeaders(),
      });
      const user = await readUser();
      if (!user) throw new AuthError(401, '로그인이 유지되지 않았어요. 쿠키 설정을 확인해 주세요.');
      return user;
    }),
  );
}

export function logout(): Promise<void> {
  return request(() =>
    withAuthLock(async () => {
      await api.post('/api/auth/logout', { headers: await csrfHeaders() });
    }),
  );
}
