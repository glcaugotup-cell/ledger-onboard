import { useFieldControlProps } from './fieldContext.js';

/** Philippine mobile input with a fixed +63 country code and a national number entry. */
export default function PhoneInput({ value = '', onChange, error, className = '', inputClassName = '', ...props }) {
  const fieldProps = useFieldControlProps(props);
  const rawDigits = String(value).replace(/\D/g, '');
  const localNumber = rawDigits.startsWith('63') ? rawDigits.slice(2) : rawDigits.startsWith('0') ? rawDigits.slice(1) : rawDigits;

  const handleChange = (event) => {
    let digits = event.target.value.replace(/\D/g, '');
    if (digits.startsWith('63')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, 10);
    onChange?.(digits ? `0${digits}` : '');
  };

  return (
    <div className={`flex min-h-10 w-full items-center overflow-hidden rounded-lg border bg-white transition-[border-color,box-shadow] duration-200 ease-[var(--ease-smooth)] focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200 ${error ? 'border-red-400' : 'border-gray-300'} ${className}`}>
      <span className="flex min-h-10 shrink-0 items-center border-r border-[#d3e5da] bg-[#eaf3ed] px-3.5 text-sm font-semibold tracking-wide text-[#1d684e]" aria-hidden="true">+63</span>
      <input
        {...fieldProps}
        {...props}
        type="tel"
        inputMode="numeric"
        autoComplete={props.autoComplete || 'tel-national'}
        maxLength={16}
        value={localNumber.slice(0, 10)}
        onChange={handleChange}
        className={`min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:outline-none focus:ring-0 ${inputClassName}`}
      />
    </div>
  );
}
