import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  tone?: AlertTone;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

const toneStyles: Record<AlertTone, { box: string; icon: React.ComponentType<{ className?: string }> }> = {
  info: {
    box: 'bg-slate-900/80 border-slate-700 text-slate-200',
    icon: Info,
  },
  success: {
    box: 'bg-emerald-950/50 border-emerald-800/70 text-emerald-100',
    icon: CheckCircle2,
  },
  warning: {
    box: 'bg-amber-950/40 border-amber-800/70 text-amber-100',
    icon: AlertTriangle,
  },
  danger: {
    box: 'bg-rose-950/50 border-rose-800/80 text-rose-100',
    icon: AlertCircle,
  },
};

export const Alert: React.FC<AlertProps> = ({
  tone = 'info',
  title,
  description,
  children,
  className = '',
}) => {
  const { box, icon: Icon } = toneStyles[tone];
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';

  return (
    <div role={role} className={`w-full rounded-2xl border p-4 flex items-start gap-3 ${box} ${className}`}>
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="text-xs opacity-90 mt-1 leading-relaxed">{description}</p>}
        {children}
      </div>
    </div>
  );
};
