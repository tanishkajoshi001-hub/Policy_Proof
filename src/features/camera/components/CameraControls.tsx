import React from 'react';
import {
  CameraState,
  CameraDeviceInfo,
  CameraResolution,
  CameraResolutionPreset,
} from '../../../types/camera';
import { LocalizedStrings } from '../../../types/i18n';
import { Play, Square, RotateCcw, Video, FlipHorizontal, Sliders, AlertCircle } from 'lucide-react';

interface CameraControlsProps {
  cameraState: CameraState;
  devices: CameraDeviceInfo[];
  activeDeviceId: string;
  isMirrored: boolean;
  resolutionPreset: CameraResolutionPreset;
  actualResolution: CameraResolution | null;
  t: LocalizedStrings;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  onSwitchDevice: (deviceId: string) => void;
  onToggleMirror: () => void;
  onSelectPreset: (preset: CameraResolutionPreset) => void;
}

export const CameraControls: React.FC<CameraControlsProps> = ({
  cameraState,
  devices,
  activeDeviceId,
  isMirrored,
  resolutionPreset,
  actualResolution,
  t,
  onStart,
  onStop,
  onRestart,
  onSwitchDevice,
  onToggleMirror,
  onSelectPreset,
}) => {
  const isActive = cameraState === 'active';
  const isPending =
    cameraState === 'requesting_permission' ||
    cameraState === 'initializing' ||
    cameraState === 'requesting-permission';
  const isInterrupted = cameraState === 'interrupted';
  const isErrorState =
    cameraState === 'permission_denied' ||
    cameraState === 'unavailable' ||
    cameraState === 'error' ||
    cameraState === 'permission-denied' ||
    cameraState === 'camera-unavailable';

  return (
    <div className="w-full flex flex-col gap-3 p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg backdrop-blur-md">
      {/* Top Controls Row */}
      <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Primary Action Button (Large accessible touch target >= 52px) */}
        <div className="flex items-center gap-3">
          {isActive ? (
            <button
              onClick={onStop}
              className="w-full sm:w-auto min-h-[52px] px-8 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all duration-200 shadow-md focus:outline-none focus:ring-4 focus:ring-rose-500/30 active:scale-95 bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
              aria-label={t.stopCamera}
            >
              <Square className="w-5 h-5 fill-current" />
              <span>{t.stopCamera}</span>
            </button>
          ) : isInterrupted ? (
            <button
              onClick={onRestart}
              className="w-full sm:w-auto min-h-[52px] px-8 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all duration-200 shadow-md focus:outline-none focus:ring-4 focus:ring-amber-500/30 active:scale-95 bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer"
              aria-label={t.resumeCamera}
            >
              <RotateCcw className="w-5 h-5" />
              <span>{t.resumeCamera}</span>
            </button>
          ) : isErrorState ? (
            <button
              onClick={onRestart}
              className="w-full sm:w-auto min-h-[52px] px-8 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all duration-200 shadow-md focus:outline-none focus:ring-4 focus:ring-brand-500/30 active:scale-95 bg-brand-500 hover:bg-brand-400 text-slate-950 cursor-pointer"
              aria-label={t.restartCamera}
            >
              <RotateCcw className="w-5 h-5" />
              <span>{t.restartCamera}</span>
            </button>
          ) : (
            <button
              onClick={onStart}
              disabled={isPending}
              className="w-full sm:w-auto min-h-[52px] px-8 rounded-xl font-bold text-base flex items-center justify-center gap-3 transition-all duration-200 shadow-md focus:outline-none focus:ring-4 focus:ring-brand-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-brand-500 hover:bg-brand-400 text-slate-950 cursor-pointer"
              aria-label={t.startCamera}
            >
              {isPending ? (
                <>
                  <RotateCcw className="w-5 h-5 animate-spin" />
                  <span>{t.requestingPermission}</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>{t.startCamera}</span>
                </>
              )}
            </button>
          )}

          {/* Interrupted Warning Indicator */}
          {isInterrupted && (
            <div className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-950/60 border border-amber-800/60 px-3 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>Feed Interrupted</span>
            </div>
          )}
        </div>

        {/* Auxiliary Controls (Resolution Preset, Mirror Mode, Camera Switcher) */}
        <div className="flex items-center justify-start sm:justify-end gap-2.5 flex-wrap">
          {/* Resolution Profile Selector (Balanced, Performance, High) */}
          <div className="relative flex items-center">
            <Sliders className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <select
              value={resolutionPreset}
              onChange={(e) => onSelectPreset(e.target.value as CameraResolutionPreset)}
              disabled={isPending}
              aria-label={t.resolutionLabel}
              className="min-h-[46px] pl-8 pr-7 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-medium text-slate-200 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40 appearance-none cursor-pointer"
            >
              <option value="balanced">{t.resolutionBalanced}</option>
              <option value="performance">{t.resolutionPerformance}</option>
              <option value="high">{t.resolutionHigh}</option>
            </select>
          </div>

          {/* Mirror Mode Toggle */}
          <button
            onClick={onToggleMirror}
            className={`min-h-[46px] px-3.5 rounded-xl text-xs font-medium flex items-center gap-2 border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 cursor-pointer ${
              isMirrored
                ? 'bg-slate-800 border-brand-500/50 text-brand-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            aria-label={t.mirrorToggle}
            title={t.mirrorToggle}
          >
            <FlipHorizontal className="w-4 h-4" />
            <span className="hidden md:inline">{t.mirrorToggle}</span>
          </button>

          {/* Device Dropdown (Shown only if multiple cameras exist) */}
          {devices.length > 1 && (
            <div className="relative flex items-center">
              <Video className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
              <select
                value={activeDeviceId}
                onChange={(e) => onSwitchDevice(e.target.value)}
                disabled={!isActive || isPending}
                aria-label={t.cameraSelectorLabel}
                className="min-h-[46px] pl-8 pr-7 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-medium text-slate-200 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer"
              >
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 5)}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Actual Resolution & Quality Telemetry Tag */}
      {isActive && actualResolution && (
        <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Active Feed:</span>
          <span className="font-mono text-slate-300">
            {actualResolution.width}×{actualResolution.height}
            {actualResolution.frameRate ? ` @ ${Math.round(actualResolution.frameRate)}fps` : ''}
          </span>
          <span className="text-slate-500">• Preset: {resolutionPreset}</span>
        </div>
      )}
    </div>
  );
};
