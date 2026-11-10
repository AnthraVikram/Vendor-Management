import { KeyboardEvent, SyntheticEvent, useEffect, useId, useRef } from 'react';

// A confirmation for archiving, removing and switching user (Feature 005 FR-043). The native modal dialog traps focus
// and blocks the page; focus starts on Cancel, the safe choice, and returns to whatever opened the dialog.
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return <OpenDialog {...{ title, message, confirmLabel, danger, onConfirm, onCancel }} />;
}

function OpenDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      if (element?.open) element.close();
      opener?.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  }

  // The browser's own Escape handling would close the dialog behind React's back; the keydown above handles it.
  function onNativeCancel(event: SyntheticEvent) {
    event.preventDefault();
  }

  return (
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby={titleId} onKeyDown={onKeyDown} onCancel={onNativeCancel}>
      <h2 id={titleId}>{title}</h2>
      <p>{message}</p>
      <div className="dialog-actions">
        <button type="button" ref={cancel} className="secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className={danger ? 'danger' : undefined} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
