import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export const Card: React.FC<CardProps> = ({
  padded = true,
  className = '',
  children,
  ...rest
}) => {
  return (
    <div
      className={`rounded-2xl bg-slate-900/75 border border-slate-800 shadow-sm ${
        padded ? 'p-5' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};
