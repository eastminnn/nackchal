import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthError, getUser, logout, type User } from './api';

type AuthState =
  | { readonly status: 'loading' }
  | { readonly status: 'anonymous' }
  | { readonly status: 'authenticated'; readonly user: User }
  | { readonly status: 'unavailable'; readonly message: string };

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const revision = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    try {
      const user = await getUser();
      if (current === revision.current) {
        setAuth(user ? { status: 'authenticated', user } : { status: 'anonymous' });
      }
      return user;
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      if (current === revision.current) setAuth({ status: 'unavailable', message: error.message });
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const messages = new BroadcastChannel('nackchal-auth');
    channel.current = messages;
    messages.onmessage = () => {
      void refresh();
    };
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      ++revision.current;
      messages.close();
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const establish = (user: User) => {
    ++revision.current;
    setAuth({ status: 'authenticated', user });
    channel.current?.postMessage('changed');
  };
  const end = async () => {
    await logout();
    ++revision.current;
    setAuth({ status: 'anonymous' });
    channel.current?.postMessage('changed');
  };
  const retry = () => {
    setAuth({ status: 'loading' });
    void refresh();
  };
  return { auth, retry, establish, end };
}
