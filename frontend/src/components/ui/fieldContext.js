import { createContext, useContext } from 'react';

export const FieldContext = createContext(null);

/** Share the label and requirement with custom controls without changing validation. */
export function useFieldControlProps(props = {}) {
  const field = useContext(FieldContext);
  return {
    ...(field?.labelId && !props['aria-label'] && !props['aria-labelledby'] ? { 'aria-labelledby': field.labelId } : {}),
    ...(field && !props.disabled && !props.readOnly ? { 'aria-required': props['aria-required'] ?? props.required ?? field.required } : {}),
  };
}
