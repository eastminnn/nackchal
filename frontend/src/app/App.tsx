import { useCallback, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { AuthLayout } from '../components/auth/AuthLayout';
import { Arrival } from '../components/brand/Arrival';
import { Button } from '../components/ui/primitives';
import { Login } from '../pages/Login';
import { AuctionApp } from './AuctionApp';

export function App() {
  const [arriving, setArriving] = useState(true);
  const finishArrival = useCallback(() => setArriving(false), []);
  const { auth, retry, establish, end } = useAuth();
  const content = (() => {
    switch (auth.status) {
      case 'loading':
        return (
          <AuthLayout>
            <h1>잠깐만 기다려 줘.</h1>
            <p role="status">내 자리를 찾고 있어요.</p>
          </AuthLayout>
        );
      case 'unavailable':
        return (
          <AuthLayout>
            <h1>연결이 잠시 끊겼어.</h1>
            <p className="auth-intro" role="alert">
              {auth.message}
            </p>
            <Button onClick={retry}>다시 연결하기</Button>
          </AuthLayout>
        );
      case 'anonymous':
        return <Login onLogin={establish} />;
      case 'authenticated':
        return <AuctionApp key={auth.user.id} user={auth.user} arriving={arriving} onLogout={end} />;
      default:
        return auth satisfies never;
    }
  })();
  return (
    <>
      {arriving && <Arrival onComplete={finishArrival} />}
      <div inert={arriving}>{content}</div>
    </>
  );
}
