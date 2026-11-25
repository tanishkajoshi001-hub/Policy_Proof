import React from 'react';
import { RefreshCw } from 'lucide-react';

export interface LoadingProps {
  label?: string;
}

export const Loading: React.FC<LoadingProps> = ({ label = 'Loading...' }) => {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-10 gap-3 text-slate-300">
      <RefreshCw className="w-6 h-6 text-brand-400 animate-spin" aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
};
