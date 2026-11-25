/**
 * @fileoverview Canonical Motion Engine Contracts (Provisional v0.1).
 * @version 0.1.0-provisional
 * @owner Person 3 (feature/motion-engine) — Authoritative for validation and finalization.
 *
 * Units:
 * - Joint angles: degrees (0–180)
 * - Durations: seconds
 * - Confidence/accuracy: normalized 0–1 (confidence) or 0–100 (accuracyPercent)
 * - Timestamps: ISO-8601 UTC strings
 */

import type { IsoTimestamp } from './app';
import type { TrackingStatus as ExistingTrackingStatus } from '../../types/pose';

/**
 * Re-exported from existing Mission 01 pose types to avoid duplicate definitions.
 * Person 3 owns consolidating src/types/pose.ts with this canonical contract.
 */
export type TrackingStatus = ExistingTrackingStatus;

/** Provisional exercise posture evaluation status (owned by Person 3). */
export type FormStatus = 'unknown' | 'neutral' | 'correct' | 'needs-adjustment';

/** Provisional repetition finite state machine phase (owned by Person 3). */
export type MovementPhase =
  | 'idle'
  | 'ready'
  | 'concentric'
  | 'hold'
  | 'eccentric'
  | 'rep-complete';

/** Initial PRD exercise identifiers; extensible via configuration. */
export type ExerciseId =
  | 'elbow_flexion'
  | 'shoulder_raise'
  | 'knee_extension'
  | (string & {});

/**
 * Declarative exercise configuration schema seeded from PRD Section 8 (FR3) & Page 7.
 * All angle thresholds require physiotherapist validation prior to clinical deployment.
 */
export interface ExerciseDefinition {
  id: ExerciseId;
  name: string;
  /** Ordered 3-point joint triplet: [proximal, vertex, distal]. */
  joints: readonly [string, string, string];
  /** Resting starting joint angle in degrees. */
  startAngleDeg: number;
  /** Target inflection joint angle in degrees. */
  targetAngleDeg: number;
  /** Acceptable deviation tolerance in degrees (+/-). */
  toleranceDeg: number;
  /** Required hold duration at target angle in seconds. */
  holdSeconds: number;
  /** Target repetition count for a session. */
  repGoal: number;
}

/**
 * Real-time snapshot emitted by Person 3's motion engine and consumed by Person 4's UI.
 * Person 4 MUST NOT recalculate angles, correctness, reps, or hold timers.
 */
export interface TrackingSnapshot {
  timestamp: IsoTimestamp;
  trackingStatus: TrackingStatus;
  formStatus: FormStatus;
  movementPhase: MovementPhase;
  /** Current smoothed primary joint angle in degrees, or null when unavailable. */
  primaryAngleDeg: number | null;
  repsCompleted: number;
  /** Seconds held at target posture for the current repetition. */
  holdElapsedSeconds: number;
  /** Normalized pose confidence score (0–1), or null when no person detected. */
  confidenceScore: number | null;
  /** Optional machine-readable feedback code for localized visual/voice cues. */
  feedbackCode: string | null;
}

/** Summary produced by Person 3's motion engine when an exercise tracking session ends. */
export interface TrackingSessionResult {
  exerciseId: ExerciseId;
  startedAt: IsoTimestamp;
  endedAt: IsoTimestamp;
  repsCompleted: number;
  repsTarget: number;
  /** Overall posture accuracy (0–100%), or null if zero attempts completed. */
  accuracyPercent: number | null;
  /** Peak/average achieved range of motion in degrees, or null if unavailable. */
  averageRomDeg: number | null;
}

/**
 * Controller interface exposed by Person 3's motion engine to drive a session.
 * Exact method signatures are provisional pending Person 3 validation.
 */
export interface RehabTrackingController {
  start(exercise: ExerciseDefinition): Promise<void>;
  stop(): TrackingSessionResult | null;
  reset(): void;
  getLatestSnapshot(): TrackingSnapshot;
}
