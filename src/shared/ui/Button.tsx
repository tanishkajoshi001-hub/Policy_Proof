import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 hover:bg-brand-400 text-slate-950 font-semibold shadow-sm',
  secondary: 'bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-700 font-medium',
  danger: 'bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-sm',
  ghost: 'bg-transparent hover:bg-slate-800/70 text-slate-300 font-medium',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-[40px] px-3.5 text-xs rounded-lg',
  md: 'min-h-[48px] px-5 text-sm rounded-xl',
  lg: 'min-h-[52px] px-7 text-base rounded-xl',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  type = 'button',
  children,
  ...rest
}) => {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};
