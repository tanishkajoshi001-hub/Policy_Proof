import { describe, it, expect } from 'vitest';
import {
  ELBOW_FLEXION_EXTENSION_REP,
  ELBOW_ISOMETRIC_HOLD,
  validateExerciseDefinition,
} from '../features/rehab-tracking/config/exercises';
import { ExerciseDefinition } from '../features/rehab-tracking/types';

describe('Exercise Configuration Schema Validator (PRD Table 10.1)', () => {
  it('accepts valid demo rep and hold configurations', () => {
    expect(validateExerciseDefinition(ELBOW_FLEXION_EXTENSION_REP)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateExerciseDefinition(ELBOW_ISOMETRIC_HOLD)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects missing required fields (id, name, angle)', () => {
    const missing = {
      ...ELBOW_FLEXION_EXTENSION_REP,
      id: '',
      name: '',
      angle: undefined as unknown as ExerciseDefinition['angle'],
    };
    const res = validateExerciseDefinition(missing);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('Missing exercise ID');
    expect(res.errors).toContain('Missing exercise name');
    expect(res.errors).toContain('Missing angle configuration');
  });

  it('rejects invalid angle ranges (min > max, out of [0, 180], negative tolerance)', () => {
    const invalidAngles: ExerciseDefinition = {
      ...ELBOW_FLEXION_EXTENSION_REP,
      angle: {
        ...ELBOW_FLEXION_EXTENSION_REP.angle,
        startRangeDeg: [180, 120],
        targetRangeDeg: [-10, 200],
        toleranceDeg: -5,
      },
    };
    const res = validateExerciseDefinition(invalidAngles);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('startRangeDeg min cannot exceed max');
    expect(res.errors).toContain('targetRangeDeg values must be finite numbers within [0, 180]');
    expect(res.errors).toContain('toleranceDeg must be non-negative');
  });

  it('rejects non-positive goals in rep and hold modes', () => {
    const zeroRep: ExerciseDefinition = {
      ...ELBOW_FLEXION_EXTENSION_REP,
      repGoal: 0,
    };
    const zeroHold: ExerciseDefinition = {
      ...ELBOW_ISOMETRIC_HOLD,
      holdSeconds: -2,
    };

    expect(validateExerciseDefinition(zeroRep).valid).toBe(false);
    expect(validateExerciseDefinition(zeroRep).errors).toContain(
      'Repetition mode must define a positive repGoal'
    );

    expect(validateExerciseDefinition(zeroHold).valid).toBe(false);
    expect(validateExerciseDefinition(zeroHold).errors).toContain(
      'Hold mode must define a positive holdSeconds target'
    );
  });

  it('rejects unsupported landmark names', () => {
    const badLandmark: ExerciseDefinition = {
      ...ELBOW_FLEXION_EXTENSION_REP,
      angle: {
        ...ELBOW_FLEXION_EXTENSION_REP.angle,
        proximal: 'UNKNOWN_JOINT',
        distal: 'INVALID_WRIST',
      },
    };
    const res = validateExerciseDefinition(badLandmark);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('Unsupported proximal landmark'))).toBe(true);
    expect(res.errors.some((e) => e.includes('Unsupported distal landmark'))).toBe(true);
  });
});
