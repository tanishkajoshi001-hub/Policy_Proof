import React from 'react';
import { LocalizedStrings } from '../../types/i18n';
import { ShieldCheck, Info } from 'lucide-react';

interface PrivacyBannerProps {
  t: LocalizedStrings;
}

export const PrivacyBanner: React.FC<PrivacyBannerProps> = ({ t }) => {
  return (
    <div className="w-full rounded-2xl bg-gradient-to-r from-brand-950/60 via-slate-900/80 to-slate-950/80 border border-brand-900/40 p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-brand-900/50 border border-brand-700/40 text-brand-400 flex items-center justify-center flex-shrink-0">
        <ShieldCheck className="w-5 h-5" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-300">
            {t.privacyBadge}
          </span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          {t.privacyDetail}
        </p>
      </div>
    </div>
  );
};

export const MedicalDisclaimerBanner: React.FC<PrivacyBannerProps> = ({ t }) => {
  return (
    <div className="w-full rounded-xl bg-slate-900/40 border border-slate-800 p-3 flex items-start gap-2.5 text-xs text-slate-400">
      <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
      <div>
        <strong className="text-slate-300">{t.medicalDisclaimerTitle}: </strong>
        <span>{t.medicalDisclaimerBody}</span>
      </div>
    </div>
  );
};
