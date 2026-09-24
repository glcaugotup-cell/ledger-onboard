import { useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { TextInput } from './Field.jsx';

/** TextInput with the standard show/hide eye toggle — masked by default. Wrap in a Field for the label. */
export default function PasswordInput({ className = '', ...rest }) {
  const [show, setShow] = useState(false);
  const toggleLabel = show ? 'Hide password' : 'Show password';

  return (
    <div className="relative">
      <TextInput {...rest} type={show ? 'text' : 'password'} className={`pr-10 ${className}`} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={toggleLabel}
        title={toggleLabel}
        className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer rounded text-gray-400 transition-colors hover:text-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1"
      >
        {show ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
    </div>
  );
}
