/**
 * @fileoverview Configuration-Driven Exercise Definitions.
 *
 * MEDICAL SAFETY NOTICE:
 * The angles, hold times, and rep targets defined here (e.g., 160° start, 60° target,
 * 10° tolerance, 3-second hold, 10 reps) are illustrative engineering placeholders for
 * technology verification. They are explicitly marked as "demo_unvalidated".
 * They DO NOT constitute medically approved or clinician-prescribed rehabilitation protocols.
 */

import { ExerciseDefinition } from '../types';
import { POSE_LANDMARKS } from '../../../types/pose';

const SUPPORTED_LANDMARK_NAMES = new Set<string>([
  ...Object.keys(POSE_LANDMARKS),
  'shoulder',
  'elbow',
  'wrist',
  'hip',
  'knee',
  'ankle',
]);

/**
 * 1. Elbow Flexion & Extension (Repetition Mode)
 * Tracks full cyclic movement: Start position (extension) -> Bending to target (flexion) -> Return to start.
 */
export const ELBOW_FLEXION_EXTENSION_REP: ExerciseDefinition = {
  id: 'elbow_flexion_extension_rep',
  name: 'Elbow Flexion-Extension (Rep Mode)',
  bodyRegion: 'upper_limb',
  side: 'left',
  mode: 'rep',
  angle: {
    proximal: 'LEFT_SHOULDER',
    vertex: 'LEFT_ELBOW',
    distal: 'LEFT_WRIST',
    startRangeDeg: [145, 180], // Starting extended arm position (~160°)
    targetRangeDeg: [50, 75],   // Target inflection flexion (~60°)
    toleranceDeg: 10,
  },
  repGoal: 10,
  holdSeconds: null,
  minLandmarkVisibility: 0.65,
  targetEntryDwellMs: 200,      // Anti-jitter dwell threshold
  maxTrackingGapMs: 1000,       // Max permissible tracking occlusion before pause
  clinicianReviewStatus: 'demo_unvalidated',
};

/**
 * 2. Elbow Isometric Hold (Hold Mode)
 * Measures sustained duration maintaining the target angle posture.
 */
export const ELBOW_ISOMETRIC_HOLD: ExerciseDefinition = {
  id: 'elbow_isometric_hold',
  name: 'Elbow Isometric Hold (Hold Mode)',
  bodyRegion: 'upper_limb',
  side: 'left',
  mode: 'hold',
  angle: {
    proximal: 'LEFT_SHOULDER',
    vertex: 'LEFT_ELBOW',
    distal: 'LEFT_WRIST',
    startRangeDeg: [145, 180],
    targetRangeDeg: [50, 70],   // Sustained 60° target posture
    toleranceDeg: 10,
  },
  repGoal: null,
  holdSeconds: 3,               // 3-second sustained hold goal
  minLandmarkVisibility: 0.65,
  targetEntryDwellMs: 150,
  maxTrackingGapMs: 1000,
  clinicianReviewStatus: 'demo_unvalidated',
};

/**
 * Exercise Catalog Registry.
 * Configuration-driven: adding new exercises does NOT require modifying evaluator code.
 */
export const DEMO_EXERCISES: Record<string, ExerciseDefinition> = {
  elbow_flexion_extension_rep: ELBOW_FLEXION_EXTENSION_REP,
  elbow_isometric_hold: ELBOW_ISOMETRIC_HOLD,
};

export const EXERCISE_CATALOG: ExerciseDefinition[] = Object.values(DEMO_EXERCISES);

export function getExerciseDefinition(id: string): ExerciseDefinition | undefined {
  return DEMO_EXERCISES[id];
}

export function getAllExerciseDefinitions(): ExerciseDefinition[] {
  return Object.values(DEMO_EXERCISES);
}

/**
 * Validates that an ExerciseDefinition contains all required non-empty fields and sensible bounds.
 */
export function validateExerciseDefinition(def: ExerciseDefinition): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!def.id) errors.push('Missing exercise ID');
  if (!def.name) errors.push('Missing exercise name');
  if (def.mode !== 'rep' && def.mode !== 'hold') errors.push('Invalid mode (must be "rep" or "hold")');
  if (!def.angle) {
    errors.push('Missing angle configuration');
  } else {
    if (!def.angle.proximal || !def.angle.vertex || !def.angle.distal) {
      errors.push('Angle must specify proximal, vertex, and distal landmark names');
    } else {
      for (const [role, name] of [
        ['proximal', def.angle.proximal],
        ['vertex', def.angle.vertex],
        ['distal', def.angle.distal],
      ] as const) {
        if (!SUPPORTED_LANDMARK_NAMES.has(name)) {
          errors.push(`Unsupported ${role} landmark: "${name}"`);
        }
      }
    }
    const [sMin, sMax] = def.angle.startRangeDeg;
    const [tMin, tMax] = def.angle.targetRangeDeg;
    if (!Number.isFinite(sMin) || !Number.isFinite(sMax) || sMin < 0 || sMax > 180) {
      errors.push('startRangeDeg values must be finite numbers within [0, 180]');
    }
    if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMin < 0 || tMax > 180) {
      errors.push('targetRangeDeg values must be finite numbers within [0, 180]');
    }
    if (sMin > sMax) {
      errors.push('startRangeDeg min cannot exceed max');
    }
    if (tMin > tMax) {
      errors.push('targetRangeDeg min cannot exceed max');
    }
    if (!Number.isFinite(def.angle.toleranceDeg) || def.angle.toleranceDeg < 0) {
      errors.push('toleranceDeg must be non-negative');
    }
  }

  if (def.targetEntryDwellMs < 0 || !Number.isFinite(def.targetEntryDwellMs)) {
    errors.push('targetEntryDwellMs must be non-negative');
  }
  if (def.maxTrackingGapMs < 0 || !Number.isFinite(def.maxTrackingGapMs)) {
    errors.push('maxTrackingGapMs must be non-negative');
  }

  if (def.mode === 'rep' && (def.repGoal === null || def.repGoal <= 0)) {
    errors.push('Repetition mode must define a positive repGoal');
  }

  if (def.mode === 'hold' && (def.holdSeconds === null || def.holdSeconds <= 0)) {
    errors.push('Hold mode must define a positive holdSeconds target');
  }

  if (def.minLandmarkVisibility <= 0 || def.minLandmarkVisibility > 1.0) {
    errors.push('minLandmarkVisibility must be within (0, 1]');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
