import { TextInput } from './Field.jsx';

/** Gmail username box with a fixed "@gmail.com" ending. The value is the username only. */
export default function GmailUsernameInput({ value, onChange, error, ...props }) {
  return (
    <div className="flex">
      <TextInput
        type="text"
        inputMode="email"
        maxLength={64}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/@gmail\.com$/i, '').replace(/[^A-Za-z0-9._%+-]/g, ''))}
        error={error}
        className="min-w-0 rounded-r-none"
        aria-label="Gmail username"
        {...props}
      />
      <span className={`flex min-h-[2.5rem] items-center rounded-r-lg border border-l-0 px-3 text-sm ${error ? 'border-red-400 text-gray-500' : 'border-gray-300 text-gray-600'}`}>@gmail.com</span>
    </div>
  );
}
