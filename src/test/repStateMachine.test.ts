import { describe, it, expect, beforeEach } from 'vitest';
import { RepStateMachine } from '../features/rehab-tracking/services/repStateMachine';
import {
  ELBOW_FLEXION_EXTENSION_REP,
  ELBOW_ISOMETRIC_HOLD,
} from '../features/rehab-tracking/config/exercises';

describe('Person 3 Repetition, Hold Timer & Structured Feedback', () => {
  let repStateMachine: RepStateMachine;

  beforeEach(() => {
    repStateMachine = new RepStateMachine(ELBOW_FLEXION_EXTENSION_REP);
  });

  describe('Medical Safety & Configuration Gating', () => {
    it('stores demo exercise definitions explicitly marked as "demo_unvalidated"', () => {
      expect(ELBOW_FLEXION_EXTENSION_REP.clinicianReviewStatus).toBe('demo_unvalidated');
      expect(ELBOW_ISOMETRIC_HOLD.clinicianReviewStatus).toBe('demo_unvalidated');
      expect(ELBOW_FLEXION_EXTENSION_REP.id).toBe('elbow_flexion_extension_rep');
      expect(ELBOW_ISOMETRIC_HOLD.id).toBe('elbow_isometric_hold');
    });
  });

  describe('Repetition Mode (elbow_flexion_extension_rep)', () => {
    it('counts exactly 1 repetition only after a complete valid cycle (Start -> Target -> Return)', () => {
      let now = 1000;

      // 1. Initial position: Extended arm in start range (160°)
      let snap = repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(0);
      expect(snap.phase).toBe('outbound'); // Transitioned to MOVING_TO_TARGET

      // 2. Moving toward target (e.g. 110°)
      now += 300;
      snap = repStateMachine.update({ angleDeg: 110, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(0);
      expect(snap.phase).toBe('outbound');
      expect(snap.feedbackCode).toBe('MOVE_TOWARD_TARGET');

      // 3. Enters target range (60°), dwell timer starts
      now += 300;
      snap = repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(0);

      // Satisfy dwell interval (targetEntryDwellMs = 200ms)
      now += 250;
      snap = repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.phase).toBe('target'); // TARGET_REACHED
      expect(snap.feedbackCode).toBe('TARGET_REACHED');
      expect(snap.repCount).toBe(0);

      // 4. Starts extending arm back toward start (110°)
      now += 300;
      snap = repStateMachine.update({ angleDeg: 110, confidence: 0.9, isReliable: true, now });
      expect(snap.phase).toBe('returning');
      expect(snap.feedbackCode).toBe('RETURN_TO_START');
      expect(snap.repCount).toBe(0);

      // 5. Successfully returns into starting position (160°)
      now += 300;
      snap = repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });

      // Valid cycle complete! Count +1
      expect(snap.repCount).toBe(1);
    });

    it('DOES NOT count a repetition if user flexes to target but fails to return to start position', () => {
      let now = 1000;

      // User starts at 160°
      repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });

      // Reaches target (60°) and dwells
      now += 300;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 250;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });

      // Starts returning but stops half-way at 110°
      now += 300;
      const snap = repStateMachine.update({ angleDeg: 110, confidence: 0.9, isReliable: true, now });

      expect(snap.phase).toBe('returning');
      expect(snap.feedbackCode).toBe('RETURN_TO_START');
      expect(snap.repCount).toBe(0); // Not counted yet!

      // Multiple frames at 110°: must remain uncounted
      now += 200;
      const snap2 = repStateMachine.update({ angleDeg: 110, confidence: 0.9, isReliable: true, now });
      expect(snap2.repCount).toBe(0);
    });

    it('DOES NOT count a repetition if user returns to start without reaching target range', () => {
      let now = 1000;

      // Start at 160°
      repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });

      // Bends only to 100° (never reached target 45°-75°)
      now += 300;
      repStateMachine.update({ angleDeg: 100, confidence: 0.9, isReliable: true, now });

      // Aborts and straightens back to 160°
      now += 300;
      const snap = repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });

      expect(snap.repCount).toBe(0);
      expect(snap.phase).toBe('outbound'); // Re-initialized cycle
    });

    it('prevents duplicate counts and enforces single increment per completed cycle', () => {
      let now = 1000;

      // Complete one valid rep
      repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      now += 200;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 250;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 200;
      repStateMachine.update({ angleDeg: 110, confidence: 0.9, isReliable: true, now });
      now += 200;
      let snap = repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(1);

      // Remaining at 160° over several subsequent frames does not increment again
      now += 100;
      snap = repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(1);

      now += 100;
      snap = repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(1);
    });

    it('rejects rapid jitter and requires targetEntryDwellMs before accepting TARGET_REACHED', () => {
      let now = 1000;
      repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });

      // Micro-jitter into target range for only 50ms (less than 200ms dwell)
      now += 200;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 50;
      const snap = repStateMachine.update({ angleDeg: 95, confidence: 0.9, isReliable: true, now });

      // Must remain in outbound moving phase; not target reached
      expect(snap.phase).toBe('outbound');
    });

    it('pauses state machine and freezes count on prolonged confidence loss (> maxTrackingGapMs or debounce)', () => {
      let now = 1000;
      repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      now += 200;
      repStateMachine.update({ angleDeg: 90, confidence: 0.9, isReliable: true, now });

      // Loss of confidence / obscured wrist exceeding maxTrackingGapMs
      now += 1500;
      const snap = repStateMachine.update({
        angleDeg: null,
        confidence: 0.3,
        isReliable: false,
        missingLandmarks: ['LEFT_WRIST'],
        now,
      });

      expect(snap.status).toBe('low_confidence');
      expect(snap.formStatus).toBe('insufficient_data');
      expect(snap.feedbackCode).toBe('POSE_NOT_CLEAR');
      expect(repStateMachine.getState()).toBe('PAUSED_LOW_CONFIDENCE');
    });

    it('supports ascending-angle exercises (e.g., 25° start -> 160° target -> 25° return) without deadlocking', () => {
      const ascendingDef = {
        ...ELBOW_FLEXION_EXTENSION_REP,
        id: 'ascending_demo',
        angle: {
          proximal: 'LEFT_SHOULDER',
          vertex: 'LEFT_ELBOW',
          distal: 'LEFT_WRIST',
          startRangeDeg: [10, 40] as [number, number],
          targetRangeDeg: [150, 175] as [number, number],
          toleranceDeg: 10,
        },
        targetEntryDwellMs: 0,
      };
      const sm = new RepStateMachine(ascendingDef);

      let now = 1000;
      let snap = sm.update({ angleDeg: 25, confidence: 0.95, isReliable: true, now });
      expect(snap.phase).toBe('outbound');

      now += 200;
      snap = sm.update({ angleDeg: 95, confidence: 0.95, isReliable: true, now });
      expect(snap.phase).toBe('outbound');
      expect(snap.feedbackCode).toBe('MOVE_TOWARD_TARGET');

      // Single-frame target touch with targetEntryDwellMs = 0 transitions immediately
      now += 200;
      snap = sm.update({ angleDeg: 160, confidence: 0.95, isReliable: true, now });
      expect(snap.phase).toBe('target');
      expect(snap.feedbackCode).toBe('TARGET_REACHED');

      // Exiting target downward (95° < 140 - 3) enters returning phase
      now += 200;
      snap = sm.update({ angleDeg: 95, confidence: 0.95, isReliable: true, now });
      expect(snap.phase).toBe('returning');
      expect(snap.feedbackCode).toBe('RETURN_TO_START');

      // Returning to start [10, 40] counts rep 1 and emits observable 'complete' phase
      now += 200;
      snap = sm.update({ angleDeg: 25, confidence: 0.95, isReliable: true, now });
      expect(snap.repCount).toBe(1);
      expect(snap.phase).toBe('complete');

      // Following frame transitions cleanly into next cycle without double-counting
      now += 200;
      snap = sm.update({ angleDeg: 25, confidence: 0.95, isReliable: true, now });
      expect(snap.repCount).toBe(1);
      expect(snap.phase).toBe('outbound');
    });

    it('rejects impossible angular-velocity jumps (30/60fps landmark teleport spikes)', () => {
      let now = 1000;
      repStateMachine.update({ angleDeg: 165, confidence: 0.95, isReliable: true, now });

      // 135° jump in 33ms (4090 deg/s) -> must reject as POSE_NOT_CLEAR
      now += 33;
      const glitchSnap = repStateMachine.update({ angleDeg: 30, confidence: 0.95, isReliable: true, now });
      expect(glitchSnap.formStatus).toBe('insufficient_data');
      expect(glitchSnap.feedbackCode).toBe('POSE_NOT_CLEAR');
      expect(glitchSnap.missingLandmarks).toContain('angle_jump_rejected');
      expect(repStateMachine.getState()).toBe('MOVING_TO_TARGET');
    });

    it('tolerates brief confidence flicker (< maxTrackingGapMs) without wiping valid rep cycle progress', () => {
      let now = 1000;
      repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      now += 200;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 250;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(repStateMachine.getState()).toBe('TARGET_REACHED');

      // 150ms brief flicker (< 1000ms maxTrackingGapMs)
      now += 150;
      const flickerSnap = repStateMachine.update({
        angleDeg: null,
        confidence: 0.4,
        isReliable: false,
        now,
      });
      expect(flickerSnap.formStatus).toBe('insufficient_data');
      expect(flickerSnap.feedbackCode).toBe('POSE_NOT_CLEAR');
      expect(repStateMachine.getState()).toBe('TARGET_REACHED');

      // Recover and complete return to start
      now += 200;
      repStateMachine.update({ angleDeg: 110, confidence: 0.9, isReliable: true, now });
      now += 200;
      const completeSnap = repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      expect(completeSnap.repCount).toBe(1);
    });

    it('does not double-count on repeated target oscillation before returning to start', () => {
      let now = 1000;
      repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      now += 200;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 250;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });

      // Oscillate between returning (95°) and target (65°) multiple times without returning to start [145, 180]
      now += 200;
      let snap = repStateMachine.update({ angleDeg: 95, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(0);
      now += 200;
      snap = repStateMachine.update({ angleDeg: 65, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(0);
      now += 200;
      snap = repStateMachine.update({ angleDeg: 100, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(0);

      // Finally returns to start
      now += 200;
      snap = repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(1);
    });

    it('rejects excessively long incomplete cycles exceeding maxCycleDurationMs', () => {
      const guardedDef = { ...ELBOW_FLEXION_EXTENSION_REP, maxCycleDurationMs: 5000 };
      const sm = new RepStateMachine(guardedDef);

      let now = 1000;
      sm.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      now += 300;
      sm.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 300;
      sm.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });

      // Stalls for > 5000ms before returning to start
      now += 5500;
      const snap = sm.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      expect(snap.repCount).toBe(0);
      expect(sm.getState()).toBe('WAITING_FOR_START');
    });

    it('rejects stale or backwards frame timestamps without advancing hold time or reps', () => {
      const holdSm = new RepStateMachine(ELBOW_ISOMETRIC_HOLD);
      holdSm.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now: 2000 });
      const valid = holdSm.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now: 2500 });
      expect(valid.holdElapsedMs).toBe(500);

      // Duplicate timestamp (2500) and backwards timestamp (2400) must NOT advance hold time
      const dup = holdSm.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now: 2500 });
      expect(dup.holdElapsedMs).toBe(500);
      expect(dup.formStatus).toBe('insufficient_data');

      const back = holdSm.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now: 2400 });
      expect(back.holdElapsedMs).toBe(500);
      expect(back.formStatus).toBe('insufficient_data');

      // Resuming with monotonic timestamp 3000 does NOT count stale gap duration
      const resumed = holdSm.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now: 3000 });
      expect(resumed.holdElapsedMs).toBe(500);
    });
  });

  describe('Hold Mode (elbow_isometric_hold) & Separate Metrics Return', () => {
    let holdStateMachine: RepStateMachine;

    beforeEach(() => {
      holdStateMachine = new RepStateMachine(ELBOW_ISOMETRIC_HOLD);
    });

    it('returns elapsed time, goal time, and completion separately', () => {
      let now = 1000;

      // Enter target range
      let snap = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(0);
      expect(snap.holdGoalMs).toBe(3000); // 3 seconds goal
      expect(snap.holdComplete).toBe(false);

      // Halfway hold (1500ms)
      now += 1500;
      snap = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(1500);
      expect(snap.holdGoalMs).toBe(3000);
      expect(snap.holdComplete).toBe(false);

      // getHoldMetrics separately returns all three
      const metrics = holdStateMachine.getHoldMetrics();
      expect(metrics.holdElapsedMs).toBe(1500);
      expect(metrics.holdGoalMs).toBe(3000);
      expect(metrics.holdComplete).toBe(false);

      // Full hold completed (3000ms)
      now += 1500;
      snap = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(3000);
      expect(snap.holdGoalMs).toBe(3000);
      expect(snap.holdComplete).toBe(true);
      expect(snap.feedbackCode).toBe('EXERCISE_COMPLETE');
    });

    it('starts accumulation ONLY when target posture and confidence requirements are met', () => {
      let now = 1000;

      // In start range (160°): timer should NOT start
      let snap = holdStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(0);
      expect(snap.phase).toBe('waiting');

      now += 1000;
      snap = holdStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(0);

      // Moving towards target (100°): timer should NOT start
      now += 500;
      snap = holdStateMachine.update({ angleDeg: 100, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(0);

      // Enters target range (60°): must satisfy targetEntryDwellMs (150ms) before starting hold timer
      now += 500;
      snap = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.phase).toBe('outbound');
      expect(snap.holdElapsedMs).toBe(0);

      // Brief 50ms touch below 150ms dwell still must NOT accrue hold time
      now += 50;
      snap = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.phase).toBe('outbound');
      expect(snap.holdElapsedMs).toBe(0);

      // Once 150ms dwell passes continuously, hold timer starts and counts full continuous hold
      now += 150;
      snap = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.phase).toBe('holding');
      expect(snap.holdElapsedMs).toBe(200);

      now += 800;
      snap = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(1000);
    });

    it('strictly caps holdElapsedMs at holdGoalMs after completion without over-accumulating', () => {
      let now = 1000;
      holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 1500;
      holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 1500;
      const done1 = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(done1.holdElapsedMs).toBe(3000);
      expect(done1.holdComplete).toBe(true);
      expect(done1.status).toBe('completed');

      // Subsequent ticks after completion must keep holdElapsedMs capped at 3000ms
      now += 1000;
      const done2 = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(done2.holdElapsedMs).toBe(3000);
      expect(done2.holdComplete).toBe(true);
    });

    it('pauses immediately if the user leaves the target range', () => {
      let now = 1000;

      // Start hold at 60°
      holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 1000;
      let snap = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(1000);

      // User drifts to 95° (outside target band 50°-70°): pause immediately!
      now += 1000;
      snap = holdStateMachine.update({ angleDeg: 95, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(1000); // Does NOT accumulate time while out of range
      expect(snap.feedbackCode).toBe('FORM_OUT_OF_RANGE');

      // Stays out of range for another 2000ms: timer remains paused
      now += 2000;
      snap = holdStateMachine.update({ angleDeg: 95, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(1000);

      // Re-enters target range (60°): accumulation resumes
      now += 500;
      holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 1000;
      snap = holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(snap.holdElapsedMs).toBe(2000);
    });

    it('freezes hold timer immediately when tracking is interrupted or confidence is lost', () => {
      let now = 1000;
      holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 1000;
      holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(holdStateMachine.getHoldElapsedMs()).toBe(1000);

      // Tracking lost for 1500ms
      now += 1500;
      const snap = holdStateMachine.update({
        angleDeg: null,
        confidence: 0.2,
        isReliable: false,
        now,
      });

      expect(snap.holdElapsedMs).toBe(1000); // Frozen at 1000ms
      expect(snap.holdComplete).toBe(false);
      expect(snap.formStatus).toBe('insufficient_data');
      expect(snap.feedbackCode).toBe('POSE_NOT_CLEAR');
    });

    it('freezes timer on explicit freeze() call during camera or tab interruption', () => {
      let now = 1000;
      holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 1000;
      holdStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      expect(holdStateMachine.getHoldElapsedMs()).toBe(1000);

      // External freeze triggered by camera interruption
      holdStateMachine.freeze();

      // Subsequent update after pause
      now += 2000;
      const snap = holdStateMachine.update({
        angleDeg: null,
        confidence: 0.0,
        isReliable: false,
        now,
      });

      expect(snap.holdElapsedMs).toBe(1000);
    });
  });

  describe('Structured Feedback Code Emission', () => {
    it('emits PERSON_NOT_VISIBLE when no subject is detected in camera', () => {
      const snap = repStateMachine.update({
        angleDeg: null,
        confidence: 0,
        isReliable: false,
        isPersonVisible: false,
      });

      expect(snap.feedbackCode).toBe('PERSON_NOT_VISIBLE');
      expect(snap.status).toBe('no_person');
    });

    it('emits POSE_NOT_CLEAR when landmarks are degraded or missing', () => {
      const snap = repStateMachine.update({
        angleDeg: null,
        confidence: 0.4,
        isReliable: false,
        isPersonVisible: true,
        missingLandmarks: ['leftWrist'],
      });

      expect(snap.feedbackCode).toBe('POSE_NOT_CLEAR');
      expect(snap.formStatus).toBe('insufficient_data');
    });

    it('guides cleanly with RETURN_TO_START when starting mid-ROM and emits FORM_OUT_OF_RANGE when outside ROM', () => {
      const midRomSnap = repStateMachine.update({
        angleDeg: 115, // Between target [50, 75]+10 and start [145, 180]
        confidence: 0.9,
        isReliable: true,
        now: 1000,
      });

      expect(midRomSnap.feedbackCode).toBe('RETURN_TO_START');
      expect(midRomSnap.formStatus).toBe('neutral');

      const outOfRomSnap = repStateMachine.update({
        angleDeg: 25, // Below targetMin (40)
        confidence: 0.9,
        isReliable: true,
        now: 1200,
      });

      expect(outOfRomSnap.feedbackCode).toBe('FORM_OUT_OF_RANGE');
      expect(outOfRomSnap.formStatus).toBe('incorrect');
    });

    it('emits MOVE_TOWARD_TARGET when arm is in position and moving', () => {
      let now = 1000;
      repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      now += 200;
      const snap = repStateMachine.update({ angleDeg: 120, confidence: 0.9, isReliable: true, now });

      expect(snap.feedbackCode).toBe('MOVE_TOWARD_TARGET');
    });

    it('emits TARGET_REACHED when arm reaches target angle with dwell satisfied', () => {
      let now = 1000;
      repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      now += 200;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 250;
      const snap = repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });

      expect(snap.feedbackCode).toBe('TARGET_REACHED');
    });

    it('emits RETURN_TO_START while user is extending arm back to complete cycle', () => {
      let now = 1000;
      repStateMachine.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      now += 200;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 250;
      repStateMachine.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 200;
      const snap = repStateMachine.update({ angleDeg: 110, confidence: 0.9, isReliable: true, now });

      expect(snap.feedbackCode).toBe('RETURN_TO_START');
      expect(snap.phase).toBe('returning');
    });

    it('emits EXERCISE_COMPLETE when repGoal is achieved', () => {
      let now = 1000;
      const quickDef = { ...ELBOW_FLEXION_EXTENSION_REP, repGoal: 1 };
      const sm = new RepStateMachine(quickDef);

      sm.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });
      now += 200;
      sm.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 250;
      sm.update({ angleDeg: 60, confidence: 0.9, isReliable: true, now });
      now += 200;
      sm.update({ angleDeg: 110, confidence: 0.9, isReliable: true, now });
      now += 200;
      const snap = sm.update({ angleDeg: 160, confidence: 0.9, isReliable: true, now });

      expect(snap.repCount).toBe(1);
      expect(snap.feedbackCode).toBe('EXERCISE_COMPLETE');
      expect(snap.status).toBe('completed');
    });

    it('emits corrective feedback within 1000ms threshold when a posture error occurs', () => {
      const t0 = performance.now();
      const snap = repStateMachine.update({
        angleDeg: 20, // Outside valid ROM (< targetMin 40)
        confidence: 0.9,
        isReliable: true,
        now: t0,
      });
      const t1 = performance.now();

      expect(snap.feedbackCode).toBe('FORM_OUT_OF_RANGE');
      expect(snap.formStatus).toBe('incorrect');
      expect(t1 - t0).toBeLessThan(1000);
    });
  });
});
