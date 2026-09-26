import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ExclamationTriangleIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import Button from './Button.jsx';

/**
 * The app's standard confirmation modal (used instead of window.confirm/prompt).
 * Nothing happens until the user presses the confirm button: Cancel, the close
 * backdrop and Escape all just call `onCancel`. Extra content (e.g. reason
 * checkboxes) goes in `children`. Rendered through a portal like
 * PrivacyPolicyModal, so it isn't clipped by transformed ancestors.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary', // 'primary' | 'danger'
  loading = false,
  confirmDisabled = false,
  error = '',
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  // Latest handlers/state for the Escape listener, so the effect below runs only when the dialog opens
  // (re-running it on every render would move focus away from fields inside the dialog).
  const escapeRef = useRef({ onCancel, loading });
  useEffect(() => {
    escapeRef.current = { onCancel, loading };
  });

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    cancelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e) {
      if (e.key === 'Escape' && !escapeRef.current.loading) escapeRef.current.onCancel?.();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const Icon = tone === 'danger' ? ExclamationTriangleIcon : QuestionMarkCircleIcon;
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-brand-900/60 p-4 backdrop-blur-sm"
      onClick={() => !loading && onCancel?.()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
      >
        <div className="flex gap-3 px-5 pb-3 pt-5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700'
            }`}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-dialog-title" className="text-base font-semibold text-gray-900">
              {title}
            </h2>
            {message && <div className="mt-1 text-sm text-gray-600">{message}</div>}
          </div>
        </div>
        {children && <div className="px-5 pb-2">{children}</div>}
        {error && (
          <p className="mx-5 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-3 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
