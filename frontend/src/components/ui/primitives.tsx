import { CoinsIcon } from '@phosphor-icons/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
}) {
  return <button type="button" className={`button button-${variant} ${className}`} {...props} />;
}
export function Badge({ children, live = false }: { readonly children: ReactNode; readonly live?: boolean }) {
  return (
    <span className={`badge ${live ? 'badge-live' : ''}`}>
      {live && <span className="live-dot" />}
      {children}
    </span>
  );
}
export function Cash({ amount }: { readonly amount: number }) {
  return (
    <span className="cash">
      <CoinsIcon weight="duotone" size={20} />
      <strong>{amount}</strong>
      <span>캐시</span>
    </span>
  );
}
export function Money({ amount }: { readonly amount: number }) {
  return <span className="money">${amount.toLocaleString()}</span>;
}
