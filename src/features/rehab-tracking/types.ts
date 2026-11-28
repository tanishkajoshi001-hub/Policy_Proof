/**
 * @fileoverview Person 3 Motion Engine & Pose Tracking Types.
 * Re-exports canonical contracts from `src/shared/contracts/motion.ts` (v1.0.0)
 * and declares module-internal state machine types only.
 */

export type {
  TrackingStatus,
  FormStatus,
  MovementPhase,
  ExerciseMode,
  ExerciseId,
  BodyRegion,
  BodySide,
  ClinicianReviewStatus,
  ExerciseAngleConfig,
  ExerciseDefinition,
  FeedbackCode,
  TrackingSnapshot,
  TrackingSessionResult,
  RehabTrackingController,
} from '../../shared/contracts/motion';

/** Module-internal finite state machine states. */
export type RepStateMachineState =
  | 'WAITING_FOR_START'
  | 'MOVING_TO_TARGET'
  | 'TARGET_REACHED'
  | 'RETURNING'
  | 'REP_COMPLETED'
  | 'PAUSED_LOW_CONFIDENCE'
  | 'STOPPED';

/** Module-internal frame evaluation input passed into RepStateMachine. */
export interface FrameEvaluationInput {
  angleDeg: number | null;
  confidence: number | null;
  isReliable: boolean;
  isPersonVisible?: boolean;
  missingLandmarks?: string[];
  now?: number;
  skipJumpGuard?: boolean;
}
