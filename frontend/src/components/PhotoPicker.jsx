import { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Button from './ui/Button.jsx';
import { validateImageFile } from '../utils/validators.js';

export const MAX_PHOTOS = 5;

/**
 * Photo attachments as a managed list: thumbnail, file name, View and Remove, and an
 * "n / 5" counter. Extra files beyond the limit, or files of the wrong type or size,
 * are refused with a message (the server enforces the same rules).
 */
export default function PhotoPicker({ files, onChange, max = MAX_PHOTOS, label = 'Photos', hint = 'JPG, PNG or WEBP, up to 5 MB each.' }) {
  const inputId = useId();
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const urls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);

  const add = (event) => {
    const picked = Array.from(event.target.files || []);
    event.target.value = '';
    const problems = picked.map((file) => validateImageFile(file, { label: 'a photo' })).filter(Boolean);
    const valid = picked.filter((file) => !validateImageFile(file, { label: 'a photo' }));
    const room = max - files.length;
    const accepted = valid.slice(0, Math.max(0, room));
    if (valid.length > room) setError(`You can attach up to ${max} photos. Remove one to add another.`);
    else if (problems.length) setError(problems[0]);
    else setError('');
    if (accepted.length) onChange([...files, ...accepted]);
  };

  const remove = (index) => {
    setError('');
    onChange(files.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">{label}<span className="ml-1 text-xs font-normal text-gray-500">(optional)</span></span>
        <span className={`text-xs font-semibold tabular-nums ${files.length >= max ? 'text-amber-700' : 'text-gray-500'}`} aria-live="polite">{files.length} / {max}</span>
      </div>
      {files.length > 0 && (
        <ul className="mb-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center gap-3 px-2.5 py-2">
              <img src={urls[index]} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{file.name}</span>
              <button type="button" className="rounded px-1.5 py-1 text-xs font-medium text-brand-700 hover:underline" onClick={() => setPreview(index)} aria-label={`View ${file.name}`}>View</button>
              <button type="button" className="rounded px-1.5 py-1 text-xs font-medium text-red-600 hover:underline" onClick={() => remove(index)} aria-label={`Remove ${file.name}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={inputId} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm ${files.length >= max ? 'pointer-events-none border-gray-200 text-gray-400' : 'border-brand-300 text-brand-700 hover:bg-brand-50'}`}>
        <PhotoIcon className="h-4 w-4" aria-hidden="true" />
        {files.length ? 'Add another photo' : 'Add photos'}
      </label>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={files.length >= max} onChange={add} aria-label={label} />
      <span className="mt-1 block text-xs text-gray-500">{hint} Up to {max} photos.</span>
      {error && <span className="mt-1 block text-xs font-medium text-red-600" role="alert">{error}</span>}
      {preview !== null && urls[preview] && createPortal(
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Photo preview" onClick={() => setPreview(null)}>
          <div className="relative max-h-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <img src={urls[preview]} alt={files[preview]?.name || 'Selected photo'} className="max-h-[80vh] max-w-full rounded-lg bg-white object-contain" />
            <Button variant="secondary" className="absolute right-2 top-2" onClick={() => setPreview(null)} aria-label="Close preview"><XMarkIcon className="h-4 w-4" aria-hidden="true" /></Button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
