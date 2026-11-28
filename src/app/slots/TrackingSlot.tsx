import React, { useState } from 'react';
import { useCamera } from '../../features/camera/hooks/useCamera';
import { PoseTrackingSurface } from '../../features/rehab-tracking/components/PoseTrackingSurface';
import { CameraControls } from '../../features/camera/components/CameraControls';
import { MotionWorkbench } from '../../features/rehab-tracking/workbench/MotionWorkbench';
import { SetupChecklist } from '../../components/ui/SetupChecklist';
import { PrivacyBanner, MedicalDisclaimerBanner } from '../../components/ui/PrivacyBanner';
import { ErrorAlert } from '../../components/ui/ErrorAlert';
import { useAppShell } from '../providers/useAppShell';
import { APP_ROUTES } from '../../shared/contracts';
import { HeartPulse, Wrench, Video } from 'lucide-react';

/**
 * Tracking & Motion Engine Slot.
 * Owned by Person 3 (feature/motion-engine).
 *
 * Provides:
 * 1. Motion Workbench (Developer Diagnostics Dashboard per PRD Person 3 Specification)
 * 2. Standard Session View (Reusable PoseTrackingSurface with Camera Controls)
 */
export const TrackingSlot: React.FC = () => {
  const { language, t, currentPath, navigate } = useAppShell();
  const [activeTab, setActiveTab] = useState<'workbench' | 'standard'>(
    currentPath === APP_ROUTES.WORKBENCH ? 'workbench' : 'standard'
  );
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  const {
    cameraState,
    devices,
    activeDeviceId,
    resolutionPreset,
    actualResolution,
    error,
    stream,
    startCamera,
    stopCamera,
    restartCamera,
    switchCamera,
    setResolutionPreset,
  } = useCamera();

  const handleStart = () => {
    startCamera(activeDeviceId || undefined);
  };

  const handleToggleMirror = () => {
    setIsMirrored((prev) => !prev);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Top Scope & Tab Switcher Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <HeartPulse className="w-4 h-4 text-brand-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-400">
              {t.targetRegionBadge}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            {activeTab === 'workbench'
              ? language === 'en'
                ? 'Motion Intelligence Workbench'
                : 'मोशन इंटेलिजेंस वर्कबेंच'
              : language === 'en'
              ? 'Camera Setup & Real-Time Pose Detection'
              : 'कैमरा सेटअप एवं रियल-टाइम पोज़ डिटेक्शन'}
          </h2>
        </div>

        {/* View Mode Segmented Controls */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setActiveTab('workbench');
              if (currentPath !== APP_ROUTES.WORKBENCH) {
                navigate(APP_ROUTES.WORKBENCH);
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'workbench'
                ? 'bg-brand-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            data-testid="tab-workbench"
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Motion Workbench (Dev)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('standard');
              if (currentPath === APP_ROUTES.WORKBENCH) {
                navigate(APP_ROUTES.HOME);
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'standard'
                ? 'bg-brand-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
            data-testid="tab-standard"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Camera Setup View</span>
          </button>
        </div>
      </div>

      {/* View Mode 1: Motion Workbench (Developer Diagnostic Testing Dashboard) */}
      {activeTab === 'workbench' ? (
        <MotionWorkbench t={t} />
      ) : (
        /* View Mode 2: Standard Camera & Pose Tracking Session */
        <div className="flex flex-col gap-4">
          {error && <ErrorAlert error={error} t={t} onRetry={restartCamera} />}

          <section aria-label="Camera and Pose Tracking Viewport" className="w-full flex flex-col gap-4">
            <PoseTrackingSurface
              stream={stream}
              cameraState={cameraState}
              t={t}
              isMirrored={isMirrored}
              onToggleMirror={handleToggleMirror}
            />

            <CameraControls
              cameraState={cameraState}
              devices={devices}
              activeDeviceId={activeDeviceId}
              isMirrored={isMirrored}
              resolutionPreset={resolutionPreset}
              actualResolution={actualResolution}
              t={t}
              onStart={handleStart}
              onStop={stopCamera}
              onRestart={restartCamera}
              onSwitchDevice={switchCamera}
              onToggleMirror={handleToggleMirror}
              onSelectPreset={setResolutionPreset}
            />
          </section>

          <PrivacyBanner t={t} />
          <SetupChecklist t={t} />
          <MedicalDisclaimerBanner t={t} />
        </div>
      )}
    </div>
  );
};
