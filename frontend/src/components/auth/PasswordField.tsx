import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { useState } from 'react';
import { Button } from '../ui/primitives';

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoComplete: 'current-password' | 'new-password';
  readonly hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-field">
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          maxLength={128}
          required
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          variant="icon"
          onClick={() => setVisible(!visible)}
          aria-label={`${label} ${visible ? '숨기기' : '보기'}`}
          aria-pressed={visible}
        >
          {visible ? <EyeSlashIcon size={20} /> : <EyeIcon size={20} />}
        </Button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="auth-hint">
          {hint}
        </p>
      )}
    </div>
  );
}
