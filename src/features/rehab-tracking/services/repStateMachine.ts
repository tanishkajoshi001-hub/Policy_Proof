/**
 * @fileoverview Repetition & Isometric Hold Finite State Machine.
 *
 * Implements the Person 3 Motion Engine State Machine Specification:
 * - WAITING_FOR_START -> MOVING_TO_TARGET -> TARGET_REACHED -> RETURNING -> REP_COMPLETED
 * - Supports both descending (e.g. 160° -> 60°) and ascending (e.g. 25° -> 160°) angle ranges.
 * - Strict full-cycle validation: returning without reaching target, or failing to return,
 *   does NOT count a repetition.
 * - Anti-jitter protection: boundary hysteresis, targetEntryDwellMs in BOTH rep & hold modes,
 *   impossible angular-jump guard, stale-timestamp guard, max-cycle guard, and confidence debounce.
 * - Monotonic hold timer: uses performance.now(), freezes immediately on range exit or tracking loss,
 *   and caps holdElapsedMs strictly at holdGoalMs upon completion.
 */

import {
  ExerciseDefinition,
  RepStateMachineState,
  MovementPhase,
  FormStatus,
  TrackingStatus,
  TrackingSnapshot,
  FeedbackCode,
  FrameEvaluationInput,
} from '../types';

export type StateMachineUpdateInput = FrameEvaluationInput;

export class RepStateMachine {
  private definition: ExerciseDefinition;
  private state: RepStateMachineState = 'WAITING_FOR_START';
  private repCount = 0;
  private holdElapsedMs = 0;

  // Monotonic timestamps & tracking guards
  private cycleStartTime: number | null = null;
  private targetEntryTime: number | null = null;
  private lastHoldTickTime: number | null = null;
  private lastValidTrackingTime: number = performance.now();
  private lastExplicitNow: number | null = null;
  private lastValidAngleDeg: number | null = null;
  private lastValidAngleTime: number | null = null;
  private consecutiveLowConfidenceFrames = 0;

  // Frame telemetry
  private correctFrames = 0;
  private evaluatedFrames = 0;

  // Engineering guards (configurable via ExerciseDefinition where present)
  private readonly HYSTERESIS_DEG = 3;
  private readonly DEFAULT_MAX_CYCLE_DURATION_MS = 15000;
  private readonly DEFAULT_MAX_ANGULAR_VELOCITY_DEG_PER_SEC = 900;
  private readonly LOW_CONFIDENCE_DEBOUNCE_FRAMES = 3;

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
    this.lastValidAngleDeg = null;
    this.lastValidAngleTime = null;
    this.consecutiveLowConfidenceFrames = 0;
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
   * Freezes hold accumulation and optionally pauses cycle progression on interruption.
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
  public update(input: FrameEvaluationInput): TrackingSnapshot {
    const now = input.now ?? performance.now();
    const {
      angleDeg,
      confidence,
      isReliable,
      isPersonVisible = true,
      missingLandmarks = [],
      skipJumpGuard = false,
    } = input;

    // 0a. Guard against stale or backwards explicit frame timestamps
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

    // 0b. Person not detected in frame
    if (!isPersonVisible) {
      this.consecutiveLowConfidenceFrames = 0;
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

    // 1. Landmark confidence loss or tracking dropout (with debounce + gap threshold)
    if (!isReliable || angleDeg === null) {
      this.consecutiveLowConfidenceFrames++;
      const trackingGap = now - this.lastValidTrackingTime;
      const exceedsGap =
        trackingGap > this.definition.maxTrackingGapMs ||
        this.consecutiveLowConfidenceFrames >= this.LOW_CONFIDENCE_DEBOUNCE_FRAMES;
      this.freeze(exceedsGap);

      return this.buildSnapshot({
        status: 'low_confidence',
        formStatus: 'insufficient_data',
        phase: this.mapStateToPhase(this.state),
        angleDeg: null,
        feedbackCode: 'POSE_NOT_CLEAR',
        confidence,
        missingLandmarks:
          missingLandmarks.length > 0
            ? missingLandmarks
            : [this.definition.angle.vertex, this.definition.angle.distal],
        now,
      });
    }

    // 2. Impossible angular-velocity spike rejection (30/60fps landmark teleport guard)
    const maxVel =
      this.definition.maxAngularVelocityDegPerSec ?? this.DEFAULT_MAX_ANGULAR_VELOCITY_DEG_PER_SEC;
    if (
      !skipJumpGuard &&
      this.lastValidAngleDeg !== null &&
      this.lastValidAngleTime !== null
    ) {
      const dtSec = (now - this.lastValidAngleTime) / 1000;
      const angleDelta = Math.abs(angleDeg - this.lastValidAngleDeg);
      if (dtSec > 0 && dtSec <= 0.12 && angleDelta > Math.max(60, maxVel * dtSec)) {
        this.lastHoldTickTime = null;
        return this.buildSnapshot({
          status: 'low_confidence',
          formStatus: 'insufficient_data',
          phase: this.mapStateToPhase(this.state),
          angleDeg: null,
          feedbackCode: 'POSE_NOT_CLEAR',
          confidence,
          missingLandmarks: ['angle_jump_rejected'],
          now,
        });
      }
    }

    // Tracking and geometry are valid
    this.consecutiveLowConfidenceFrames = 0;
    this.lastValidTrackingTime = now;
    this.lastValidAngleDeg = angleDeg;
    this.lastValidAngleTime = now;

    // Resume cleanly from low-confidence pause without inferring missed movement
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

    const startMid = (startRangeDeg[0] + startRangeDeg[1]) / 2;
    const targetMid = (targetRangeDeg[0] + targetRangeDeg[1]) / 2;
    const isDescending = targetMid <= startMid;

    const inStartBand = angleDeg >= startMin && angleDeg <= startMax;
    const inTargetBand = angleDeg >= targetMin && angleDeg <= targetMax;
    const inBetweenCorridor = isDescending
      ? angleDeg > targetMax && angleDeg < startMin
      : angleDeg > startMax && angleDeg < targetMin;

    // Track evaluated frames (excluding insufficient_data frames)
    this.evaluatedFrames++;
    let formStatus: FormStatus = 'neutral';
    let feedbackCode: FeedbackCode;

    // -------------------------------------------------------------
    // MODE A: ISOMETRIC HOLD MODE
    // -------------------------------------------------------------
    if (this.definition.mode === 'hold') {
      const holdGoalMs = (this.definition.holdSeconds ?? 3) * 1000;

      // Once hold goal is complete, freeze elapsed time strictly at holdGoalMs
      if (this.state === 'REP_COMPLETED' || this.holdElapsedMs >= holdGoalMs) {
        this.holdElapsedMs = holdGoalMs;
        this.state = 'REP_COMPLETED';
        this.lastHoldTickTime = null;
        return this.buildSnapshot({
          status: 'completed',
          formStatus: inTargetBand ? 'correct' : 'neutral',
          phase: 'complete',
          angleDeg,
          feedbackCode: 'EXERCISE_COMPLETE',
          confidence,
          missingLandmarks: [],
          now,
        });
      }

      if (inTargetBand) {
        if (this.state !== 'TARGET_REACHED') {
          if (this.definition.targetEntryDwellMs <= 0) {
            this.state = 'TARGET_REACHED';
            this.lastHoldTickTime = now;
            formStatus = 'correct';
            this.correctFrames++;
            feedbackCode = 'TARGET_REACHED';
          } else {
            if (this.targetEntryTime === null) {
              this.targetEntryTime = now;
            }
            if (now - this.targetEntryTime >= this.definition.targetEntryDwellMs) {
              this.state = 'TARGET_REACHED';
              const initialDelta = now - this.targetEntryTime;
              if (initialDelta > 0 && initialDelta <= this.definition.maxTrackingGapMs + 1000) {
                this.holdElapsedMs = Math.min(holdGoalMs, this.holdElapsedMs + initialDelta);
              }
              this.lastHoldTickTime = now;
              formStatus = 'correct';
              this.correctFrames++;
              feedbackCode = 'TARGET_REACHED';
            } else {
              // Dwelling before confirming hold posture
              this.state = 'MOVING_TO_TARGET';
              formStatus = 'neutral';
              feedbackCode = 'MOVE_TOWARD_TARGET';
            }
          }
        } else {
          formStatus = 'correct';
          this.correctFrames++;
          feedbackCode = 'TARGET_REACHED';

          if (this.lastHoldTickTime !== null) {
            const delta = now - this.lastHoldTickTime;
            if (delta > 0 && delta <= this.definition.maxTrackingGapMs + 1000) {
              this.holdElapsedMs = Math.min(holdGoalMs, this.holdElapsedMs + delta);
            }
          }
          this.lastHoldTickTime = now;
        }

        if (this.holdElapsedMs >= holdGoalMs) {
          this.holdElapsedMs = holdGoalMs;
          this.state = 'REP_COMPLETED';
          this.lastHoldTickTime = null;
          feedbackCode = 'EXERCISE_COMPLETE';
        }
      } else {
        // Exited target range: pause accumulation and reset dwell timer immediately
        this.targetEntryTime = null;
        this.lastHoldTickTime = null;
        if (inStartBand) {
          formStatus = 'neutral';
          feedbackCode = 'MOVE_TOWARD_TARGET';
          this.state = 'WAITING_FOR_START';
        } else {
          formStatus = 'incorrect';
          feedbackCode = 'FORM_OUT_OF_RANGE';
          this.state = 'MOVING_TO_TARGET';
        }
      }

      const holdComplete = this.holdElapsedMs >= holdGoalMs;
      return this.buildSnapshot({
        status: holdComplete ? 'completed' : 'tracking',
        formStatus,
        phase: holdComplete
          ? 'complete'
          : this.state === 'TARGET_REACHED'
          ? 'holding'
          : this.state === 'MOVING_TO_TARGET'
          ? 'outbound'
          : 'waiting',
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

    // Advance out of observable intermediate REP_COMPLETED on the following frame
    if (this.state === 'REP_COMPLETED' && this.repCount < repGoal) {
      this.state = 'WAITING_FOR_START';
    }

    switch (this.state) {
      case 'WAITING_FOR_START': {
        if (inStartBand) {
          feedbackCode = 'MOVE_TOWARD_TARGET';
          formStatus = 'neutral';
          this.cycleStartTime = now;
          this.state = 'MOVING_TO_TARGET';
        } else if (inBetweenCorridor) {
          // User started mid-ROM: guide cleanly toward starting position without flagging red error
          feedbackCode = 'RETURN_TO_START';
          formStatus = 'neutral';
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

          if (this.definition.targetEntryDwellMs <= 0) {
            this.state = 'TARGET_REACHED';
            this.correctFrames++;
          } else {
            if (this.targetEntryTime === null) {
              this.targetEntryTime = now;
            }
            if (now - this.targetEntryTime >= this.definition.targetEntryDwellMs) {
              this.state = 'TARGET_REACHED';
              this.correctFrames++;
            }
          }
        } else {
          this.targetEntryTime = null;
          if (inStartBand) {
            this.state = 'MOVING_TO_TARGET';
            this.cycleStartTime = now;
            formStatus = 'neutral';
            feedbackCode = 'MOVE_TOWARD_TARGET';
          } else if (inBetweenCorridor) {
            formStatus = 'neutral';
            feedbackCode = 'MOVE_TOWARD_TARGET';
          } else {
            formStatus = 'incorrect';
            feedbackCode = 'FORM_OUT_OF_RANGE';
          }
        }
        break;
      }

      case 'TARGET_REACHED': {
        const startedReturning = isDescending
          ? !inTargetBand && angleDeg > targetMax + this.HYSTERESIS_DEG
          : !inTargetBand && angleDeg < targetMin - this.HYSTERESIS_DEG;

        if (startedReturning) {
          if (inStartBand) {
            this.repCount++;
            this.state = 'REP_COMPLETED';
            this.cycleStartTime = null;
            this.targetEntryTime = null;
            formStatus = 'correct';
            feedbackCode = this.repCount >= repGoal ? 'EXERCISE_COMPLETE' : 'TARGET_REACHED';
          } else {
            this.state = 'RETURNING';
            formStatus = 'neutral';
            feedbackCode = 'RETURN_TO_START';
          }
        } else if (inTargetBand) {
          formStatus = 'correct';
          this.correctFrames++;
          feedbackCode = 'TARGET_REACHED';
        } else {
          // Overshot past target away from start
          formStatus = 'incorrect';
          feedbackCode = 'FORM_OUT_OF_RANGE';
        }
        break;
      }

      case 'RETURNING': {
        if (inStartBand) {
          this.repCount++;
          this.state = 'REP_COMPLETED';
          this.cycleStartTime = null;
          this.targetEntryTime = null;
          formStatus = 'correct';
          feedbackCode = this.repCount >= repGoal ? 'EXERCISE_COMPLETE' : 'TARGET_REACHED';
        } else if (inTargetBand) {
          this.state = 'TARGET_REACHED';
          formStatus = 'correct';
          feedbackCode = 'TARGET_REACHED';
        } else if (inBetweenCorridor) {
          formStatus = 'neutral';
          feedbackCode = 'RETURN_TO_START';
        } else {
          formStatus = 'incorrect';
          feedbackCode = 'FORM_OUT_OF_RANGE';
        }
        break;
      }

      case 'REP_COMPLETED': {
        formStatus = 'correct';
        feedbackCode = 'EXERCISE_COMPLETE';
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
