import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  errorText?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  helperText,
  errorText,
  id,
  className = '',
  ...rest
}) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const errorId = errorText ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-200">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={Boolean(errorText)}
        aria-describedby={[helperId, errorId].filter(Boolean).join(' ') || undefined}
        className={`min-h-[48px] px-3.5 py-2 rounded-xl bg-slate-950 border text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 ${
          errorText ? 'border-rose-500' : 'border-slate-700 hover:border-slate-600'
        } ${className}`}
        {...rest}
      />
      {helperText && !errorText && (
        <p id={helperId} className="text-xs text-slate-400">
          {helperText}
        </p>
      )}
      {errorText && (
        <p id={errorId} role="alert" className="text-xs text-rose-300">
          {errorText}
        </p>
      )}
    </div>
  );
};
