import { useState } from 'react';
import { useFieldControlProps } from './fieldContext.js';
import { ADMIN_PHONE_COUNTRIES, DEFAULT_ADMIN_PHONE_COUNTRY, splitAdminPhone } from '../../data/adminPhoneCountries.js';

/**
 * Mobile number with a country-code dropdown (admins only; everyone else uses PhoneInput's fixed +63).
 * The value is "+<country code><number>", or '' while the number is empty.
 */
export default function CountryPhoneInput({ value = '', onChange, error, className = '', ...props }) {
  const fieldProps = useFieldControlProps(props);
  const parts = splitAdminPhone(value);
  // Remembers the chosen country while the number box is still empty.
  const [chosenCode, setChosenCode] = useState(parts?.country.code || DEFAULT_ADMIN_PHONE_COUNTRY.code);
  const country = parts?.country || ADMIN_PHONE_COUNTRIES.find((c) => c.code === chosenCode) || DEFAULT_ADMIN_PHONE_COUNTRY;
  const national = parts?.national || '';

  const emit = (nextCountry, digits) => onChange?.(digits ? `+${nextCountry.dial}${digits}` : '');

  const handleCountry = (event) => {
    const next = ADMIN_PHONE_COUNTRIES.find((c) => c.code === event.target.value) || DEFAULT_ADMIN_PHONE_COUNTRY;
    setChosenCode(next.code);
    emit(next, national);
  };

  const handleNumber = (event) => {
    const typed = event.target.value.trim();
    // A pasted full number ("+44 7400 123456") picks its own country.
    const pasted = typed.startsWith('+') ? splitAdminPhone(typed) : null;
    if (pasted) {
      setChosenCode(pasted.country.code);
      emit(pasted.country, pasted.national.slice(0, 10));
      return;
    }
    // Drops a leading 0 ("0917…", "07400…"), as numbers are dialled without it after the country code.
    emit(country, typed.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10));
  };

  return (
    <div className={`flex min-h-10 w-full items-center overflow-hidden rounded-lg border bg-white transition-[border-color,box-shadow] duration-200 ease-[var(--ease-smooth)] focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200 ${error ? 'border-red-400' : 'border-gray-300'} ${className}`}>
      <select
        aria-label="Country code"
        value={country.code}
        onChange={handleCountry}
        className="min-h-10 shrink-0 cursor-pointer border-0 border-r border-[#d3e5da] bg-[#eaf3ed] py-2 pl-3 pr-7 text-sm font-semibold text-[#1d684e] outline-none focus:outline-none focus:ring-0"
      >
        {ADMIN_PHONE_COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>{`${c.code} +${c.dial}`}</option>
        ))}
      </select>
      <input
        {...fieldProps}
        {...props}
        type="tel"
        inputMode="tel"
        autoComplete={props.autoComplete || 'tel-national'}
        maxLength={20}
        placeholder={props.placeholder || country.example}
        value={national}
        onChange={handleNumber}
        className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:outline-none focus:ring-0"
      />
    </div>
  );
}
