import React from 'react';
import { CameraErrorDetails } from '../../types/camera';
import { LocalizedStrings } from '../../types/i18n';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorAlertProps {
  error: CameraErrorDetails;
  t: LocalizedStrings;
  onRetry: () => void;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({ error, t, onRetry }) => {
  const getErrorContent = () => {
    switch (error.type) {
      case 'permission':
        return {
          title: t.permissionDeniedTitle,
          message: t.permissionDeniedMsg,
        };
      case 'not-found':
        return {
          title: t.cameraNotFoundTitle,
          message: t.cameraNotFoundMsg,
        };
      default:
        return {
          title: t.genericErrorTitle,
          message: error.message || t.genericErrorMsg,
        };
    }
  };

  const content = getErrorContent();

  return (
    <div
      role="alert"
      className="w-full bg-rose-950/40 border border-rose-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-rose-200"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-rose-900/50 border border-rose-700/60 text-rose-400 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-rose-100 mb-0.5">
            {content.title}
          </h4>
          <p className="text-xs text-rose-300 leading-relaxed">
            {content.message}
          </p>
        </div>
      </div>

      <button
        onClick={onRetry}
        className="min-h-[44px] px-5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-rose-400"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>{t.retryButton}</span>
      </button>
    </div>
  );
};
