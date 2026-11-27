import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CameraState } from '../../../types/camera';
import { ExerciseDefinition, FormStatus, TrackingSnapshot, FeedbackCode } from '../types';
import { ELBOW_FLEXION_EXTENSION_REP } from '../config/exercises';
import { poseService, PoseDelegate } from '../../pose/services/poseService';
import { drawSkeleton } from '../../pose/utils/skeletonDrawer';
import { calculateElbowAngle } from '../utils/angleCalculator';
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
  isMirrored?: boolean;
  onToggleMirror?: () => void;
  showSkeleton?: boolean;
  onToggleSkeleton?: () => void;
  preferredDelegate?: PoseDelegate;
  onSnapshotUpdate?: (snapshot: Partial<TrackingSnapshot>) => void;
  onFrameProcessed?: (data: {
    angleDeg: number | null;
    formStatus: FormStatus;
    feedbackCode: FeedbackCode | null;
    confidence: number | null;
  }) => void;
  className?: string;
  allowCameraControls?: boolean;
}

/**
 * Reusable Video & Canvas Surface Component.
 * Reference: PRD Person 3 Specification (Section 8.4).
 *
 * Renders:
 * - Real-time camera feed.
 * - MediaPipe landmark joints.
 * - Dynamic skeleton lines with PRD color coding:
 *     Green = correct form
 *     Red = incorrect form
 *     Amber = insufficient data or tracking loss
 * - Live joint angle badge and target range indicator.
 * - Zero frame recording or external network transmission.
 */
export const PoseTrackingSurface: React.FC<PoseTrackingSurfaceProps> = ({
  stream,
  cameraState,
  definition = ELBOW_FLEXION_EXTENSION_REP,
  isMirrored = true,
  onToggleMirror,
  showSkeleton = true,
  onToggleSkeleton,
  preferredDelegate,
  onSnapshotUpdate,
  onFrameProcessed,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoFrameCallbackIdRef = useRef<number | null>(null);
  const hasVideoFrameCallbackRef = useRef<boolean>(false);
  const hasNewVideoFrameRef = useRef<boolean>(false);

  // Model & Inference states
  const [modelLoading, setModelLoading] = useState<boolean>(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [internalMirrored, setInternalMirrored] = useState<boolean>(isMirrored);
  const [internalShowSkeleton, setInternalShowSkeleton] = useState<boolean>(showSkeleton);

  const activeMirrored = onToggleMirror ? isMirrored : internalMirrored;
  const activeShowSkeleton = onToggleSkeleton ? showSkeleton : internalShowSkeleton;

  // Tracking measurements
  const [currentAngle, setCurrentAngle] = useState<number | null>(null);
  const [formStatus, setFormStatus] = useState<FormStatus>('neutral');
  const [feedbackCode, setFeedbackCode] = useState<FeedbackCode | null>(null);
  const [cameraFps, setCameraFps] = useState<number>(0);
  const [inferenceFps, setInferenceFps] = useState<number>(0);
  const [avgLatency, setAvgLatency] = useState<number>(0);
  const [activeDelegate, setActiveDelegate] = useState<PoseDelegate | null>(null);

  const resolvedDelegate: PoseDelegate = (() => {
    if (preferredDelegate) return preferredDelegate;
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('delegate');
      if (param?.toUpperCase() === 'CPU') return 'CPU';
    }
    return 'GPU';
  })();

  // 1. Initialize local MediaPipe model
  useEffect(() => {
    let cancelled = false;

    async function initModel() {
      try {
        setModelLoading(true);
        setModelError(null);
        await poseService.initialize(resolvedDelegate);
        if (!cancelled) {
          setActiveDelegate(poseService.getActiveDelegate());
          setModelLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          console.error('Failed to initialize pose landmarker:', err);
          const msg = err instanceof Error ? err.message : 'Failed to initialize local pose model';
          setModelError(msg);
          setModelLoading(false);
        }
      }
    }

    initModel();

    return () => {
      cancelled = true;
      poseService.close();
    };
  }, [resolvedDelegate]);

  // 2. Attach MediaStream to Video element
  useEffect(() => {
    const video = videoRef.current as (HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    }) | null;
    if (!video) return;

    let cancelled = false;

    if (stream && cameraState === 'active') {
      video.srcObject = stream;
      video.play().catch((playErr) => {
        console.warn('Video auto-play interrupted:', playErr);
      });

      if (typeof video.requestVideoFrameCallback === 'function') {
        hasVideoFrameCallbackRef.current = true;
        hasNewVideoFrameRef.current = true;
        const onVideoFrame = () => {
          if (cancelled) return;
          hasNewVideoFrameRef.current = true;
          poseService.recordCameraFrame(performance.now());
          videoFrameCallbackIdRef.current = video.requestVideoFrameCallback!(onVideoFrame);
        };
        videoFrameCallbackIdRef.current = video.requestVideoFrameCallback(onVideoFrame);
      } else {
        hasVideoFrameCallbackRef.current = false;
      }
    } else {
      video.srcObject = null;
      hasVideoFrameCallbackRef.current = false;
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    return () => {
      cancelled = true;
      if (
        videoFrameCallbackIdRef.current !== null &&
        typeof video.cancelVideoFrameCallback === 'function'
      ) {
        video.cancelVideoFrameCallback(videoFrameCallbackIdRef.current);
        videoFrameCallbackIdRef.current = null;
      }
    };
  }, [stream, cameraState]);

  // 3. Processing and Canvas Drawing Single Frame Function
  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (
      video &&
      canvas &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0 &&
      !video.paused &&
      !video.ended &&
      cameraState === 'active'
    ) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        const shouldRun = !hasVideoFrameCallbackRef.current || hasNewVideoFrameRef.current;

        if (shouldRun) {
          hasNewVideoFrameRef.current = false;
          const detection = poseService.detectVideoFrame(video, hasVideoFrameCallbackRef.current);

          if (detection.isNewFrame) {
            let evaluatedAngle: number | null = null;
            let currentForm: FormStatus;
            let activeFeedback: FeedbackCode | null;
            let confidenceScore: number | null = null;

            if (detection.landmarks && detection.landmarks.length > 0) {
              const mapped = detection.mappedJoints;
              const isRight = definition.side === 'right';
              const shoulder = isRight ? mapped?.rightShoulder : mapped?.leftShoulder;
              const elbow = isRight ? mapped?.rightElbow : mapped?.leftElbow;
              const wrist = isRight ? mapped?.rightWrist : mapped?.leftWrist;

              const angleResult = calculateElbowAngle(shoulder, elbow, wrist, {
                width: canvas.width,
                height: canvas.height,
              });

              evaluatedAngle = angleResult.angleDeg;
              confidenceScore = angleResult.confidenceScore;

              if (!angleResult.isReliable || evaluatedAngle === null) {
                currentForm = 'insufficient_data';
                activeFeedback = 'POSE_NOT_CLEAR';
              } else {
                const isHoldMode = definition.mode === 'hold';
                const tolerance = definition.angle.toleranceDeg;
                const inTarget =
                  evaluatedAngle >= definition.angle.targetRangeDeg[0] - tolerance &&
                  evaluatedAngle <= definition.angle.targetRangeDeg[1] + tolerance;

                if (isHoldMode) {
                  currentForm = inTarget ? 'correct' : 'needs-adjustment';
                  activeFeedback = inTarget ? 'TARGET_REACHED' : 'MOVE_TOWARD_TARGET';
                } else {
                  const inStart =
                    evaluatedAngle >= definition.angle.startRangeDeg[0] - tolerance &&
                    evaluatedAngle <= definition.angle.startRangeDeg[1] + tolerance;

                  if (inTarget || inStart) {
                    currentForm = 'correct';
                    activeFeedback = inTarget ? 'TARGET_REACHED' : 'MOVE_TOWARD_TARGET';
                  } else {
                    currentForm = 'needs-adjustment';
                    activeFeedback = 'FORM_OUT_OF_RANGE';
                  }
                }
              }

              if (activeShowSkeleton) {
                drawSkeleton(ctx, detection.landmarks, canvas.width, canvas.height, {
                  mirrored: activeMirrored,
                  minVisibility: 0.45,
                  formStatus: currentForm,
                  angleDeg: evaluatedAngle,
                  side: definition.side,
                  showAngleBadge: true,
                  showAngleArc: true,
                  highlightArm: true,
                });
              } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
              }
            } else {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              currentForm = 'insufficient_data';
              activeFeedback = 'PERSON_NOT_VISIBLE';
            }

            setCurrentAngle(evaluatedAngle);
            setFormStatus(currentForm);
            setFeedbackCode(activeFeedback);
            setCameraFps(detection.cameraFps);
            setInferenceFps(detection.inferenceFps);
            setAvgLatency(detection.avgInferenceTimeMs);
            if (detection.activeDelegate) {
              setActiveDelegate(detection.activeDelegate);
            }

            if (onFrameProcessed) {
              onFrameProcessed({
                angleDeg: evaluatedAngle,
                formStatus: currentForm,
                feedbackCode: activeFeedback,
                confidence: confidenceScore,
              });
            }

            if (onSnapshotUpdate) {
              onSnapshotUpdate({
                angleDeg: evaluatedAngle,
                formStatus: currentForm,
                feedbackCode: activeFeedback,
                confidence: confidenceScore,
                fps: detection.inferenceFps,
              });
            }
          }
        }
      }
    }
  }, [
    activeMirrored,
    activeShowSkeleton,
    cameraState,
    definition,
    onFrameProcessed,
    onSnapshotUpdate,
  ]);

  useEffect(() => {
    if (cameraState !== 'active' || modelLoading) return;

    let animId: number;
    const loop = () => {
      processFrame();
      animId = requestAnimationFrame(loop);
    };
    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [cameraState, modelLoading, processFrame]);

  // Form Status Badge Styles
  const getFormStatusBadge = () => {
    switch (formStatus) {
      case 'correct':
        return {
          text: 'CORRECT FORM',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-300" />,
          classes: 'bg-emerald-950/85 text-emerald-200 border-emerald-500/70 shadow-emerald-900/40',
        };
      case 'incorrect':
      case 'needs-adjustment':
        return {
          text: 'ADJUST POSTURE',
          icon: <AlertTriangle className="w-4 h-4 text-rose-300" />,
          classes: 'bg-rose-950/85 text-rose-200 border-rose-500/70 shadow-rose-900/40',
        };
      case 'insufficient_data':
        return {
          text: 'INSUFFICIENT DATA (ARM UNCLEAR)',
          icon: <AlertCircle className="w-4 h-4 text-amber-300" />,
          classes: 'bg-amber-950/85 text-amber-200 border-amber-500/70 shadow-amber-900/40',
        };
      case 'neutral':
      default:
        return {
          text: 'READY',
          icon: <RefreshCw className="w-4 h-4 text-sky-300" />,
          classes: 'bg-slate-900/85 text-sky-200 border-sky-500/50 shadow-slate-900/40',
        };
    }
  };

  const statusBadge = getFormStatusBadge();

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

      {/* 3. Inactive / Interrupted / Error Camera Fallback */}
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
              ? 'Requesting Camera Permission'
              : cameraState === 'initializing'
              ? 'Initializing Camera Stream...'
              : cameraState === 'interrupted'
              ? 'Camera Stream Interrupted'
              : cameraState === 'permission_denied'
              ? 'Camera Permission Denied'
              : cameraState === 'unavailable'
              ? 'Camera Unavailable'
              : cameraState === 'error'
              ? 'Camera Error Encountered'
              : 'Camera is Idle'}
          </h3>
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            {cameraState === 'interrupted'
              ? 'The camera feed was interrupted (tab switched or device busy). Click Resume below.'
              : cameraState === 'permission_denied'
              ? 'Camera access was blocked. Please grant camera permission in your browser.'
              : cameraState === 'unavailable'
              ? 'No working video camera device found on this system.'
              : cameraState === 'requesting_permission'
              ? 'Please click "Allow" in your browser prompt to activate motion tracking.'
              : 'Click "Start Camera" to activate real-time rehabilitation tracking.'}
          </p>
          <div className="flex items-center gap-2 text-xs text-brand-300/80 bg-brand-950/60 px-3 py-1.5 rounded-full border border-brand-800/50">
            <ShieldCheck className="w-4 h-4 text-brand-400" />
            <span>Zero video leaves this browser • On-device processing</span>
          </div>
        </div>
      )}

      {/* 4. Model Loading Overlay */}
      {modelLoading && cameraState === 'active' && (
        <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <RefreshCw className="w-8 h-8 text-brand-400 animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-300">
            Loading on-device MediaPipe Pose model...
          </p>
          <span className="text-xs text-slate-500 mt-1">Locally cached WASM & Tasks Vision</span>
        </div>
      )}

      {/* 5. Live HUD Overlays (Active Mode) */}
      {cameraState === 'active' && !modelLoading && (
        <>
          {/* Top-Left: Form Status Pill */}
          <div className="absolute top-3 left-3 z-30 flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide border shadow-lg backdrop-blur-md transition-all duration-200 ${statusBadge.classes}`}
              data-testid="form-status-badge"
            >
              {statusBadge.icon}
              <span>{statusBadge.text}</span>
            </div>
          </div>

          {/* Top-Right: Current Angle Readout & Quick Surface Controls */}
          <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
            {/* Angle Badge */}
            {currentAngle !== null && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-bold bg-slate-900/90 text-white border border-slate-700 shadow-lg backdrop-blur-md"
                data-testid="angle-readout"
              >
                <span className="text-slate-400 font-sans text-[11px]">Angle:</span>
                <span className="text-brand-300 text-sm">{Math.round(currentAngle)}°</span>
              </div>
            )}

            {/* Mirror Toggle */}
            <button
              type="button"
              onClick={() => {
                if (onToggleMirror) onToggleMirror();
                else setInternalMirrored((prev) => !prev);
              }}
              title={activeMirrored ? 'Disable Mirroring' : 'Enable Mirroring'}
              className="p-1.5 rounded-full bg-slate-900/80 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md transition"
              aria-label="Toggle camera mirroring"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>

            {/* Skeleton Overlay Toggle */}
            <button
              type="button"
              onClick={() => {
                if (onToggleSkeleton) onToggleSkeleton();
                else setInternalShowSkeleton((prev) => !prev);
              }}
              title={activeShowSkeleton ? 'Hide Skeleton Overlay' : 'Show Skeleton Overlay'}
              className="p-1.5 rounded-full bg-slate-900/80 text-slate-300 hover:text-white border border-slate-700/80 backdrop-blur-md transition"
              aria-label="Toggle skeleton overlay"
            >
              {activeShowSkeleton ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>

          {/* Bottom-Center: Structured Feedback Code Banner */}
          {feedbackCode && (
            <div className="absolute bottom-3 inset-x-4 z-30 flex justify-center pointer-events-none">
              <div
                className="px-4 py-1.5 rounded-full text-xs font-mono font-semibold tracking-wider bg-slate-950/90 text-brand-300 border border-brand-500/40 shadow-xl backdrop-blur-md"
                data-testid="feedback-code-badge"
              >
                CODE: {feedbackCode}
              </div>
            </div>
          )}

          {/* Bottom-Right: Frame Telemetry */}
          <div
            className="absolute bottom-3 right-3 z-30 flex items-center gap-2 bg-slate-950/80 border border-slate-800 text-slate-400 px-2.5 py-1 rounded-md text-[11px] font-mono backdrop-blur-md"
            data-testid="pose-telemetry"
          >
            <span>Cam {cameraFps}</span>
            <span className="text-slate-700">•</span>
            <span>Pose {inferenceFps} FPS</span>
            <span className="text-slate-700">•</span>
            <span>{avgLatency}ms</span>
            {activeDelegate && <span className="text-brand-400 font-bold">[{activeDelegate}]</span>}
          </div>
        </>
      )}

      {/* 6. Model Error Display */}
      {modelError && (
        <div className="absolute bottom-3 inset-x-3 z-30 bg-rose-950/95 border border-rose-800 text-rose-200 p-3 rounded-xl flex items-center gap-3 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <span>Model Error: {modelError}</span>
        </div>
      )}
    </div>
  );
};
