import React from 'react';
import { Language, LocalizedStrings } from '../../types/i18n';
import { Activity, Shield } from 'lucide-react';

interface HeaderProps {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  t: LocalizedStrings;
}

export const Header: React.FC<HeaderProps> = ({ language, onLanguageChange, t }) => {
  return (
    <header className="w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur-md relative z-30">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-slate-950 shadow-lg shadow-brand-500/20">
            <Activity className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Rehab<span className="text-brand-400">Buddy</span>
              </h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-brand-950 text-brand-300 border border-brand-800/60">
                MVP 1.0
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              {t.tagline}
            </p>
          </div>
        </div>

        {/* Right Section: Privacy tag & Language Selector */}
        <div className="flex items-center gap-3">
          {/* Privacy badge */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-xs">
            <Shield className="w-3.5 h-3.5 text-brand-400" />
            <span>On-Device AI</span>
          </div>

          {/* Accessible Language Switcher */}
          <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1">
            <button
              onClick={() => onLanguageChange('en')}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-all ${
                language === 'en'
                  ? 'bg-brand-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-label="Switch to English"
            >
              English
            </button>
            <button
              onClick={() => onLanguageChange('hi')}
              className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-all ${
                language === 'hi'
                  ? 'bg-brand-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              aria-label="हिंदी में बदलें"
            >
              हिंदी
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
