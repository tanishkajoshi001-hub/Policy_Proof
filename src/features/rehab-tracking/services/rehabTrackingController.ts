/**
 * @fileoverview Production RehabTrackingController Implementation.
 * Reference: RehabBuddy_PRD_30pct_Person3_Motion_Engine.pdf (Section 8).
 *
 * Exposes the standard public motion engine controller contract:
 * - attachMedia(video, overlay)
 * - startExercise(definition)
 * - pause(reason?)
 * - resume()
 * - stop()
 * - getSnapshot()
 * - subscribe(listener)
 * - dispose()
 */

import {
  ExerciseDefinition,
  RehabTrackingController,
  TrackingSnapshot,
  TrackingSessionResult,
} from '../types';
import { RepStateMachine } from './repStateMachine';
import { ELBOW_FLEXION_EXTENSION_REP, validateExerciseDefinition } from '../config/exercises';
import { poseService } from '../../pose/services/poseService';
import { drawSkeleton } from '../../pose/utils/skeletonDrawer';
import { calculateElbowAngle } from '../utils/angleCalculator';

export class RehabTrackingControllerImpl implements RehabTrackingController {
  private activeDefinition: ExerciseDefinition = ELBOW_FLEXION_EXTENSION_REP;
  private stateMachine: RepStateMachine;
  private listeners: Set<(snapshot: TrackingSnapshot) => void> = new Set();
  private latestSnapshot: TrackingSnapshot;

  // Media references
  private videoElement: HTMLVideoElement | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private animationFrameId: number | null = null;

  // Session metadata
  private startedAt: string = new Date().toISOString();
  private isRunning = false;
  private isPaused = false;
  private stopReason: 'completed' | 'user_stopped' | 'tracking_error' | 'camera_lost' = 'user_stopped';

  // Performance telemetry & UI notification throttle
  private frameCount = 0;
  private sessionStartTimeMs = 0;
  private lastNotifiedAtMs = 0;
  private readonly SNAPSHOT_THROTTLE_MS = 100;

  constructor(initialDefinition?: ExerciseDefinition) {
    if (initialDefinition) {
      this.activeDefinition = initialDefinition;
    }
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

  public async attachMedia(video: HTMLVideoElement, overlay: HTMLCanvasElement): Promise<void> {
    this.videoElement = video;
    this.overlayCanvas = overlay;
    if (this.isRunning && !this.isPaused) {
      if (!poseService.getActiveDelegate()) {
        try {
          await poseService.initialize();
        } catch (err) {
          this.stopReason = 'tracking_error';
          this.isRunning = false;
          this.updateSnapshot({
            ...this.latestSnapshot,
            status: 'error',
            errorCode: 'MODEL_INIT_FAILED',
            updatedAt: Date.now(),
          });
          throw err;
        }
      }
      this.scheduleFrame();
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

    this.activeDefinition = definition;
    this.stateMachine.setDefinition(definition);
    this.startedAt = new Date().toISOString();
    this.sessionStartTimeMs = performance.now();
    this.frameCount = 0;
    this.isRunning = true;
    this.isPaused = false;
    this.stopReason = 'user_stopped';

    if (this.videoElement && !poseService.getActiveDelegate()) {
      try {
        await poseService.initialize();
      } catch (err) {
        this.isRunning = false;
        this.stopReason = 'tracking_error';
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

    this.updateSnapshot({
      ...this.latestSnapshot,
      status: 'ready',
      phase: 'waiting',
      repCount: 0,
      repGoal: definition.repGoal,
      holdElapsedMs: 0,
      holdGoalMs: definition.holdSeconds ? definition.holdSeconds * 1000 : null,
      holdComplete: false,
      errorCode: null,
      updatedAt: Date.now(),
    });

    // Start background inference loop if media attached
    this.scheduleFrame();
  }

  public pause(reason = 'User paused'): void {
    this.isPaused = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.stateMachine.freeze();
    this.updateSnapshot({
      ...this.latestSnapshot,
      status: 'paused',
      feedbackCode: reason,
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
    this.scheduleFrame();
  }

  public async stop(): Promise<TrackingSessionResult> {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

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
    const videoEl = this.videoElement;
    await this.stop();
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
    this.listeners.clear();
    this.videoElement = null;
    this.overlayCanvas = null;
  }

  /**
   * Internal frame loop. Processes live video frame, calculates joint angle,
   * steps state machine, draws canvas skeleton, and publishes throttled snapshots.
   */
  private scheduleFrame(): void {
    if (!this.isRunning || this.isPaused || !this.videoElement) return;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const runLoop = () => {
      if (!this.isRunning || this.isPaused || !this.videoElement) return;

      const video = this.videoElement;
      if (
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        !video.paused &&
        !video.ended
      ) {
        this.frameCount++;
        const detection = poseService.detectVideoFrame(video);

        // Process landmarks
        if (detection.isNewFrame && detection.landmarks && detection.landmarks.length > 0) {
          const mapped = detection.mappedJoints;

          // Select side based on definition
          const shoulder = this.activeDefinition.side === 'right' ? mapped?.rightShoulder : mapped?.leftShoulder;
          const elbow = this.activeDefinition.side === 'right' ? mapped?.rightElbow : mapped?.leftElbow;
          const wrist = this.activeDefinition.side === 'right' ? mapped?.rightWrist : mapped?.leftWrist;

          const angleResult = calculateElbowAngle(shoulder, elbow, wrist, {
            width: video.videoWidth || 640,
            height: video.videoHeight || 480,
          });

          // Step state machine with verified angle
          const snapshot = this.stateMachine.update({
            angleDeg: angleResult.angleDeg,
            confidence: angleResult.confidenceScore,
            isReliable: angleResult.isReliable,
            missingLandmarks: angleResult.isReliable ? [] : ['elbow', 'wrist'],
            now: performance.now(),
          });
          snapshot.fps = detection.inferenceFps;

          // Draw skeleton on canvas
          if (this.overlayCanvas) {
            const canvas = this.overlayCanvas;
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth || 640;
              canvas.height = video.videoHeight || 480;
            }
            const ctx = canvas.getContext('2d');
            if (ctx) {
              drawSkeleton(ctx, detection.landmarks, canvas.width, canvas.height, {
                mirrored: true,
                minVisibility: 0.45,
                formStatus: snapshot.formStatus,
                angleDeg: angleResult.angleDeg,
                side: this.activeDefinition.side,
                showAngleBadge: true,
                showAngleArc: true,
                highlightArm: true,
              });
            }
          }

          this.updateSnapshot(snapshot, true);
        } else if (detection.isNewFrame) {
          // No person in frame: clear overlay and freeze state machine
          if (this.overlayCanvas) {
            const canvas = this.overlayCanvas;
            if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
              canvas.width = video.videoWidth || 640;
              canvas.height = video.videoHeight || 480;
            }
            const ctx = canvas.getContext('2d');
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
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
          this.updateSnapshot(snapshot, true);
        }
      }

      this.animationFrameId = requestAnimationFrame(runLoop);
    };

    this.animationFrameId = requestAnimationFrame(runLoop);
  }

  private updateSnapshot(snapshot: TrackingSnapshot, throttle = false): void {
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
      return;
    }

    this.lastNotifiedAtMs = now;
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Error in TrackingSnapshot listener:', err);
      }
    });
  }
}

export function createRehabTrackingController(
  initialDefinition?: ExerciseDefinition
): RehabTrackingController {
  return new RehabTrackingControllerImpl(initialDefinition);
}
