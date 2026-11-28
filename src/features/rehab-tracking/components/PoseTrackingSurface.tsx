import React, { useRef, useEffect, useState } from 'react';
import { CameraState } from '../../../types/camera';
import {
  ExerciseDefinition,
  FormStatus,
  TrackingSnapshot,
  RehabTrackingController,
} from '../types';
import { ELBOW_FLEXION_EXTENSION_REP } from '../config/exercises';
import { PoseDelegate, MappedRehabilitationJoints } from '../../pose/services/poseService';
import {
  RehabTrackingControllerImpl,
  ControllerTelemetryUpdate,
} from '../services/rehabTrackingController';
import { LocalizedStrings } from '../../../types/i18n';
import { en } from '../../../locales/en';
import {
  Camera,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FlipHorizontal,
  Eye,
  EyeOff,
} from 'lucide-react';

export interface PoseTrackingSurfaceProps {
  stream: MediaStream | null;
  cameraState: CameraState;
  definition?: ExerciseDefinition;
  controller?: RehabTrackingController;
  t?: LocalizedStrings;
  isMirrored?: boolean;
  onToggleMirror?: () => void;
  showSkeleton?: boolean;
  onToggleSkeleton?: () => void;
  preferredDelegate?: PoseDelegate;
  onSnapshotUpdate?: (snapshot: TrackingSnapshot) => void;
  onTelemetryUpdate?: (telemetry: ControllerTelemetryUpdate) => void;
  className?: string;
}

/**
 * Reusable Video & Canvas Surface Component (PRD Section 8.4).
 *
 * Delegates ALL pose evaluation, state transitions, and canvas skeleton drawing
 * to `RehabTrackingControllerImpl` (single source of truth).
 * React state updates only upon throttled `TrackingSnapshot` emissions (~8 Hz).
 */
export const PoseTrackingSurface: React.FC<PoseTrackingSurfaceProps> = ({
  stream,
  cameraState,
  definition = ELBOW_FLEXION_EXTENSION_REP,
  controller: externalController,
  t = en,
  isMirrored = true,
  onToggleMirror,
  showSkeleton = true,
  onToggleSkeleton,
  preferredDelegate,
  onSnapshotUpdate,
  onTelemetryUpdate,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [defaultController] = useState<RehabTrackingControllerImpl>(
    () =>
      new RehabTrackingControllerImpl(definition, {
        mirrored: isMirrored,
        showSkeleton,
        preferredDelegate,
      })
  );

  const activeController = externalController ?? defaultController;

  const [internalMirrored, setInternalMirrored] = useState<boolean>(isMirrored);
  const [internalShowSkeleton, setInternalShowSkeleton] = useState<boolean>(showSkeleton);

  const activeMirrored = onToggleMirror ? isMirrored : internalMirrored;
  const activeShowSkeleton = onToggleSkeleton ? showSkeleton : internalShowSkeleton;

  const [snapshot, setSnapshot] = useState<TrackingSnapshot>(() => activeController.getSnapshot());
  const [modelLoading, setModelLoading] = useState<boolean>(false);
  const [controllerReady, setControllerReady] = useState<boolean>(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<ControllerTelemetryUpdate>({
    cameraFps: 0,
    inferenceFps: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    activeDelegate: null,
    mappedJoints: null,
  });

  // Sync render options cleanly without recreating controller
  useEffect(() => {
    if (activeController instanceof RehabTrackingControllerImpl) {
      activeController.setRenderOptions({
        mirrored: activeMirrored,
        showSkeleton: activeShowSkeleton,
        preferredDelegate,
      });
    }
  }, [activeController, activeMirrored, activeShowSkeleton, preferredDelegate]);

  // Subscribe to throttled TrackingSnapshots and Telemetry updates
  useEffect(() => {
    const unsubSnapshot = activeController.subscribe((nextSnap) => {
      setSnapshot(nextSnap);
      if (nextSnap.status === 'error' && nextSnap.errorCode) {
        setModelError(nextSnap.errorCode);
        setModelLoading(false);
      } else if (nextSnap.status === 'ready' || nextSnap.status === 'tracking') {
        setModelLoading(false);
      }
      onSnapshotUpdate?.(nextSnap);
    });

    let unsubTelemetry: (() => void) | undefined;
    if (activeController instanceof RehabTrackingControllerImpl) {
      unsubTelemetry = activeController.subscribeTelemetry((nextTel) => {
        setTelemetry(nextTel);
        onTelemetryUpdate?.(nextTel);
      });
    }

    return () => {
      unsubSnapshot();
      unsubTelemetry?.();
    };
  }, [activeController, onSnapshotUpdate, onTelemetryUpdate]);

  // Clean up internally created controller on unmount only
  useEffect(() => {
    return () => {
      if (!externalController) {
        void defaultController.dispose();
      }
    };
  }, [externalController, defaultController]);

  // Attach MediaStream to <video> and run controller lifecycle when camera is active
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    let cancelled = false;

    async function startControllerSession() {
      if (stream && cameraState === 'active') {
        setControllerReady(false);
        setModelLoading(true);
        setModelError(null);

        video!.srcObject = stream;
        try {
          await video!.play();
        } catch (playErr) {
          console.warn('Video auto-play interrupted:', playErr);
        }

        if (cancelled) return;

        try {
          await activeController.attachMedia(video!, canvas!);
          await activeController.startExercise(definition);
          if (!cancelled) {
            setControllerReady(true);
            setModelLoading(false);
          }
        } catch (err: unknown) {
          if (!cancelled) {
            const msg = err instanceof Error ? err.message : 'Failed to initialize tracking';
            setModelError(msg);
            setControllerReady(false);
            setModelLoading(false);
          }
        }
      } else {
        video!.srcObject = null;
        const ctx = canvas!.getContext('2d');
        ctx?.clearRect(0, 0, canvas!.width, canvas!.height);
        setControllerReady(false);
        setModelLoading(false);
        if (activeController instanceof RehabTrackingControllerImpl) {
          activeController.pause('SESSION_PAUSED');
        }
      }
    }

    void startControllerSession();

    return () => {
      cancelled = true;
    };
  }, [stream, cameraState, definition, activeController]);

  // Localized / structured form status badge styling
  const getFormStatusBadge = (status: FormStatus) => {
    switch (status) {
      case 'correct':
        return {
          text: 'FORM: CORRECT',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-300" />,
          classes: 'bg-emerald-950/85 text-emerald-200 border-emerald-500/70 shadow-emerald-900/40',
        };
      case 'incorrect':
      case 'needs-adjustment':
        return {
          text: 'FORM: OUT OF RANGE',
          icon: <AlertTriangle className="w-4 h-4 text-rose-300" />,
          classes: 'bg-rose-950/85 text-rose-200 border-rose-500/70 shadow-rose-900/40',
        };
      case 'insufficient_data':
        return {
          text: t.statusLowConfidence,
          icon: <AlertCircle className="w-4 h-4 text-amber-300" />,
          classes: 'bg-amber-950/85 text-amber-200 border-amber-500/70 shadow-amber-900/40',
        };
      case 'neutral':
      case 'not_evaluated':
      default:
        return {
          text: t.statusTrackingStable,
          icon: <RefreshCw className="w-4 h-4 text-sky-300" />,
          classes: 'bg-slate-900/85 text-sky-200 border-sky-500/50 shadow-slate-900/40',
        };
    }
  };

  const statusBadge = getFormStatusBadge(snapshot.formStatus);

  return (
    <div
      className={`relative w-full aspect-[4/3] md:aspect-[16/9] max-h-[500px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center select-none ${className}`}
      data-testid="pose-tracking-surface"
      data-mirrored={activeMirrored ? 'true' : 'false'}
    >
      {/* 1. Underlying HTML5 Video Stream */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          cameraState === 'active' ? 'opacity-100' : 'opacity-0'
        } ${activeMirrored ? 'scale-x-[-1]' : ''}`}
        aria-label="Real-time rehabilitation video stream"
      />

      {/* 2. Dynamic High-Performance 2D Canvas Skeleton Overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
        aria-hidden="true"
      />

      {/* 3. Inactive / Interrupted / Error Camera Fallback (Localized via `t`) */}
      {cameraState !== 'active' && (
        <div className="relative z-20 flex flex-col items-center justify-center p-6 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-slate-900/90 border border-slate-700 flex items-center justify-center mb-4 text-brand-400 shadow-inner">
            {cameraState === 'interrupted' ? (
              <AlertCircle className="w-8 h-8 text-amber-400" />
            ) : cameraState === 'permission_denied' || cameraState === 'unavailable' || cameraState === 'error' ? (
              <AlertCircle className="w-8 h-8 text-rose-400" />
            ) : cameraState === 'requesting_permission' || cameraState === 'initializing' ? (
              <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
            ) : (
              <Camera className="w-8 h-8" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">
            {cameraState === 'requesting_permission'
              ? t.requestingPermission
              : cameraState === 'initializing'
              ? t.cameraReady
              : cameraState === 'interrupted'
              ? t.cameraInterruptedTitle
              : cameraState === 'permission_denied'
              ? t.permissionDeniedTitle
              : cameraState === 'unavailable'
              ? t.cameraNotFoundTitle
              : cameraState === 'error'
              ? t.genericErrorTitle
              : t.cameraReady}
          </h3>
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            {cameraState === 'interrupted'
              ? t.cameraInterruptedMsg
              : cameraState === 'permission_denied'
              ? t.permissionDeniedMsg
              : cameraState === 'unavailable'
              ? t.cameraNotFoundMsg
              : cameraState === 'error'
              ? t.genericErrorMsg
              : cameraState === 'requesting_permission'
              ? t.requestingPermission
              : t.cameraOff}
          </p>
          <div className="flex items-center gap-2 text-xs text-brand-300/80 bg-brand-950/60 px-3 py-1.5 rounded-full border border-brand-800/50">
            <ShieldCheck className="w-4 h-4 text-brand-400" />
            <span>{t.privacyBadge}</span>
          </div>
        </div>
      )}

      {/* 4. Model Loading Overlay */}
      {modelLoading && cameraState === 'active' && (
        <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <RefreshCw className="w-8 h-8 text-brand-400 animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-300">
            MediaPipe WASM / PoseLandmarker...
          </p>
        </div>
      )}

      {/* 5. Live HUD Overlays (Active Mode) */}
      {cameraState === 'active' && !modelLoading && controllerReady && (
        <>
          <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide border shadow-lg backdrop-blur-md transition-all duration-200 ${statusBadge.classes}`}
              role="status"
              aria-live="polite"
              data-testid="form-status-badge"
            >
              {statusBadge.icon}
              <span>{statusBadge.text}</span>
            </div>
          </div>

          <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
            {snapshot.angleDeg !== null && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold bg-slate-900/90 text-white border border-slate-700 shadow-lg backdrop-blur-md"
                data-testid="angle-readout"
              >
                <span className="text-brand-300 text-sm">{Math.round(snapshot.angleDeg)}°</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (onToggleMirror) onToggleMirror();
                else setInternalMirrored((prev) => !prev);
              }}
              title={t.mirrorToggle}
              className="p-1.5 rounded-full bg-slate-900/80 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md transition"
              aria-label="Toggle camera mirroring"
              aria-pressed={activeMirrored}
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (onToggleSkeleton) onToggleSkeleton();
                else setInternalShowSkeleton((prev) => !prev);
              }}
              title={activeShowSkeleton ? 'Hide Skeleton Overlay' : 'Show Skeleton Overlay'}
              className="p-1.5 rounded-full bg-slate-900/80 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md transition"
              aria-label="Toggle skeleton overlay"
              aria-pressed={activeShowSkeleton}
            >
              {activeShowSkeleton ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>

          {snapshot.feedbackCode && (
            <div className="absolute bottom-12 sm:bottom-3 inset-x-4 z-30 flex justify-center pointer-events-none">
              <div
                className="px-4 py-1.5 rounded-full text-xs font-mono font-semibold tracking-wider bg-slate-950/90 text-brand-300 border border-brand-500/40 shadow-xl backdrop-blur-md"
                data-testid="feedback-code-badge"
              >
                CODE: {snapshot.feedbackCode}
              </div>
            </div>
          )}

          <div
            className="absolute bottom-3 right-3 z-30 flex items-center gap-2 bg-slate-950/80 border border-slate-800 text-slate-400 px-2.5 py-1 rounded-md text-[11px] font-mono backdrop-blur-md"
            data-testid="pose-telemetry"
          >
            <span>Cam {telemetry.cameraFps}</span>
            <span className="text-slate-700">•</span>
            <span>Pose {telemetry.inferenceFps} {t.fpsLabel}</span>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <span className="hidden sm:inline">
              Avg {telemetry.avgLatencyMs}ms (P95 {telemetry.p95LatencyMs}ms)
            </span>
            {telemetry.activeDelegate && (
              <span className="text-brand-400 font-bold">[{telemetry.activeDelegate}]</span>
            )}
          </div>
        </>
      )}

      {/* 6. Model Error Display */}
      {modelError && (
        <div className="absolute bottom-3 inset-x-3 z-30 bg-rose-950/95 border border-rose-800 text-rose-200 p-3 rounded-xl flex items-center gap-3 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <span>{modelError}</span>
        </div>
      )}
    </div>
  );
};

export type { MappedRehabilitationJoints };
