import React from 'react';
import { CameraState, CameraDeviceInfo } from '../../../types/camera';
import { LocalizedStrings } from '../../../types/i18n';
import { Play, Square, RotateCcw, Video, FlipHorizontal } from 'lucide-react';

interface CameraControlsProps {
  cameraState: CameraState;
  devices: CameraDeviceInfo[];
  activeDeviceId: string;
  isMirrored: boolean;
  t: LocalizedStrings;
  onStart: () => void;
  onStop: () => void;
  onSwitchDevice: (deviceId: string) => void;
  onToggleMirror: () => void;
}

export const CameraControls: React.FC<CameraControlsProps> = ({
  cameraState,
  devices,
  activeDeviceId,
  isMirrored,
  t,
  onStart,
  onStop,
  onSwitchDevice,
  onToggleMirror,
}) => {
  const isActive = cameraState === 'active';
  const isPending = cameraState === 'requesting-permission' || cameraState === 'initializing';

  return (
    <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-lg backdrop-blur-md">
      {/* Primary Action Button (Large accessible touch target >= 48px) */}
      <div className="w-full sm:w-auto flex items-center gap-3">
        {!isActive ? (
          <button
            onClick={onStart}
            disabled={isPending}
            className="w-full sm:w-auto min-h-[52px] px-8 rounded-xl font-semibold text-base flex items-center justify-center gap-3 transition-all duration-200 shadow-md focus:outline-none focus:ring-4 focus:ring-brand-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold"
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
        ) : (
          <button
            onClick={onStop}
            className="w-full sm:w-auto min-h-[52px] px-8 rounded-xl font-semibold text-base flex items-center justify-center gap-3 transition-all duration-200 shadow-md focus:outline-none focus:ring-4 focus:ring-rose-500/30 active:scale-95 bg-rose-600 hover:bg-rose-500 text-white"
            aria-label={t.stopCamera}
          >
            <Square className="w-5 h-5 fill-current" />
            <span>{t.stopCamera}</span>
          </button>
        )}
      </div>

      {/* Auxiliary Controls (Camera Switcher & Mirror Mode) */}
      <div className="w-full sm:w-auto flex items-center justify-end gap-3 flex-wrap">
        {/* Mirror Mode Toggle */}
        <button
          onClick={onToggleMirror}
          className={`min-h-[48px] px-4 rounded-xl text-sm font-medium flex items-center gap-2 border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 ${
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
            <Video className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
            <select
              value={activeDeviceId}
              onChange={(e) => onSwitchDevice(e.target.value)}
              disabled={!isActive}
              aria-label={t.cameraSelectorLabel}
              className="min-h-[48px] pl-9 pr-8 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-medium text-slate-200 hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer"
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
  );
};
