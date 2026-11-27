/**
 * @fileoverview Person 3 Motion Engine & Pose Tracking Contracts.
 * Reference: RehabBuddy_PRD_30pct_Person3_Motion_Engine.pdf (Section 7 & 8).
 */

export type ExerciseMode = 'rep' | 'hold';
export type BodyRegion = 'upper_limb';
export type BodySide = 'left' | 'right';

export type ClinicianReviewStatus = 'demo_unvalidated' | 'reviewed';

export interface ExerciseAngleConfig {
  proximal: string; // e.g. 'LEFT_SHOULDER' | 'shoulder'
  vertex: string;   // e.g. 'LEFT_ELBOW' | 'elbow'
  distal: string;   // e.g. 'LEFT_WRIST' | 'wrist'
  startRangeDeg: [number, number];   // e.g. [145, 180]
  targetRangeDeg: [number, number];  // e.g. [50, 75]
  toleranceDeg: number;              // e.g. 10
}

export interface ExerciseDefinition {
  id: string; // Exact IDs: 'elbow_flexion_extension_rep' | 'elbow_isometric_hold'
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

/** State Machine Internal States */
export type RepStateMachineState =
  | 'WAITING_FOR_START'
  | 'MOVING_TO_TARGET'
  | 'TARGET_REACHED'
  | 'RETURNING'
  | 'REP_COMPLETED'
  | 'PAUSED_LOW_CONFIDENCE'
  | 'STOPPED';

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

/**
 * Structured Feedback Codes emitted by the motion engine.
 * Person 4 converts these into localized patient-facing text and voice instructions.
 */
export type FeedbackCode =
  | 'MOVE_TOWARD_TARGET' // Move towards target
  | 'TARGET_REACHED'     // Target achieved
  | 'RETURN_TO_START'    // Return to starting position
  | 'FORM_OUT_OF_RANGE'  // Outside configured range
  | 'POSE_NOT_CLEAR'     // Landmarks unreliable
  | 'PERSON_NOT_VISIBLE' // Person not detected
  | 'EXERCISE_COMPLETE'; // Goal achieved

export interface TrackingSnapshot {
  status: TrackingStatus;
  updatedAt: number;
  formStatus: FormStatus;
  phase: MovementPhase;
  angleDeg: number | null;
  repCount: number;
  repGoal: number | null;
  holdElapsedMs: number;
  holdGoalMs: number | null;
  holdComplete: boolean;
  feedbackCode: FeedbackCode | string | null;
  confidence: number | null;
  fps: number | null;
  missingLandmarks: string[];
  errorCode: string | null;
}

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
}

export interface RehabTrackingController {
  attachMedia(video: HTMLVideoElement, overlay: HTMLCanvasElement): Promise<void>;
  startExercise(definition: ExerciseDefinition): Promise<void>;
  pause(reason?: string): void;
  resume(): Promise<void>;
  stop(): Promise<TrackingSessionResult>;
  getSnapshot(): TrackingSnapshot;
  subscribe(listener: (snapshot: TrackingSnapshot) => void): () => void;
  dispose(): Promise<void>;

  // Optional backwards compatibility aliases
  start?(definition: ExerciseDefinition): Promise<void>;
  reset?(): void;
  getLatestSnapshot?(): TrackingSnapshot;
}
