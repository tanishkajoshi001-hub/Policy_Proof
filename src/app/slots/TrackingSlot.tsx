import React from 'react';
import { useCamera } from '../../features/camera/hooks/useCamera';
import { PoseCameraView } from '../../features/pose/components/PoseCameraView';
import { CameraControls } from '../../features/camera/components/CameraControls';
import { SetupChecklist } from '../../components/ui/SetupChecklist';
import { PrivacyBanner, MedicalDisclaimerBanner } from '../../components/ui/PrivacyBanner';
import { ErrorAlert } from '../../components/ui/ErrorAlert';
import { useAppShell } from '../providers/useAppShell';
import { HeartPulse } from 'lucide-react';

/**
 * Preserved Mission 01 Motion Engine & Camera Setup View.
 * Owned by Person 3 (feature/motion-engine). Wrapped here by the app shell
 * without modifying Person 3's internal camera or pose implementation.
 */
export const TrackingSlot: React.FC = () => {
  const { language, t } = useAppShell();
  const [isMirrored, setIsMirrored] = React.useState<boolean>(true);

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
    <div className="flex flex-col gap-4">
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
            {language === 'en'
              ? 'Camera Setup & Real-Time Pose Detection'
              : 'कैमरा सेटअप एवं रियल-टाइम पोज़ डिटेक्शन'}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          <span>Person 3 Slot • Motion Engine Base</span>
        </div>
      </div>

      {/* Error Alert (Permission denied, device missing, etc.) */}
      {error && <ErrorAlert error={error} t={t} onRetry={handleStart} />}

      {/* Camera Feed & Live Skeleton Viewport */}
      <section aria-label="Camera and Pose Tracking Viewport" className="w-full flex flex-col gap-4">
        <PoseCameraView
          stream={stream}
          cameraState={cameraState}
          t={t}
          isMirrored={isMirrored}
        />

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

      <PrivacyBanner t={t} />
      <SetupChecklist t={t} />
      <MedicalDisclaimerBanner t={t} />
    </div>
  );
};
