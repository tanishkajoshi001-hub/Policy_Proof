/**
 * @fileoverview Production RehabTrackingController Implementation.
 * Reference: RehabBuddy_PRD_30pct_Person3_Motion_Engine.pdf (Section 8).
 *
 * Single source of truth for live motion evaluation:
 * - Resolves configured landmark triplets dynamically via `resolveConfiguredTriplet`.
 * - Evaluates angles & rep/hold state via `RepStateMachine`.
 * - Draws skeleton directly on `<canvas>` at camera frame rate (decoupled from React).
 * - Uses `requestVideoFrameCallback` where supported with `requestAnimationFrame` fallback.
 * - Publishes throttled `TrackingSnapshot` updates to UI subscribers.
 */

import {
  ExerciseDefinition,
  RehabTrackingController,
  TrackingSnapshot,
  TrackingSessionResult,
} from '../types';
import { RepStateMachine } from './repStateMachine';
import { ELBOW_FLEXION_EXTENSION_REP, validateExerciseDefinition } from '../config/exercises';
import { poseService, PoseDelegate, MappedRehabilitationJoints } from '../../pose/services/poseService';
import { drawSkeleton } from '../../pose/utils/skeletonDrawer';
import { calculateJointAngle, resolveConfiguredTriplet } from '../utils/angleCalculator';

export interface ControllerRenderOptions {
  mirrored?: boolean;
  showSkeleton?: boolean;
  preferredDelegate?: PoseDelegate;
}

export interface ControllerTelemetryUpdate {
  cameraFps: number;
  inferenceFps: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  activeDelegate: PoseDelegate | null;
  mappedJoints: MappedRehabilitationJoints | null;
}

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export class RehabTrackingControllerImpl implements RehabTrackingController {
  private activeDefinition: ExerciseDefinition = ELBOW_FLEXION_EXTENSION_REP;
  private stateMachine: RepStateMachine;
  private listeners: Set<(snapshot: TrackingSnapshot) => void> = new Set();
  private telemetryListeners: Set<(telemetry: ControllerTelemetryUpdate) => void> = new Set();
  private latestSnapshot: TrackingSnapshot;

  // Media references & frame scheduling
  private videoElement: VideoWithFrameCallback | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private animationFrameId: number | null = null;
  private videoFrameCallbackId: number | null = null;
  private hasVideoFrameCallback = false;
  private hasNewVideoFrame = false;

  // Rendering & delegate options
  private mirrored = true;
  private showSkeleton = true;
  private preferredDelegate?: PoseDelegate;

  // Session metadata
  private startedAt: string = new Date().toISOString();
  private isRunning = false;
  private isPaused = false;
  private stopReason: 'completed' | 'user_stopped' | 'tracking_error' | 'camera_lost' = 'user_stopped';

  // Performance telemetry & UI notification throttle
  private frameCount = 0;
  private sessionStartTimeMs = 0;
  private lastNotifiedAtMs = 0;
  private readonly SNAPSHOT_THROTTLE_MS = 120;

  constructor(
    initialDefinition?: ExerciseDefinition,
    options?: ControllerRenderOptions
  ) {
    if (initialDefinition) {
      this.activeDefinition = initialDefinition;
    }
    if (options?.mirrored !== undefined) this.mirrored = options.mirrored;
    if (options?.showSkeleton !== undefined) this.showSkeleton = options.showSkeleton;
    if (options?.preferredDelegate !== undefined) this.preferredDelegate = options.preferredDelegate;

    this.stateMachine = new RepStateMachine(this.activeDefinition);
    this.latestSnapshot = {
      status: 'idle',
      updatedAt: Date.now(),
      formStatus: 'not_evaluated',
      phase: 'waiting',
      angleDeg: null,
      repCount: 0,
      repGoal: this.activeDefinition.repGoal,
      holdElapsedMs: 0,
      holdGoalMs: this.activeDefinition.holdSeconds ? this.activeDefinition.holdSeconds * 1000 : null,
      holdComplete: false,
      feedbackCode: null,
      confidence: null,
      fps: null,
      missingLandmarks: [],
      errorCode: null,
    };
  }

  public setRenderOptions(options: ControllerRenderOptions): void {
    if (options.mirrored !== undefined) this.mirrored = options.mirrored;
    if (options.showSkeleton !== undefined) {
      this.showSkeleton = options.showSkeleton;
      if (!this.showSkeleton && this.overlayCanvas) {
        const ctx = this.overlayCanvas.getContext('2d');
        ctx?.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
      }
    }
    if (options.preferredDelegate !== undefined) {
      this.preferredDelegate = options.preferredDelegate;
    }
  }

  public subscribeTelemetry(listener: (telemetry: ControllerTelemetryUpdate) => void): () => void {
    this.telemetryListeners.add(listener);
    return () => {
      this.telemetryListeners.delete(listener);
    };
  }

  private resolveDelegate(): PoseDelegate {
    if (this.preferredDelegate) return this.preferredDelegate;
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('delegate');
      if (param?.toUpperCase() === 'CPU') return 'CPU';
    }
    return 'GPU';
  }

  public async attachMedia(video: HTMLVideoElement, overlay: HTMLCanvasElement): Promise<void> {
    this.cancelScheduledCallbacks();
    this.videoElement = video as VideoWithFrameCallback;
    this.overlayCanvas = overlay;

    if (this.isRunning && !this.isPaused) {
      await this.ensurePoseInitialized();
      this.startFrameScheduler();
    }
  }

  private async ensurePoseInitialized(): Promise<void> {
    const targetDelegate = this.resolveDelegate();
    if (poseService.getActiveDelegate() === targetDelegate) {
      return;
    }
    try {
      await poseService.initialize(targetDelegate);
    } catch (err) {
      this.stopReason = 'tracking_error';
      this.isRunning = false;
      this.updateSnapshot({
        ...this.latestSnapshot,
        status: 'error',
        errorCode: 'MODEL_INIT_FAILED',
        feedbackCode: null,
        updatedAt: Date.now(),
      });
      throw err;
    }
  }

  public async startExercise(definition: ExerciseDefinition): Promise<void> {
    const validation = validateExerciseDefinition(definition);
    if (!validation.valid) {
      this.isRunning = false;
      this.stopReason = 'tracking_error';
      this.updateSnapshot({
        ...this.latestSnapshot,
        status: 'error',
        errorCode: 'INVALID_EXERCISE_CONFIG',
        feedbackCode: null,
        updatedAt: Date.now(),
      });
      throw new Error(`Invalid ExerciseDefinition: ${validation.errors.join('; ')}`);
    }

    this.cancelScheduledCallbacks();
    this.activeDefinition = definition;
    this.stateMachine.setDefinition(definition);
    this.startedAt = new Date().toISOString();
    this.sessionStartTimeMs = performance.now();
    this.frameCount = 0;
    this.isRunning = true;
    this.isPaused = false;
    this.stopReason = 'user_stopped';

    if (this.videoElement) {
      await this.ensurePoseInitialized();
    }

    this.updateSnapshot({
      ...this.latestSnapshot,
      status: 'ready',
      phase: 'waiting',
      formStatus: 'not_evaluated',
      angleDeg: null,
      repCount: 0,
      repGoal: definition.repGoal,
      holdElapsedMs: 0,
      holdGoalMs: definition.holdSeconds ? definition.holdSeconds * 1000 : null,
      holdComplete: false,
      feedbackCode: null,
      missingLandmarks: [],
      errorCode: null,
      updatedAt: Date.now(),
    });

    this.emitTelemetry({
      cameraFps: 0,
      inferenceFps: 0,
      avgLatencyMs: poseService.getAverageLatencyMs(),
      p95LatencyMs: poseService.getP95LatencyMs(),
      activeDelegate: poseService.getActiveDelegate(),
      mappedJoints: null,
    });

    this.startFrameScheduler();
  }

  public pause(reason?: string): void {
    this.isPaused = true;
    this.cancelScheduledCallbacks();
    this.stateMachine.freeze(true);

    // Emit structured feedback code ONLY (never untranslated English prose)
    const structuredCode =
      reason && /^[A-Z0-9_]+$/.test(reason) ? reason : 'SESSION_PAUSED';

    this.updateSnapshot({
      ...this.latestSnapshot,
      status: 'paused',
      feedbackCode: structuredCode,
      updatedAt: Date.now(),
    });
  }

  public async resume(): Promise<void> {
    if (!this.isRunning) return;
    this.isPaused = false;
    this.updateSnapshot({
      ...this.latestSnapshot,
      status: 'ready',
      updatedAt: Date.now(),
    });
    this.startFrameScheduler();
  }

  public async stop(): Promise<TrackingSessionResult> {
    this.isRunning = false;
    this.cancelScheduledCallbacks();

    const endedAt = new Date().toISOString();
    const sessionDurationSec = Math.max(0.1, (performance.now() - this.sessionStartTimeMs) / 1000);
    const averageFps = this.frameCount > 0 ? Math.round((this.frameCount / sessionDurationSec) * 10) / 10 : null;

    const { correctFrames, evaluatedFrames, accuracyPercent } = this.stateMachine.getAccuracyMetrics();
    const repCount = this.stateMachine.getRepCount();
    const holdCompletedMs = this.stateMachine.getHoldElapsedMs();

    if (
      (this.activeDefinition.mode === 'rep' && this.activeDefinition.repGoal && repCount >= this.activeDefinition.repGoal) ||
      (this.activeDefinition.mode === 'hold' && this.activeDefinition.holdSeconds && holdCompletedMs >= this.activeDefinition.holdSeconds * 1000)
    ) {
      this.stopReason = 'completed';
    }

    const result: TrackingSessionResult = {
      exerciseId: this.activeDefinition.id,
      startedAt: this.startedAt,
      endedAt,
      repCount,
      holdCompletedMs,
      accuracyPercent,
      correctFrames,
      evaluatedFrames,
      averageFps,
      stopReason: this.stopReason,
    };

    this.updateSnapshot({
      ...this.latestSnapshot,
      status: 'completed',
      phase: 'complete',
      updatedAt: Date.now(),
    });

    return result;
  }

  public getSnapshot(): TrackingSnapshot {
    return this.latestSnapshot;
  }

  /** Backwards compatibility alias for getSnapshot() */
  public getLatestSnapshot(): TrackingSnapshot {
    return this.getSnapshot();
  }

  /** Backwards compatibility alias for startExercise() */
  public async start(definition: ExerciseDefinition): Promise<void> {
    return this.startExercise(definition);
  }

  /** Backwards compatibility alias for resetting internal counter */
  public reset(): void {
    this.stateMachine.reset();
  }

  public subscribe(listener: (snapshot: TrackingSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public async dispose(): Promise<void> {
    // Clear listeners FIRST so teardown never emits a spurious 'completed' event
    this.listeners.clear();
    this.telemetryListeners.clear();
    this.isRunning = false;
    this.isPaused = false;
    this.cancelScheduledCallbacks();
    this.stateMachine.freeze(true);

    const videoEl = this.videoElement;
    if (videoEl && videoEl.srcObject) {
      const maybeStream = videoEl.srcObject as Partial<MediaStream>;
      if (typeof maybeStream.getTracks === 'function') {
        maybeStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {
            // Ignore track stop errors
          }
        });
      }
      videoEl.srcObject = null;
    }

    poseService.close();
    this.videoElement = null;
    this.overlayCanvas = null;
  }

  private cancelScheduledCallbacks(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (
      this.videoFrameCallbackId !== null &&
      this.videoElement &&
      typeof this.videoElement.cancelVideoFrameCallback === 'function'
    ) {
      this.videoElement.cancelVideoFrameCallback(this.videoFrameCallbackId);
      this.videoFrameCallbackId = null;
    }
    this.hasVideoFrameCallback = false;
    this.hasNewVideoFrame = false;
  }

  private startFrameScheduler(): void {
    if (!this.isRunning || this.isPaused || !this.videoElement) return;
    this.cancelScheduledCallbacks();

    const video = this.videoElement;

    // Prefer requestVideoFrameCallback where supported to synchronize strictly with decoded frames
    if (typeof video.requestVideoFrameCallback === 'function') {
      this.hasVideoFrameCallback = true;
      this.hasNewVideoFrame = true;
      const onVideoFrame = () => {
        if (!this.isRunning || this.isPaused || !this.videoElement) return;
        this.hasNewVideoFrame = true;
        poseService.recordCameraFrame(performance.now());
        this.videoFrameCallbackId = video.requestVideoFrameCallback!(onVideoFrame);
      };
      this.videoFrameCallbackId = video.requestVideoFrameCallback(onVideoFrame);
    }

    const runLoop = () => {
      if (!this.isRunning || this.isPaused || !this.videoElement) return;
      this.processCurrentVideoFrame();
      this.animationFrameId = requestAnimationFrame(runLoop);
    };

    this.animationFrameId = requestAnimationFrame(runLoop);
  }

  /**
   * Executes one frame check. Separated for deterministic unit testing and rAF scheduling.
   */
  public processCurrentVideoFrame(): void {
    const video = this.videoElement;
    if (
      !this.isRunning ||
      this.isPaused ||
      !video ||
      video.readyState < 2 ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0 ||
      video.paused ||
      video.ended
    ) {
      return;
    }

    const shouldRun = !this.hasVideoFrameCallback || this.hasNewVideoFrame;
    if (!shouldRun) return;

    this.hasNewVideoFrame = false;
    const detection = poseService.detectVideoFrame(video, this.hasVideoFrameCallback);

    // Count processed frames ONLY when a genuinely new video frame ran inference
    if (!detection.isNewFrame) return;
    this.frameCount++;

    if (this.overlayCanvas) {
      if (
        this.overlayCanvas.width !== video.videoWidth ||
        this.overlayCanvas.height !== video.videoHeight
      ) {
        this.overlayCanvas.width = video.videoWidth;
        this.overlayCanvas.height = video.videoHeight;
      }
    }

    if (detection.landmarks && detection.landmarks.length > 0) {
      const triplet = resolveConfiguredTriplet(
        detection.landmarks,
        this.activeDefinition.angle,
        this.activeDefinition.minLandmarkVisibility,
        this.activeDefinition.side
      );

      const angleResult = calculateJointAngle(
        triplet.proximal,
        triplet.vertex,
        triplet.distal,
        { width: video.videoWidth, height: video.videoHeight },
        this.activeDefinition.minLandmarkVisibility
      );

      const snapshot = this.stateMachine.update({
        angleDeg: angleResult.angleDeg,
        confidence: angleResult.confidenceScore ?? triplet.confidenceScore,
        isReliable: triplet.isReliable && angleResult.isReliable,
        missingLandmarks: triplet.missingLandmarks,
        now: performance.now(),
      });
      snapshot.fps = detection.inferenceFps;

      // Draw skeleton at camera frame rate independently of React render throttling
      if (this.overlayCanvas) {
        const ctx = this.overlayCanvas.getContext('2d');
        if (ctx) {
          if (this.showSkeleton) {
            drawSkeleton(ctx, detection.landmarks, this.overlayCanvas.width, this.overlayCanvas.height, {
              mirrored: this.mirrored,
              minVisibility: 0.45,
              formStatus: snapshot.formStatus,
              angleDeg: angleResult.angleDeg,
              side: this.activeDefinition.side,
              activeTripletIndices: triplet.tripletIndices ?? undefined,
              showAngleBadge: true,
              showAngleArc: true,
              highlightArm: true,
            });
          } else {
            ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
          }
        }
      }

      const published = this.updateSnapshot(snapshot, true);
      if (published) {
        this.emitTelemetry({
          cameraFps: detection.cameraFps,
          inferenceFps: detection.inferenceFps,
          avgLatencyMs: detection.avgInferenceTimeMs,
          p95LatencyMs: detection.p95InferenceTimeMs,
          activeDelegate: detection.activeDelegate,
          mappedJoints: detection.mappedJoints,
        });
      }
    } else {
      // No person detected in frame: clear overlay and emit no_person
      if (this.overlayCanvas) {
        const ctx = this.overlayCanvas.getContext('2d');
        ctx?.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
      }

      const snapshot = this.stateMachine.update({
        angleDeg: null,
        confidence: 0,
        isReliable: false,
        isPersonVisible: false,
        missingLandmarks: ['person'],
        now: performance.now(),
      });
      snapshot.fps = detection.inferenceFps;

      const published = this.updateSnapshot(snapshot, true);
      if (published) {
        this.emitTelemetry({
          cameraFps: detection.cameraFps,
          inferenceFps: detection.inferenceFps,
          avgLatencyMs: detection.avgInferenceTimeMs,
          p95LatencyMs: detection.p95InferenceTimeMs,
          activeDelegate: detection.activeDelegate,
          mappedJoints: null,
        });
      }
    }
  }

  private emitTelemetry(telemetry: ControllerTelemetryUpdate): void {
    this.telemetryListeners.forEach((listener) => {
      try {
        listener(telemetry);
      } catch (err) {
        console.error('Error in telemetry listener:', err);
      }
    });
  }

  private updateSnapshot(snapshot: TrackingSnapshot, throttle = false): boolean {
    const prev = this.latestSnapshot;
    this.latestSnapshot = snapshot;

    const now = performance.now();
    const stateChanged =
      !prev ||
      prev.status !== snapshot.status ||
      prev.phase !== snapshot.phase ||
      prev.formStatus !== snapshot.formStatus ||
      prev.repCount !== snapshot.repCount ||
      prev.holdComplete !== snapshot.holdComplete ||
      prev.feedbackCode !== snapshot.feedbackCode ||
      prev.errorCode !== snapshot.errorCode;

    if (throttle && !stateChanged && now - this.lastNotifiedAtMs < this.SNAPSHOT_THROTTLE_MS) {
      return false;
    }

    this.lastNotifiedAtMs = now;
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Error in TrackingSnapshot listener:', err);
      }
    });
    return true;
  }
}

/**
 * Factory Function exported on Page 9 of the PRD.
 */
export function createRehabTrackingController(
  options?: ControllerRenderOptions
): RehabTrackingController {
  return new RehabTrackingControllerImpl(undefined, options);
}
