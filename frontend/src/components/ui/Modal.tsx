import { XIcon } from '@phosphor-icons/react';
import { type ReactNode, useEffect, useRef } from 'react';
import { Button } from './primitives';

export function Modal({
  title,
  children,
  onClose,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={onClose}>
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <Button variant="icon" onClick={onClose} aria-label="닫기">
          <XIcon size={22} />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
