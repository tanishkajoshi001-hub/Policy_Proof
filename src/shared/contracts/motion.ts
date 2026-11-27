/**
 * @fileoverview Canonical Motion Engine Contracts (RehabBuddy PRD Page 9 / Section 8.1 Specification).
 * @version 1.0.0
 * @owner Person 3 (feature/motion-engine) — Authoritative for validation and finalization.
 *
 * Page 9 Public TypeScript Contract:
 * - TrackingStatus
 * - FormStatus
 * - MovementPhase
 * - TrackingSnapshot
 * - RehabTrackingController
 * - createRehabTrackingController()
 * - TrackingSessionResult
 */

import type { IsoTimestamp } from './app';

export type TrackingStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'tracking'
  | 'no_person'
  | 'low_confidence'
  | 'paused'
  | 'completed'
  | 'error'
  // Backwards-compatible aliases
  | 'partially-visible'
  | 'tracking-stable';

export type FormStatus =
  | 'correct'
  | 'incorrect'
  | 'insufficient_data'
  | 'not_evaluated'
  // Backwards-compatible aliases
  | 'neutral'
  | 'unknown'
  | 'needs-adjustment';

export type MovementPhase =
  | 'waiting'
  | 'outbound'
  | 'target'
  | 'returning'
  | 'holding'
  | 'complete'
  // Backwards-compatible aliases
  | 'idle'
  | 'ready'
  | 'concentric'
  | 'hold'
  | 'eccentric'
  | 'rep-complete';

export type ExerciseMode = 'rep' | 'hold';
export type ExerciseId = string;
export type BodyRegion = 'upper_limb';
export type BodySide = 'left' | 'right';
export type ClinicianReviewStatus = 'demo_unvalidated' | 'reviewed';

export interface ExerciseAngleConfig {
  proximal: string;
  vertex: string;
  distal: string;
  startRangeDeg: [number, number];
  targetRangeDeg: [number, number];
  toleranceDeg: number;
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  bodyRegion: BodyRegion;
  side: BodySide;
  mode: ExerciseMode;
  angle: ExerciseAngleConfig;
  repGoal: number | null;
  holdSeconds: number | null;
  minLandmarkVisibility: number;
  targetEntryDwellMs: number;
  maxTrackingGapMs: number;
  maxCycleDurationMs?: number;
  clinicianReviewStatus: ClinicianReviewStatus;
}

/**
 * Structured Feedback Codes emitted by the motion engine.
 * Person 4 converts these into localized patient-facing text and voice instructions.
 */
export type FeedbackCode =
  | 'MOVE_TOWARD_TARGET'
  | 'TARGET_REACHED'
  | 'RETURN_TO_START'
  | 'FORM_OUT_OF_RANGE'
  | 'POSE_NOT_CLEAR'
  | 'PERSON_NOT_VISIBLE'
  | 'EXERCISE_COMPLETE';

/**
 * Real-time tracking snapshot specified on Page 9 of the PRD.
 * Emitted by Person 3's motion engine and consumed by Person 4's patient screens.
 */
export interface TrackingSnapshot {
  /** Tracking lifecycle / pose status */
  status: TrackingStatus;
  /** Monotonic epoch timestamp of the update (ms) */
  updatedAt: number;
  /** Evaluated form status ('correct', 'incorrect', 'insufficient_data', 'not_evaluated') */
  formStatus: FormStatus;
  /** Movement phase state */
  phase: MovementPhase;
  /** Current smoothed primary joint angle in degrees, or null when unavailable */
  angleDeg: number | null;
  /** Number of completed valid repetition cycles */
  repCount: number;
  /** Target repetition goal, or null if open-ended */
  repGoal: number | null;
  /** Elapsed hold duration at target angle (ms) */
  holdElapsedMs: number;
  /** Target hold duration goal (ms), or null in rep mode */
  holdGoalMs: number | null;
  /** Flag indicating whether hold goal was reached */
  holdComplete: boolean;
  /** Structured feedback code for UI/voice guidance */
  feedbackCode: FeedbackCode | string | null;
  /** Normalized pose landmark confidence score [0..1], or null if absent */
  confidence: number | null;
  /** Measured inference frame rate (FPS) */
  fps: number | null;
  /** List of landmark names missing or below confidence threshold */
  missingLandmarks: string[];
  /** Error code if camera or model encountered an issue, else null */
  errorCode: string | null;

  // Backwards compatibility properties for existing UI adapters
  timestamp?: IsoTimestamp;
  trackingStatus?: TrackingStatus;
  movementPhase?: MovementPhase;
  primaryAngleDeg?: number | null;
  repsCompleted?: number;
  holdElapsedSeconds?: number;
  confidenceScore?: number | null;
}

/**
 * Summary produced by Person 3's motion engine when an exercise tracking session ends.
 * Reference: PRD Page 9 (Section 8.2).
 */
export interface TrackingSessionResult {
  exerciseId: string;
  startedAt: string;
  endedAt: string;
  repCount: number;
  holdCompletedMs: number;
  accuracyPercent: number | null;
  correctFrames: number;
  evaluatedFrames: number;
  averageFps: number | null;
  stopReason: 'completed' | 'user_stopped' | 'tracking_error' | 'camera_lost';

  // Backwards compatibility aliases
  repsCompleted?: number;
  repsTarget?: number;
  averageRomDeg?: number | null;
}

/**
 * Public controller interface specified on Page 9 of the PRD.
 * Exported so Person 4 can connect it to the patient screens.
 */
export interface RehabTrackingController {
  attachMedia(
    video: HTMLVideoElement,
    overlay: HTMLCanvasElement
  ): Promise<void>;

  startExercise(
    definition: ExerciseDefinition
  ): Promise<void>;

  pause(reason?: string): void;

  resume(): Promise<void>;

  stop(): Promise<TrackingSessionResult>;

  getSnapshot(): TrackingSnapshot;

  subscribe(
    listener: (snapshot: TrackingSnapshot) => void
  ): () => void;

  dispose(): Promise<void>;

  // Backwards compatibility aliases
  start?(exercise: ExerciseDefinition): Promise<void>;
  reset?(): void;
  getLatestSnapshot?(): TrackingSnapshot;
}

// Re-export controller implementation and factory from features/rehab-tracking
export {
  createRehabTrackingController,
  RehabTrackingControllerImpl,
} from '../../features/rehab-tracking/services/rehabTrackingController';
