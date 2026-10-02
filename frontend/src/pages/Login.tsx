import { useRef, useState } from 'react';
import { AuthError, login, register, registrationSchema, type User } from '../auth/api';
import { AuthLayout } from '../components/auth/AuthLayout';
import { PasswordField } from '../components/auth/PasswordField';
import { Button } from '../components/ui/primitives';

export function Login({ onLogin }: { readonly onLogin: (user: User) => void }) {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const switchForm = () => {
    setRegistering(!registering);
    setPassword('');
    setConfirmation('');
    setError('');
    setNotice('');
    heading.current?.focus();
  };
  const submit = async () => {
    if (submitting.current) return;
    setError('');
    setNotice('');
    if (registering && password !== confirmation) {
      setError('비밀번호가 서로 달라요. 한 번 더 확인해 주세요.');
      document.getElementById('confirm-password')?.focus();
      return;
    }
    const input = { email: email.trim().toLowerCase(), password, nickname };
    const parsed = registrationSchema.safeParse(input);
    if (registering && !parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력한 내용을 확인해 주세요.');
      return;
    }
    submitting.current = true;
    setPending(true);
    try {
      if (registering && parsed.success) {
        await register(parsed.data);
        setRegistering(false);
        setPassword('');
        setConfirmation('');
        setNotice('가입했어요! 이메일과 비밀번호로 로그인해 주세요.');
        heading.current?.focus();
      } else {
        onLogin(await login(input));
      }
    } catch (failure) {
      if (!(failure instanceof AuthError)) throw failure;
      setError(failure.message);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  return (
    <AuthLayout>
      <span className="board-label">작은 숲의 경매 모임</span>
      <h1 ref={heading} tabIndex={-1}>
        {registering ? '처음 왔구나!' : '어서 와, 경매사.'}
      </h1>
      <p className="auth-intro">
        {registering ? '이름을 적고, 함께할 준비를 해 볼까?' : '로그인하고 네 자리에 앉아 봐.'}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        aria-busy={pending}
      >
        <fieldset disabled={pending}>
          <legend className="sr-only">{registering ? '회원가입' : '로그인'}</legend>
          {registering && (
            <div className="auth-field">
              <label htmlFor="nickname">닉네임</label>
              <input
                id="nickname"
                name="nickname"
                value={nickname}
                autoComplete="nickname"
                required
                aria-describedby="nickname-hint"
                onChange={(event) => setNickname(event.target.value)}
              />
              <p className="auth-hint" id="nickname-hint">
                1~12자 · 글자, 숫자, 밑줄, 하이픈
              </p>
            </div>
          )}
          <div className="auth-field">
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              maxLength={254}
              required
              spellCheck={false}
              autoCapitalize="none"
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <PasswordField
            id="password"
            label="비밀번호"
            value={password}
            onChange={setPassword}
            autoComplete={registering ? 'new-password' : 'current-password'}
            {...(registering ? { hint: '10~128자로 적어 주세요.' } : {})}
          />
          {registering && (
            <PasswordField
              id="confirm-password"
              label="비밀번호 확인"
              value={confirmation}
              onChange={setConfirmation}
              autoComplete="new-password"
            />
          )}
          {error && (
            <p className="auth-feedback error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="auth-feedback auth-success" role="status">
              {notice}
            </p>
          )}
          <Button type="submit" className="auth-submit">
            {pending ? '잠깐만 기다려 줘…' : registering ? '회원가입' : '로그인'}
          </Button>
          <p className="auth-switch">
            {registering ? '이미 계정이 있다면' : '처음 왔다면'}
            <Button variant="ghost" onClick={switchForm}>
              {registering ? '로그인하기' : '회원가입하기'}
            </Button>
          </p>
        </fieldset>
      </form>
    </AuthLayout>
  );
}
