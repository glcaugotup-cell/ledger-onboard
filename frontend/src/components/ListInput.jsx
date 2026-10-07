import { useId, useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { FieldRequirement, TextInput } from './ui/Field.jsx';
import { listItemKey, MAX_LIST_ITEM_LENGTH, MAX_LIST_ITEMS } from '../utils/listItems.js';

const iconButton =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent';

/**
 * A list of short text entries (stored as an array of strings) with optional clickable suggestions.
 * - variant "chips": entries show as removable pills with the typing box after them; Enter or a comma adds.
 * - variant "list": entries show as a numbered list (one per row, reorderable); Enter adds, commas stay inside an entry.
 * Duplicates (ignoring case, spaces and punctuation) are refused with a message, as are entries over
 * `maxLength` and anything past `maxItems`. Pasting several lines (and, for chips, comma-separated text)
 * adds them as separate entries. `format` tidies a typed entry when it is added.
 * The typing box can be controlled (`draft`/`onDraftChange`) so a form can include unsaved text on submit.
 */
export default function ListInput({
  label,
  values,
  onChange,
  variant = 'chips',
  suggestions = [],
  placeholder,
  hint,
  format = (value) => value,
  blurFormat,
  commitOnBlur = variant === 'chips',
  itemName = 'entry',
  itemNamePlural = 'entries',
  maxItems = MAX_LIST_ITEMS,
  maxLength = MAX_LIST_ITEM_LENGTH,
  draft: controlledDraft,
  onDraftChange,
  error,
}) {
  const id = useId();
  const [ownDraft, setOwnDraft] = useState('');
  const [message, setMessage] = useState('');
  const draft = controlledDraft ?? ownDraft;
  const setDraft = (value) => (onDraftChange ? onDraftChange(value) : setOwnDraft(value));
  const isChips = variant === 'chips';
  const full = values.length >= maxItems;
  const addedKeys = new Set(values.map(listItemKey));
  const draftTooLong = draft.trim().length > maxLength;

  /** Adds entries in order; returns the reasons any were refused ('duplicate' | 'length' | 'limit'). */
  function add(rawEntries) {
    const next = [...values];
    const refusals = [];
    let firstMessage = '';
    for (const raw of rawEntries) {
      const cleaned = format(String(raw).replace(/\s+/g, ' ').trim());
      if (!cleaned || !listItemKey(cleaned)) continue;
      const refuse = (reason, text) => {
        refusals.push(reason);
        if (!firstMessage) firstMessage = text;
      };
      if (cleaned.length > maxLength) {
        refuse('length', `Keep each ${itemName} to ${maxLength} characters or fewer (that one has ${cleaned.length}).`);
        continue;
      }
      const existing = next.find((value) => listItemKey(value) === listItemKey(cleaned));
      if (existing) {
        refuse('duplicate', `“${existing}” is already in the list.`);
        continue;
      }
      if (next.length >= maxItems) {
        refuse('limit', `You can add up to ${maxItems} ${itemNamePlural}. Remove one to add another.`);
        break;
      }
      next.push(cleaned);
    }
    if (next.length !== values.length) onChange(next);
    const skipped = refusals.length > 1 ? ` (${refusals.length} entries were skipped.)` : '';
    setMessage(firstMessage ? firstMessage + skipped : '');
    return refusals;
  }

  function commitDraft() {
    if (!draft.trim()) {
      setDraft('');
      return;
    }
    const refusals = add([draft]);
    // Keep the text when it needs shortening or there is no room yet; a duplicate is already in the list.
    if (!refusals.includes('length') && !refusals.includes('limit')) setDraft('');
  }

  function remove(index) {
    onChange(values.filter((_, i) => i !== index));
    setMessage('');
  }

  function move(index, offset) {
    const target = index + offset;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function toggleSuggestion(suggestion) {
    const index = values.findIndex((value) => listItemKey(value) === listItemKey(suggestion));
    if (index >= 0) remove(index);
    else add([suggestion]);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || (isChips && e.key === ',')) {
      e.preventDefault();
      commitDraft();
    } else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
      e.preventDefault();
      remove(values.length - 1);
    }
  }

  function onPaste(e) {
    const text = e.clipboardData?.getData('text') ?? '';
    const parts = text.split(isChips ? /[\r\n,]+/ : /[\r\n]+/).filter((part) => part.trim());
    if (parts.length > 1) {
      e.preventDefault();
      add(parts);
    }
  }

  function onBlur() {
    if (commitOnBlur) commitDraft();
    else if (blurFormat && draft) setDraft(blurFormat(draft));
  }

  const inputProps = {
    id,
    value: draft,
    onChange: (e) => {
      setDraft(e.target.value);
      if (message) setMessage('');
    },
    onKeyDown,
    onPaste,
    onBlur,
    placeholder: isChips && values.length ? 'Add more…' : placeholder,
    'aria-invalid': draftTooLong || Boolean(error) || undefined,
    'aria-describedby': `${id}-help`,
  };
  // In the chips box the input sits after the last pill, so it is a bare input inside the bordered box.
  const input = isChips ? (
    <input {...inputProps} className="min-h-9 min-w-[10rem] flex-1 border-0 bg-transparent px-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none" />
  ) : (
    <TextInput {...inputProps} error={draftTooLong || Boolean(error)} />
  );

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        <FieldRequirement />
      </label>

      {isChips ? (
        <div
          className={`flex flex-wrap items-center gap-1.5 rounded-lg border bg-white p-1.5 transition-[border-color,box-shadow] focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-200 ${error ? 'border-red-400' : 'border-gray-300'}`}
        >
          {values.map((value, index) => (
            <span key={`${value}-${index}`} className="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded-full bg-brand-50 py-0.5 pl-3 pr-0.5 text-sm font-medium text-brand-800 ring-1 ring-inset ring-brand-200">
              <span className="min-w-0 [overflow-wrap:anywhere]">{value}</span>
              <button type="button" onClick={() => remove(index)} aria-label={`Remove ${value}`} className={`${iconButton} h-8 w-8 rounded-full text-brand-500 hover:bg-brand-100 hover:text-brand-800`}>
                <XMarkIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </span>
          ))}
          {input}
        </div>
      ) : (
        <>
          {values.length > 0 && (
            <ol aria-label={`Added ${itemNamePlural}`} className="mb-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
              {values.map((value, index) => (
                <li key={`${value}-${index}`} className="flex items-start gap-2 py-1 pl-3 pr-1">
                  <span className="w-6 shrink-0 pt-2 text-right text-sm font-semibold tabular-nums text-gray-400" aria-hidden="true">{index + 1}.</span>
                  <span className="min-w-0 flex-1 pt-2 text-sm text-gray-800 [overflow-wrap:anywhere]">{value}</span>
                  <span className="flex shrink-0">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move “${value}” up`} className={iconButton}>
                      <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === values.length - 1} aria-label={`Move “${value}” down`} className={iconButton}>
                      <ArrowDownIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => remove(index)} aria-label={`Remove ${value}`} className={`${iconButton} hover:bg-red-50 hover:text-red-600`}>
                      <XMarkIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {input}
        </>
      )}

      <div id={`${id}-help`} className="mt-1.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-xs">
        <span className={error ? 'font-medium text-red-600' : 'text-gray-500'}>
          {error || hint || (isChips ? `Press Enter or type a comma to add. Up to ${maxLength} characters each.` : `Press Enter to add. Up to ${maxLength} characters each.`)}
        </span>
        <span className={`tabular-nums ${full ? 'font-semibold text-amber-700' : 'text-gray-500'}`}>
          {values.length} / {maxItems}
          <span className="sr-only"> {itemNamePlural} added</span>
        </span>
      </div>
      <p role="status" aria-live="polite" className="text-xs font-medium text-red-600 empty:hidden">
        {message || (draftTooLong ? `That ${itemName} has ${draft.trim().length} characters; the limit is ${maxLength}.` : '')}
      </p>

      {suggestions.length > 0 && (
        <div className="mt-2.5">
          <p className="mb-1.5 text-xs font-medium text-gray-500">
            {full ? `Limit of ${maxItems} reached. Remove an item to add more.` : 'Common choices (tap to add or remove)'}
          </p>
          <div role="group" aria-label={`Suggested ${itemNamePlural}`} className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => {
              const selected = addedKeys.has(listItemKey(suggestion));
              return (
                <button
                  key={suggestion}
                  type="button"
                  aria-pressed={selected}
                  disabled={!selected && full}
                  onClick={() => toggleSuggestion(suggestion)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected ? 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700' : 'border-gray-300 bg-white text-gray-700 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-800'
                  }`}
                >
                  {selected ? <CheckIcon className="h-4 w-4 shrink-0" aria-hidden="true" /> : <PlusIcon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {suggestion}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
