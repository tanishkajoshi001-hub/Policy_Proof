import React from 'react';
import { LocalizedStrings } from '../../types/i18n';
import { Ruler, SunMedium, Smartphone, CheckCircle2 } from 'lucide-react';

interface SetupChecklistProps {
  t: LocalizedStrings;
}

export const SetupChecklist: React.FC<SetupChecklistProps> = ({ t }) => {
  const steps = [
    {
      icon: Ruler,
      title: t.checklistDistanceTitle,
      desc: t.checklistDistanceDesc,
    },
    {
      icon: SunMedium,
      title: t.checklistLightingTitle,
      desc: t.checklistLightingDesc,
    },
    {
      icon: Smartphone,
      title: t.checklistStabilityTitle,
      desc: t.checklistStabilityDesc,
    },
  ];

  return (
    <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4 text-slate-200">
        <CheckCircle2 className="w-5 h-5 text-brand-400" />
        <h3 className="text-base font-semibold tracking-tight">
          {t.setupGuideTitle}
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div
              key={idx}
              className="flex items-start gap-3.5 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/60 hover:border-slate-700/80 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-brand-950 border border-brand-800/40 text-brand-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-200 mb-1">
                  {step.title}
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
