import type { ReactNode } from 'react';
import { BrandMark } from '../brand/BrandMark';

export function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="lobby-shell auth-shell">
      <header className="site-header container">
        <a className="wordmark" href="/" aria-label="nackchal 홈">
          <BrandMark compact />
        </a>
      </header>
      <main className="auth-layout" id="main-content">
        <div className="auth-character" aria-hidden="true">
          <div className="profile-character">
            <img src="/art/residents/plush-lobby.webp" width="600" height="680" alt="" fetchPriority="high" />
          </div>
          <p>네 자리를 비워 뒀어.</p>
        </div>
        <section className="auth-card">{children}</section>
      </main>
      <footer className="auth-footer">
        <a href="/credits.html" target="_blank" rel="noreferrer">
          모델 출처
        </a>
      </footer>
    </div>
  );
}
