import React, { useState } from 'react';
import { useCamera } from '../features/camera/hooks/useCamera';
import { PoseCameraView } from '../features/pose/components/PoseCameraView';
import { CameraControls } from '../features/camera/components/CameraControls';
import { Header } from '../components/layout/Header';
import { SetupChecklist } from '../components/ui/SetupChecklist';
import { PrivacyBanner, MedicalDisclaimerBanner } from '../components/ui/PrivacyBanner';
import { ErrorAlert } from '../components/ui/ErrorAlert';
import { Language } from '../types/i18n';
import { en } from '../locales/en';
import { hi } from '../locales/hi';
import { HeartPulse } from 'lucide-react';

export const App: React.FC = () => {
  const [language, setLanguage] = useState<Language>('en');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  const t = language === 'en' ? en : hi;

  const {
    cameraState,
    devices,
    activeDeviceId,
    error,
    stream,
    startCamera,
    stopCamera,
    switchCamera,
  } = useCamera();

  const handleStart = () => {
    startCamera(activeDeviceId || undefined);
  };

  const handleToggleMirror = () => {
    setIsMirrored((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. Header with Brand & Language Toggle */}
      <Header
        language={language}
        onLanguageChange={setLanguage}
        t={t}
      />

      {/* 2. Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-4 flex flex-col gap-4">
        {/* Top Clinical Scope Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <HeartPulse className="w-4 h-4 text-brand-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-400">
                {t.targetRegionBadge}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {language === 'en' ? 'Camera Setup & Real-Time Pose Detection' : 'कैमरा सेटअप एवं रियल-टाइम पोज़ डिटेक्शन'}
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
            <span>Mission 01 Foundation</span>
          </div>
        </div>

        {/* Error Alert (Permission denied, device missing, etc.) */}
        {error && (
          <ErrorAlert
            error={error}
            t={t}
            onRetry={handleStart}
          />
        )}

        {/* 3. Camera Feed & Live Skeleton Viewport */}
        <section aria-label="Camera and Pose Tracking Viewport" className="w-full flex flex-col gap-4">
          <PoseCameraView
            stream={stream}
            cameraState={cameraState}
            t={t}
            isMirrored={isMirrored}
          />

          {/* Interactive Camera Controls */}
          <CameraControls
            cameraState={cameraState}
            devices={devices}
            activeDeviceId={activeDeviceId}
            isMirrored={isMirrored}
            t={t}
            onStart={handleStart}
            onStop={stopCamera}
            onSwitchDevice={switchCamera}
            onToggleMirror={handleToggleMirror}
          />
        </section>

        {/* 4. On-Device Privacy Guarantee Banner */}
        <PrivacyBanner t={t} />

        {/* 5. Camera & Environmental Setup Checklist */}
        <SetupChecklist t={t} />

        {/* 6. Medical Advisory Notice */}
        <MedicalDisclaimerBanner t={t} />
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>RehabBuddy © {new Date().getFullYear()} • Privacy-First AI Rehabilitation Assistant</p>
      </footer>
    </div>
  );
};
