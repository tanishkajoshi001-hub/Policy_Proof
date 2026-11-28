import { describe, it, expect, beforeEach } from 'vitest';
import { RepStateMachine } from '../features/rehab-tracking/services/repStateMachine';
import {
  ELBOW_FLEXION_EXTENSION_REP,
  ELBOW_ISOMETRIC_HOLD,
} from '../features/rehab-tracking/config/exercises';
import { CLINICAL_VISIBILITY_THRESHOLD } from '../types/pose';

describe('Motion Workbench & Rep/Hold Tracking Logic', () => {
  describe('Exercise Catalog Verification', () => {
    it('provides elbow_flexion_extension_rep marked as demo_unvalidated', () => {
      expect(ELBOW_FLEXION_EXTENSION_REP.id).toBe('elbow_flexion_extension_rep');
      expect(ELBOW_FLEXION_EXTENSION_REP.mode).toBe('rep');
      expect(ELBOW_FLEXION_EXTENSION_REP.clinicianReviewStatus).toBe('demo_unvalidated');
      expect(ELBOW_FLEXION_EXTENSION_REP.angle.startRangeDeg).toEqual([145, 180]);
      expect(ELBOW_FLEXION_EXTENSION_REP.angle.targetRangeDeg).toEqual([50, 75]);
      expect(ELBOW_FLEXION_EXTENSION_REP.angle.toleranceDeg).toBe(10);
    });

    it('provides elbow_isometric_hold marked as demo_unvalidated', () => {
      expect(ELBOW_ISOMETRIC_HOLD.id).toBe('elbow_isometric_hold');
      expect(ELBOW_ISOMETRIC_HOLD.mode).toBe('hold');
      expect(ELBOW_ISOMETRIC_HOLD.clinicianReviewStatus).toBe('demo_unvalidated');
      expect(ELBOW_ISOMETRIC_HOLD.holdSeconds).toBe(3);
    });
  });

  describe('Full Repetition State Machine Diagnostics', () => {
    let sm: RepStateMachine;

    beforeEach(() => {
      sm = new RepStateMachine(ELBOW_FLEXION_EXTENSION_REP);
    });

    it('displays WAITING_FOR_START and returns MOVE_TOWARD_TARGET when user reaches starting range', () => {
      const snap = sm.update({
        angleDeg: 165, // within [145, 180]
        confidence: 0.95,
        isReliable: true,
        now: 1000,
      });

      expect(snap.phase).toBe('outbound');
      expect(snap.repCount).toBe(0);
      expect(snap.feedbackCode).toBe('MOVE_TOWARD_TARGET');
    });

    it('transitions to MOVING_TO_TARGET as arm flexes towards target', () => {
      sm.update({ angleDeg: 165, confidence: 0.95, isReliable: true, now: 1000 });
      const snap = sm.update({ angleDeg: 110, confidence: 0.95, isReliable: true, now: 1200 });

      expect(snap.phase).toBe('outbound');
      expect(snap.feedbackCode).toBe('MOVE_TOWARD_TARGET');
    });

    it('reaches TARGET_REACHED after holding for dwell time (>= 200ms)', () => {
      sm.update({ angleDeg: 165, confidence: 0.95, isReliable: true, now: 1000 });
      sm.update({ angleDeg: 110, confidence: 0.95, isReliable: true, now: 1200 });
      sm.update({ angleDeg: 60, confidence: 0.95, isReliable: true, now: 1400 });

      // After 200ms dwell in target range [50, 75]
      const snap = sm.update({ angleDeg: 60, confidence: 0.95, isReliable: true, now: 1650 });
      expect(snap.phase).toBe('target');
      expect(snap.feedbackCode).toBe('TARGET_REACHED');
    });

    it('does NOT count rep if user moves to target but fails to return to start', () => {
      sm.update({ angleDeg: 165, confidence: 0.95, isReliable: true, now: 1000 });
      sm.update({ angleDeg: 60, confidence: 0.95, isReliable: true, now: 1200 });
      sm.update({ angleDeg: 60, confidence: 0.95, isReliable: true, now: 1450 });

      // Partial extension, not returning to start
      const snap = sm.update({ angleDeg: 100, confidence: 0.95, isReliable: true, now: 1600 });
      expect(snap.phase).toBe('returning');
      expect(snap.repCount).toBe(0); // MUST NOT COUNT
    });

    it('counts +1 repetition ONLY when full Start -> Target -> Return cycle is verified', () => {
      sm.update({ angleDeg: 165, confidence: 0.95, isReliable: true, now: 1000 });
      sm.update({ angleDeg: 60, confidence: 0.95, isReliable: true, now: 1200 });
      sm.update({ angleDeg: 60, confidence: 0.95, isReliable: true, now: 1450 });
      sm.update({ angleDeg: 120, confidence: 0.95, isReliable: true, now: 1600 });

      // Full return to start [145, 180]
      const snap = sm.update({ angleDeg: 160, confidence: 0.95, isReliable: true, now: 1800 });
      expect(snap.repCount).toBe(1);
    });

    it('returns insufficient_data and POSE_NOT_CLEAR when landmark visibility drops below threshold', () => {
      sm.update({ angleDeg: 165, confidence: 0.95, isReliable: true, now: 1000 });

      // Confidence drops below 0.65 threshold
      const snap = sm.update({
        angleDeg: 160,
        confidence: CLINICAL_VISIBILITY_THRESHOLD - 0.1, // 0.55
        isReliable: false,
        missingLandmarks: ['elbow', 'wrist'],
        now: 1200,
      });

      expect(snap.formStatus).toBe('insufficient_data');
      expect(snap.feedbackCode).toBe('POSE_NOT_CLEAR');
    });

    it('returns PERSON_NOT_VISIBLE when person disappears from frame', () => {
      sm.update({ angleDeg: 165, confidence: 0.95, isReliable: true, now: 1000 });

      const snap = sm.update({
        angleDeg: null,
        confidence: 0,
        isReliable: false,
        isPersonVisible: false,
        missingLandmarks: ['person'],
        now: 1200,
      });

      expect(snap.formStatus).toBe('insufficient_data');
      expect(snap.feedbackCode).toBe('PERSON_NOT_VISIBLE');
    });
  });

  describe('Hold Mode Diagnostics & Monotonic Timer', () => {
    it('accumulates holdElapsedMs when within target range and pauses when out of range', () => {
      const holdSm = new RepStateMachine(ELBOW_ISOMETRIC_HOLD);

      // In target range [50, 70]
      holdSm.update({ angleDeg: 60, confidence: 0.95, isReliable: true, now: 1000 });
      const snap1 = holdSm.update({ angleDeg: 60, confidence: 0.95, isReliable: true, now: 2000 });
      expect(snap1.holdElapsedMs).toBe(1000);
      expect(snap1.holdComplete).toBe(false);
      expect(snap1.feedbackCode).toBe('TARGET_REACHED');

      // Leaves target range -> pauses hold timer
      const snap2 = holdSm.update({ angleDeg: 150, confidence: 0.95, isReliable: true, now: 3000 });
      expect(snap2.holdElapsedMs).toBe(1000); // Paused at 1000ms
      expect(snap2.feedbackCode).toBe('MOVE_TOWARD_TARGET');

      // Resumes holding
      holdSm.update({ angleDeg: 60, confidence: 0.95, isReliable: true, now: 3500 });
      const snap4 = holdSm.update({ angleDeg: 60, confidence: 0.95, isReliable: true, now: 5500 });
      expect(snap4.holdElapsedMs).toBe(3000);
      expect(snap4.holdComplete).toBe(true);
      expect(snap4.feedbackCode).toBe('EXERCISE_COMPLETE');
    });
  });
});
