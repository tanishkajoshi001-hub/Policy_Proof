/**
 * @fileoverview Repetition & Isometric Hold Finite State Machine.
 *
 * Implements the Person 3 Motion Engine State Machine Specification:
 * - WAITING_FOR_START -> MOVING_TO_TARGET -> TARGET_REACHED -> RETURNING -> REP_COMPLETED
 * - Strict full-cycle validation: If the user bends their elbow but does not return
 *   to the starting position, the repetition is NOT counted.
 * - Anti-jitter protection: Boundary hysteresis and targetEntryDwellMs dwell time.
 * - Duplicate-count prevention: Single increment per verified cycle.
 * - Monotonic hold timer: Uses performance.now() to measure valid hold duration.
 * - Returns holdElapsedMs, holdGoalMs, and holdComplete separately.
 * - Emits structured feedback codes for Person 4 to translate into patient text and speech:
 *   MOVE_TOWARD_TARGET, TARGET_REACHED, RETURN_TO_START, FORM_OUT_OF_RANGE,
 *   POSE_NOT_CLEAR, PERSON_NOT_VISIBLE, EXERCISE_COMPLETE.
 */

import {
  ExerciseDefinition,
  RepStateMachineState,
  MovementPhase,
  FormStatus,
  TrackingStatus,
  TrackingSnapshot,
  FeedbackCode,
} from '../types';

export interface StateMachineUpdateInput {
  angleDeg: number | null;
  confidence: number | null;
  isReliable: boolean;
  isPersonVisible?: boolean;
  missingLandmarks?: string[];
  now?: number; // Monotonic timestamp (defaults to performance.now())
}

export class RepStateMachine {
  private definition: ExerciseDefinition;
  private state: RepStateMachineState = 'WAITING_FOR_START';
  private repCount = 0;
  private holdElapsedMs = 0;

  // Monotonic timestamps
  private cycleStartTime: number | null = null;
  private targetEntryTime: number | null = null;
  private lastHoldTickTime: number | null = null;
  private lastValidTrackingTime: number = performance.now();
  private lastExplicitNow: number | null = null;

  // Frame telemetry
  private correctFrames = 0;
  private evaluatedFrames = 0;

  // Anti-jitter hysteresis margin in degrees and default max cycle guard
  private readonly HYSTERESIS_DEG = 3;
  private readonly DEFAULT_MAX_CYCLE_DURATION_MS = 15000;

  constructor(definition: ExerciseDefinition) {
    this.definition = definition;
    this.reset();
  }

  public reset(): void {
    this.state = 'WAITING_FOR_START';
    this.repCount = 0;
    this.holdElapsedMs = 0;
    this.cycleStartTime = null;
    this.targetEntryTime = null;
    this.lastHoldTickTime = null;
    this.lastValidTrackingTime = performance.now();
    this.lastExplicitNow = null;
    this.correctFrames = 0;
    this.evaluatedFrames = 0;
  }

  public setDefinition(definition: ExerciseDefinition): void {
    this.definition = definition;
    this.reset();
  }

  public getState(): RepStateMachineState {
    return this.state;
  }

  public getRepCount(): number {
    return this.repCount;
  }

  public getHoldElapsedMs(): number {
    return Math.round(this.holdElapsedMs);
  }

  /**
   * Returns hold timer duration, goal, and completion status separately.
   */
  public getCycleStartTime(): number | null {
    return this.cycleStartTime;
  }

  public getHoldMetrics(): {
    holdElapsedMs: number;
    holdGoalMs: number | null;
    holdComplete: boolean;
  } {
    const isHoldMode = this.definition.mode === 'hold';
    const holdGoalMs = isHoldMode && this.definition.holdSeconds ? this.definition.holdSeconds * 1000 : null;
    const holdComplete = holdGoalMs !== null && this.holdElapsedMs >= holdGoalMs;

    return {
      holdElapsedMs: Math.round(this.holdElapsedMs),
      holdGoalMs,
      holdComplete,
    };
  }

  public getAccuracyMetrics(): {
    correctFrames: number;
    evaluatedFrames: number;
    accuracyPercent: number | null;
  } {
    const accuracyPercent =
      this.evaluatedFrames > 0
        ? Math.round((this.correctFrames / this.evaluatedFrames) * 1000) / 10
        : null;
    return {
      correctFrames: this.correctFrames,
      evaluatedFrames: this.evaluatedFrames,
      accuracyPercent,
    };
  }

  /**
   * Freezes hold accumulation and optionally cycle progression on interruption.
   */
  public freeze(pauseCycle = true): void {
    this.lastHoldTickTime = null;
    this.targetEntryTime = null;
    if (pauseCycle && this.state !== 'STOPPED' && this.state !== 'REP_COMPLETED') {
      this.state = 'PAUSED_LOW_CONFIDENCE';
    }
  }

  /**
   * Primary frame evaluation loop.
   * Processes current joint angle and landmark reliability to drive state transitions.
   */
  public update(input: StateMachineUpdateInput): TrackingSnapshot {
    const now = input.now ?? performance.now();
    const {
      angleDeg,
      confidence,
      isReliable,
      isPersonVisible = true,
      missingLandmarks = [],
    } = input;

    // Guard against stale or backwards explicit frame timestamps
    if (input.now !== undefined) {
      if (this.lastExplicitNow !== null && input.now <= this.lastExplicitNow) {
        this.freeze(false);
        return this.buildSnapshot({
          status: 'low_confidence',
          formStatus: 'insufficient_data',
          phase: this.mapStateToPhase(this.state),
          angleDeg: null,
          feedbackCode: 'POSE_NOT_CLEAR',
          confidence,
          missingLandmarks: missingLandmarks.length > 0 ? missingLandmarks : ['stale_timestamp'],
          now: this.lastExplicitNow,
        });
      }
      this.lastExplicitNow = input.now;
    }

    // 0. Person not detected at all in frame
    if (!isPersonVisible) {
      this.freeze(true);
      return this.buildSnapshot({
        status: 'no_person',
        formStatus: 'insufficient_data',
        phase: this.mapStateToPhase(this.state),
        angleDeg: null,
        feedbackCode: 'PERSON_NOT_VISIBLE',
        confidence: 0,
        missingLandmarks: ['person'],
        now,
      });
    }

    // 1. Landmark confidence loss or tracking dropout
    if (!isReliable || angleDeg === null) {
      const trackingGap = now - this.lastValidTrackingTime;
      const exceedsGap = trackingGap > this.definition.maxTrackingGapMs;
      this.freeze(exceedsGap);

      return this.buildSnapshot({
        status: 'low_confidence',
        formStatus: 'insufficient_data',
        phase: this.mapStateToPhase(this.state),
        angleDeg: null,
        feedbackCode: 'POSE_NOT_CLEAR',
        confidence,
        missingLandmarks: missingLandmarks.length > 0 ? missingLandmarks : ['elbow', 'wrist'],
        now,
      });
    }

    // Tracking is valid; update last seen timestamp
    this.lastValidTrackingTime = now;

    // Resume from low confidence pause
    if (this.state === 'PAUSED_LOW_CONFIDENCE') {
      this.state = 'WAITING_FOR_START';
      this.cycleStartTime = null;
      this.targetEntryTime = null;
    }

    const { startRangeDeg, targetRangeDeg, toleranceDeg } = this.definition.angle;
    const startMin = startRangeDeg[0] - this.HYSTERESIS_DEG;
    const startMax = startRangeDeg[1] + this.HYSTERESIS_DEG;
    const targetMin = targetRangeDeg[0] - toleranceDeg;
    const targetMax = targetRangeDeg[1] + toleranceDeg;

    const inStartBand = angleDeg >= startMin && angleDeg <= startMax;
    const inTargetBand = angleDeg >= targetMin && angleDeg <= targetMax;

    // Track frame evaluation metrics
    this.evaluatedFrames++;
    let formStatus: FormStatus = 'neutral';
    let feedbackCode: FeedbackCode;

    // -------------------------------------------------------------
    // MODE A: ISOMETRIC HOLD MODE
    // -------------------------------------------------------------
    if (this.definition.mode === 'hold') {
      const holdGoalMs = (this.definition.holdSeconds ?? 3) * 1000;

      // Start hold accumulation ONLY when target posture and confidence requirements are met
      if (inTargetBand) {
        formStatus = 'correct';
        this.correctFrames++;
        feedbackCode = 'TARGET_REACHED';
        this.state = 'TARGET_REACHED';

        // Accumulate monotonic hold time
        if (this.lastHoldTickTime !== null) {
          const delta = now - this.lastHoldTickTime;
          // Guard against clock anomalies
          if (delta > 0 && delta <= this.definition.maxTrackingGapMs + 1000) {
            this.holdElapsedMs += delta;
          }
        }
        this.lastHoldTickTime = now;

        if (this.holdElapsedMs >= holdGoalMs) {
          feedbackCode = 'EXERCISE_COMPLETE';
          this.state = 'REP_COMPLETED';
        }
      } else {
        // Pause immediately if user leaves target range
        this.lastHoldTickTime = null;
        formStatus = 'incorrect';
        feedbackCode = inStartBand ? 'MOVE_TOWARD_TARGET' : 'FORM_OUT_OF_RANGE';
        if (this.holdElapsedMs < holdGoalMs) {
          this.state = inStartBand ? 'WAITING_FOR_START' : 'MOVING_TO_TARGET';
        }
      }

      return this.buildSnapshot({
        status: this.holdElapsedMs >= holdGoalMs ? 'completed' : 'tracking',
        formStatus,
        phase: this.holdElapsedMs >= holdGoalMs ? 'complete' : inTargetBand ? 'holding' : 'waiting',
        angleDeg,
        feedbackCode,
        confidence,
        missingLandmarks: [],
        now,
      });
    }

    // -------------------------------------------------------------
    // MODE B: REPETITION MODE (START -> TARGET -> RETURN -> COUNT)
    // -------------------------------------------------------------
    const repGoal = this.definition.repGoal ?? 10;
    const maxCycleDurationMs =
      this.definition.maxCycleDurationMs ?? this.DEFAULT_MAX_CYCLE_DURATION_MS;

    // Reject stale / excessively prolonged incomplete cycles (PRD Section 7.4)
    if (
      (this.state === 'MOVING_TO_TARGET' ||
        this.state === 'TARGET_REACHED' ||
        this.state === 'RETURNING') &&
      this.cycleStartTime !== null &&
      now - this.cycleStartTime > maxCycleDurationMs
    ) {
      this.state = 'WAITING_FOR_START';
      this.cycleStartTime = null;
      this.targetEntryTime = null;
      return this.buildSnapshot({
        status: 'tracking',
        formStatus: inStartBand ? 'neutral' : 'incorrect',
        phase: 'waiting',
        angleDeg,
        feedbackCode: inStartBand ? 'MOVE_TOWARD_TARGET' : 'FORM_OUT_OF_RANGE',
        confidence,
        missingLandmarks: [],
        now,
      });
    }

    switch (this.state) {
      case 'WAITING_FOR_START': {
        if (inStartBand) {
          feedbackCode = 'MOVE_TOWARD_TARGET';
          formStatus = 'neutral';
          // User is in starting position; prepare for movement
          this.cycleStartTime = now;
          this.state = 'MOVING_TO_TARGET';
        } else {
          feedbackCode = 'FORM_OUT_OF_RANGE';
          formStatus = 'incorrect';
        }
        break;
      }

      case 'MOVING_TO_TARGET': {
        if (inTargetBand) {
          formStatus = 'correct';
          feedbackCode = 'TARGET_REACHED';
          // Anti-jitter: require target entry dwell
          if (this.targetEntryTime === null) {
            this.targetEntryTime = now;
          } else if (now - this.targetEntryTime >= this.definition.targetEntryDwellMs) {
            this.state = 'TARGET_REACHED';
            this.correctFrames++;
          }
        } else {
          // Reset dwell if exited before threshold
          this.targetEntryTime = null;
          formStatus = 'neutral';
          feedbackCode = 'MOVE_TOWARD_TARGET';

          // If user aborted movement and returned to start without reaching target: reset cycle
          if (inStartBand) {
            this.state = 'MOVING_TO_TARGET';
            this.cycleStartTime = now;
          }
        }
        break;
      }

      case 'TARGET_REACHED': {
        formStatus = 'correct';
        this.correctFrames++;
        feedbackCode = 'TARGET_REACHED';

        // When user starts extending arm away from target back toward start
        if (!inTargetBand && angleDeg > targetMax) {
          this.state = 'RETURNING';
          feedbackCode = 'RETURN_TO_START';
        }
        break;
      }

      case 'RETURNING': {
        formStatus = 'neutral';
        feedbackCode = 'RETURN_TO_START';

        // User must successfully re-enter the starting range to complete the rep
        if (inStartBand) {
          this.repCount++;
          this.state = 'REP_COMPLETED';
          feedbackCode = this.repCount >= repGoal ? 'EXERCISE_COMPLETE' : 'MOVE_TOWARD_TARGET';

          // Reset cycle trackers
          this.cycleStartTime = null;
          this.targetEntryTime = null;

          // If session goal not yet reached, seamlessly transition back to WAITING_FOR_START
          if (this.repCount < repGoal) {
            this.state = 'WAITING_FOR_START';
          }
        } else if (inTargetBand) {
          // User reversed direction back into target
          this.state = 'TARGET_REACHED';
          formStatus = 'correct';
          feedbackCode = 'TARGET_REACHED';
        }
        break;
      }

      case 'REP_COMPLETED': {
        formStatus = 'correct';
        feedbackCode = this.repCount >= repGoal ? 'EXERCISE_COMPLETE' : 'MOVE_TOWARD_TARGET';
        if (this.repCount < repGoal && inStartBand) {
          this.state = 'MOVING_TO_TARGET';
        }
        break;
      }

      case 'STOPPED':
      default: {
        feedbackCode = 'EXERCISE_COMPLETE';
        break;
      }
    }

    const isComplete = this.repCount >= repGoal;

    return this.buildSnapshot({
      status: isComplete ? 'completed' : 'tracking',
      formStatus,
      phase: this.mapStateToPhase(this.state),
      angleDeg,
      feedbackCode,
      confidence,
      missingLandmarks: [],
      now,
    });
  }

  private mapStateToPhase(state: RepStateMachineState): MovementPhase {
    switch (state) {
      case 'WAITING_FOR_START':
        return 'waiting';
      case 'MOVING_TO_TARGET':
        return 'outbound';
      case 'TARGET_REACHED':
        return this.definition.mode === 'hold' ? 'holding' : 'target';
      case 'RETURNING':
        return 'returning';
      case 'REP_COMPLETED':
        return 'complete';
      case 'PAUSED_LOW_CONFIDENCE':
        return 'waiting';
      case 'STOPPED':
        return 'complete';
    }
  }

  private buildSnapshot(params: {
    status: TrackingStatus;
    formStatus: FormStatus;
    phase: MovementPhase;
    angleDeg: number | null;
    feedbackCode: FeedbackCode | string | null;
    confidence: number | null;
    missingLandmarks: string[];
    now: number;
  }): TrackingSnapshot {
    const isHoldMode = this.definition.mode === 'hold';
    const holdGoalMs = isHoldMode && this.definition.holdSeconds ? this.definition.holdSeconds * 1000 : null;
    const holdComplete = holdGoalMs !== null && this.holdElapsedMs >= holdGoalMs;

    return {
      status: params.status,
      updatedAt: Math.round(params.now),
      formStatus: params.formStatus,
      phase: params.phase,
      angleDeg: params.angleDeg,
      repCount: this.repCount,
      repGoal: this.definition.repGoal,
      holdElapsedMs: Math.round(this.holdElapsedMs),
      holdGoalMs,
      holdComplete,
      feedbackCode: params.feedbackCode,
      confidence: params.confidence,
      fps: null,
      missingLandmarks: params.missingLandmarks,
      errorCode: null,
    };
  }
}
