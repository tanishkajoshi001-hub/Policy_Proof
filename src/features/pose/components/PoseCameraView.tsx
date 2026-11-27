import React, { useRef, useEffect, useState, useCallback } from 'react';
import { poseService, PoseDelegate } from '../services/poseService';
import { drawSkeleton } from '../utils/skeletonDrawer';
import { TrackingStatus, PoseFrameMetrics } from '../../../types/pose';
import { CameraState } from '../../../types/camera';
import { LocalizedStrings } from '../../../types/i18n';
import { Camera, RefreshCw, AlertCircle, ShieldCheck, Activity } from 'lucide-react';

interface PoseCameraViewProps {
  stream: MediaStream | null;
  cameraState: CameraState;
  t: LocalizedStrings;
  isMirrored?: boolean;
  preferredDelegate?: PoseDelegate;
  onMetricsUpdate?: (metrics: PoseFrameMetrics) => void;
}

export const PoseCameraView: React.FC<PoseCameraViewProps> = ({
  stream,
  cameraState,
  t,
  isMirrored = true,
  preferredDelegate,
  onMetricsUpdate,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const videoFrameCallbackIdRef = useRef<number | null>(null);
  const hasVideoFrameCallbackRef = useRef<boolean>(false);
  const hasNewVideoFrameRef = useRef<boolean>(false);

  const [modelLoading, setModelLoading] = useState<boolean>(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('idle');
  const [cameraFps, setCameraFps] = useState<number>(0);
  const [inferenceFps, setInferenceFps] = useState<number>(0);
  const [avgLatency, setAvgLatency] = useState<number>(0);
  const [p95Latency, setP95Latency] = useState<number>(0);
  const [activeDelegate, setActiveDelegate] = useState<PoseDelegate | null>(null);

  // Throttling React state updates so we don't spam 30 re-renders per second
  const lastStateUpdateRef = useRef<number>(0);
  const lastStatusRef = useRef<TrackingStatus>('idle');

  const resolvedDelegate: PoseDelegate = (() => {
    if (preferredDelegate) return preferredDelegate;
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('delegate');
      if (param?.toUpperCase() === 'CPU') return 'CPU';
    }
    return 'GPU';
  })();

  // 1. Initialize MediaPipe PoseLandmarker model on mount
  useEffect(() => {
    let isCancelled = false;

    async function loadModel() {
      try {
        setModelLoading(true);
        setModelError(null);
        await poseService.initialize(resolvedDelegate);
        if (!isCancelled) {
          setActiveDelegate(poseService.getActiveDelegate());
          setModelLoading(false);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          console.error('Pose model loading failed:', err);
          const msg = err instanceof Error ? err.message : 'Failed to load local pose model.';
          setModelError(msg);
          setModelLoading(false);
        }
      }
    }

    loadModel();

    return () => {
      isCancelled = true;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      poseService.close();
    };
  }, [resolvedDelegate]);

  // 2. Attach MediaStream to Video element & measure Camera FPS via requestVideoFrameCallback
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
      setTrackingStatus('idle');
      setCameraFps(0);
      setInferenceFps(0);
      setAvgLatency(0);
      setP95Latency(0);
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

  // 3. High-Performance Frame Detection & Skeleton Rendering Loop
  const renderFrameLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (
      video &&
      canvas &&
      video.readyState >= 2 &&
      !video.paused &&
      !video.ended &&
      cameraState === 'active'
    ) {
      // Sync canvas internal resolution with actual video stream dimensions
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
      }

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // When requestVideoFrameCallback is active, only run inference when a new camera frame arrives
        const shouldRunInference =
          !hasVideoFrameCallbackRef.current || hasNewVideoFrameRef.current;

        if (shouldRunInference) {
          hasNewVideoFrameRef.current = false;
          const detection = poseService.detectVideoFrame(
            video,
            hasVideoFrameCallbackRef.current
          );

          // Draw skeleton only when a new inference runs, or keep current canvas when skipped
          if (detection.isNewFrame) {
            if (detection.landmarks && detection.landmarks.length > 0) {
              drawSkeleton(ctx, detection.landmarks, canvas.width, canvas.height, {
                mirrored: isMirrored,
                minVisibility: 0.45,
              });
            } else {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }

            const { trackingStatus: currentStatus, keyJoints } = poseService.evaluateKeyJoints(
              detection.landmarks
            );

            // Throttle React state update to ~3 Hz or upon status transition
            const now = performance.now();
            if (now - lastStateUpdateRef.current > 350 || currentStatus !== lastStatusRef.current) {
              lastStateUpdateRef.current = now;
              lastStatusRef.current = currentStatus;
              setTrackingStatus(currentStatus);
              setCameraFps(detection.cameraFps);
              setInferenceFps(detection.inferenceFps);
              setAvgLatency(detection.avgInferenceTimeMs);
              setP95Latency(detection.p95InferenceTimeMs);
              if (detection.activeDelegate) {
                setActiveDelegate(detection.activeDelegate);
              }

              if (onMetricsUpdate) {
                onMetricsUpdate({
                  fps: detection.inferenceFps,
                  cameraFps: detection.cameraFps,
                  inferenceFps: detection.inferenceFps,
                  inferenceTimeMs: detection.inferenceTimeMs,
                  avgInferenceTimeMs: detection.avgInferenceTimeMs,
                  p95InferenceTimeMs: detection.p95InferenceTimeMs,
                  activeDelegate: detection.activeDelegate,
                  trackingStatus: currentStatus,
                  keyJointsVisible: keyJoints,
                  landmarkCount: detection.landmarks?.length || 0,
                  timestamp: Date.now(),
                });
              }
            }
          }
        }
      }
    }

    if (cameraState === 'active') {
      animFrameIdRef.current = requestAnimationFrame(renderFrameLoop);
    }
  }, [cameraState, isMirrored, onMetricsUpdate]);

  useEffect(() => {
    if (cameraState === 'active' && !modelLoading) {
      animFrameIdRef.current = requestAnimationFrame(renderFrameLoop);
    }

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, [cameraState, modelLoading, renderFrameLoop]);

  // Status badge helper
  const getStatusDisplay = () => {
    switch (trackingStatus) {
      case 'tracking-stable':
        return {
          text: t.statusTrackingStable,
          color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          dot: 'bg-emerald-400',
        };
      case 'partially-visible':
        return {
          text: t.statusPartiallyVisible,
          color: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          dot: 'bg-amber-400',
        };
      case 'low-confidence':
        return {
          text: t.statusLowConfidence,
          color: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
          dot: 'bg-orange-400',
        };
      case 'no-person':
        return {
          text: t.statusNoPerson,
          color: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          dot: 'bg-rose-400',
        };
      case 'idle':
      default:
        return {
          text: t.statusIdle,
          color: 'bg-slate-800/80 text-slate-400 border-slate-700',
          dot: 'bg-slate-500',
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="relative w-full aspect-[4/3] md:aspect-[16/9] max-h-[480px] lg:max-h-[500px] bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
      {/* 1. Underlying Camera Video Stream */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          cameraState === 'active' ? 'opacity-100' : 'opacity-0'
        } ${isMirrored ? 'scale-x-[-1]' : ''}`}
        aria-label="Live patient camera feed"
      />

      {/* 2. Overlaid High-Performance 2D Skeleton Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
        aria-hidden="true"
      />

      {/* 3. Inactive or Loading State Backdrop */}
      {cameraState !== 'active' && (
        <div className="relative z-20 flex flex-col items-center justify-center p-6 text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-center mb-4 text-brand-400 shadow-inner">
            {cameraState === 'interrupted' ? (
              <AlertCircle className="w-8 h-8 text-amber-400" />
            ) : cameraState === 'permission_denied' ||
              cameraState === 'unavailable' ||
              cameraState === 'error' ||
              cameraState === 'permission-denied' ||
              cameraState === 'camera-unavailable' ? (
              <AlertCircle className="w-8 h-8 text-rose-400" />
            ) : cameraState === 'requesting_permission' ||
              cameraState === 'initializing' ||
              cameraState === 'requesting-permission' ? (
              <RefreshCw className="w-8 h-8 text-brand-400 animate-spin" />
            ) : (
              <Camera className="w-8 h-8" />
            )}
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">
            {cameraState === 'requesting_permission' || cameraState === 'requesting-permission'
              ? t.requestingPermission
              : cameraState === 'initializing'
              ? 'Initializing camera stream...'
              : cameraState === 'interrupted'
              ? t.cameraInterruptedTitle
              : cameraState === 'permission_denied' || cameraState === 'permission-denied'
              ? t.permissionDeniedTitle
              : cameraState === 'unavailable' || cameraState === 'camera-unavailable'
              ? t.cameraNotFoundTitle
              : cameraState === 'error'
              ? t.genericErrorTitle
              : t.cameraReady}
          </h3>
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            {cameraState === 'interrupted'
              ? t.cameraInterruptedMsg
              : cameraState === 'permission_denied' || cameraState === 'permission-denied'
              ? t.permissionDeniedMsg
              : cameraState === 'unavailable' || cameraState === 'camera-unavailable'
              ? t.cameraNotFoundMsg
              : cameraState === 'error'
              ? t.genericErrorMsg
              : cameraState === 'requesting_permission' || cameraState === 'requesting-permission'
              ? 'Please select "Allow" in your browser prompt to begin.'
              : t.cameraOff}
          </p>
          <div className="flex items-center gap-2 text-xs text-brand-300/80 bg-brand-950/60 px-3 py-1.5 rounded-full border border-brand-800/50">
            <ShieldCheck className="w-4 h-4 text-brand-400" />
            <span>{t.privacyBadge}</span>
          </div>
        </div>
      )}

      {/* 4. Model Loading Indicator */}
      {modelLoading && cameraState === 'active' && (
        <div className="absolute inset-0 z-30 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <RefreshCw className="w-8 h-8 text-brand-400 animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-300">
            Initializing on-device AI pose engine...
          </p>
        </div>
      )}

      {/* 5. Live HUD Overlays (Top Bar) */}
      {cameraState === 'active' && !modelLoading && (
        <div className="absolute top-3 inset-x-3 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          {/* Status Badge */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide border shadow-lg backdrop-blur-md transition-all duration-300 ${statusDisplay.color}`}
            role="status"
            aria-live="polite"
            data-testid="tracking-status"
          >
            <span className={`w-2 h-2 rounded-full animate-pulse ${statusDisplay.dot}`} />
            <span>{statusDisplay.text}</span>
          </div>

          {/* Performance Telemetry (Camera FPS, Pose FPS, Avg/P95 Latency, Delegate) */}
          <div
            className="flex items-center gap-2 bg-slate-900/85 border border-slate-700/80 text-slate-300 px-3 py-1.5 rounded-full text-xs font-mono shadow-md backdrop-blur-md"
            data-testid="pose-telemetry"
          >
            <Activity className="w-3.5 h-3.5 text-brand-400" />
            <span>Cam {cameraFps}</span>
            <span className="text-slate-600">|</span>
            <span>Pose {inferenceFps} {t.fpsLabel}</span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="hidden sm:inline">Avg {avgLatency}ms (P95 {p95Latency}ms)</span>
            {activeDelegate && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-brand-300 font-semibold">{activeDelegate}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 6. Model Initialization Error Fallback */}
      {modelError && (
        <div className="absolute bottom-3 inset-x-3 z-30 bg-rose-950/90 border border-rose-800 text-rose-200 p-3 rounded-xl flex items-center gap-3 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <span>{modelError}</span>
        </div>
      )}
    </div>
  );
};
