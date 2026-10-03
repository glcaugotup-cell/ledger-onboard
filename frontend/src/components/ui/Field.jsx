import { Children, cloneElement, isValidElement, useId } from 'react';
import { FieldContext, useFieldControlProps } from './fieldContext.js';

function labelNativeControls(children, labelId, required) {
  return Children.map(children, (child) => {
    if (!isValidElement(child) || typeof child.type !== 'string') return child;
    if (['input', 'select', 'textarea'].includes(child.type)) {
      return cloneElement(child, {
        ...(labelId && !child.props['aria-label'] && !child.props['aria-labelledby'] ? { 'aria-labelledby': labelId } : {}),
        ...(!child.props.disabled && !child.props.readOnly ? { 'aria-required': child.props['aria-required'] ?? required } : {}),
      });
    }
    return child.props.children ? cloneElement(child, {}, labelNativeControls(child.props.children, labelId, required)) : child;
  });
}

/** Keep the visual marker separate from the field's accessible name. */
export function FieldRequirement({ required = false }) {
  return required
    ? <span aria-hidden="true" className="ml-1 font-semibold text-red-600">*</span>
    : <span aria-hidden="true" className="ml-1 text-xs font-normal normal-case tracking-normal text-gray-500">(optional)</span>;
}

/** Required flags also cover fields validated on submit rather than by the browser. */
export function Field({ label, required, error, hint, children, htmlFor, className = '', labelClassName = 'mb-1.5 block text-sm font-medium text-gray-700' }) {
  const labelId = useId();
  const fieldRequired = required ?? Children.toArray(children).some((child) => isValidElement(child) && Boolean(child.props.required));
  const labeledChildren = labelNativeControls(children, label ? labelId : undefined, fieldRequired);
  return (
    <FieldContext.Provider value={{ labelId: label ? labelId : undefined, required: fieldRequired }}>
      <label htmlFor={htmlFor} className={`block ${className}`}>
        {label && <span className={labelClassName}><span id={labelId}>{label}</span><FieldRequirement required={fieldRequired} /></span>}
        {labeledChildren}
        {error && <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span>}
        {!error && hint && <span className="mt-1.5 block text-xs text-gray-500">{hint}</span>}
      </label>
    </FieldContext.Provider>
  );
}

const baseInputClasses =
  'w-full min-h-[2.5rem] rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition-[border-color,background-color,color,box-shadow] duration-200 ease-[var(--ease-smooth)] hover:border-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500';

export function TextInput({ error, className = '', ...rest }) {
  const fieldProps = useFieldControlProps(rest);
  return <input className={`${baseInputClasses} ${error ? 'border-red-400' : 'border-gray-300'} ${className}`} {...fieldProps} {...rest} />;
}

export function TextArea({ error, className = '', ...rest }) {
  const fieldProps = useFieldControlProps(rest);
  return <textarea className={`${baseInputClasses} ${error ? 'border-red-400' : 'border-gray-300'} ${className}`} {...fieldProps} {...rest} />;
}

export function Select({ error, className = '', children, ...rest }) {
  const fieldProps = useFieldControlProps(rest);
  return (
    <select className={`${baseInputClasses} bg-white ${error ? 'border-red-400' : 'border-gray-300'} ${className}`} {...fieldProps} {...rest}>
      {children}
    </select>
  );
}
