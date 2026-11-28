import { describe, it, expect } from 'vitest';
import {
  angleAtVertex,
  clamp,
  calculateElbowAngle,
  calculateJointAngle,
  resolveConfiguredTriplet,
  EPSILON,
} from '../features/rehab-tracking/utils/angleCalculator';
import { POSE_LANDMARKS } from '../types/pose';

describe('2D Image-Plane Joint Angle Calculator (angleAtVertex)', () => {
  const origin = { x: 0, y: 0 };

  describe('Fundamental Angles (Right, Straight, Acute, Obtuse)', () => {
    it('calculates a 90° right angle accurately', () => {
      // Vector u along +Y axis (0, 1), Vector v along +X axis (1, 0)
      const a = { x: 0, y: 1 };
      const vertex = origin;
      const c = { x: 1, y: 0 };

      const angle = angleAtVertex(a, vertex, c);
      expect(angle).toBe(90);
    });

    it('calculates a 180° straight angle accurately', () => {
      // Vector u along -X axis (-1, 0), Vector v along +X axis (1, 0)
      const a = { x: -1, y: 0 };
      const vertex = origin;
      const c = { x: 1, y: 0 };

      const angle = angleAtVertex(a, vertex, c);
      expect(angle).toBe(180);
    });

    it('calculates acute angles (45° and 60°) accurately', () => {
      // 45° angle: u = (1, 0), v = (1, 1)
      const a45 = { x: 1, y: 0 };
      const vertex = origin;
      const c45 = { x: 1, y: 1 };

      const angle45 = angleAtVertex(a45, vertex, c45);
      expect(angle45).toBe(45);

      // 60° angle: equilateral triangle geometry
      const a60 = { x: 1, y: 0 };
      const c60 = { x: 0.5, y: Math.sqrt(3) / 2 };

      const angle60 = angleAtVertex(a60, vertex, c60);
      expect(angle60).toBe(60);
    });

    it('calculates obtuse angles (120° and 135°) accurately', () => {
      // 135° angle: u = (1, 0), v = (-1, 1)
      const a135 = { x: 1, y: 0 };
      const vertex = origin;
      const c135 = { x: -1, y: 1 };

      const angle135 = angleAtVertex(a135, vertex, c135);
      expect(angle135).toBe(135);

      // 120° angle: u = (1, 0), v = (-0.5, sqrt(3)/2)
      const a120 = { x: 1, y: 0 };
      const c120 = { x: -0.5, y: Math.sqrt(3) / 2 };

      const angle120 = angleAtVertex(a120, vertex, c120);
      expect(angle120).toBe(120);
    });

    it('calculates a 0° collinear overlapping angle', () => {
      const a = { x: 2, y: 0 };
      const vertex = origin;
      const c = { x: 5, y: 0 };

      const angle = angleAtVertex(a, vertex, c);
      expect(angle).toBe(0);
    });
  });

  describe('EPSILON & Zero-Length Vector Protection', () => {
    it('returns null when endpoint coincides with vertex (zero-length vector)', () => {
      const a = { x: 0, y: 0 }; // Identical to vertex
      const vertex = origin;
      const c = { x: 1, y: 1 };

      const angle = angleAtVertex(a, vertex, c);
      expect(angle).toBeNull();
    });

    it('returns null when vector length is below EPSILON (1e-6)', () => {
      const a = { x: EPSILON / 2, y: 0 }; // Length < EPSILON
      const vertex = origin;
      const c = { x: 1, y: 1 };

      const angle = angleAtVertex(a, vertex, c);
      expect(angle).toBeNull();
    });
  });

  describe('Clamp Utility', () => {
    it('restricts values strictly within [-1, 1]', () => {
      expect(clamp(1.00000002, -1, 1)).toBe(1);
      expect(clamp(-1.00000002, -1, 1)).toBe(-1);
      expect(clamp(0.5, -1, 1)).toBe(0.5);
      expect(clamp(NaN, -1, 1)).toBe(-1);
    });
  });

  describe('Missing Points, NaN and Infinity Guardrails', () => {
    it('returns null for missing points (null or undefined)', () => {
      expect(angleAtVertex(null, origin, { x: 1, y: 1 })).toBeNull();
      expect(angleAtVertex({ x: 1, y: 1 }, undefined, { x: 1, y: 1 })).toBeNull();
      expect(angleAtVertex({ x: 1, y: 1 }, origin, null)).toBeNull();
    });

    it('returns null when coordinates contain NaN', () => {
      const a = { x: NaN, y: 1 };
      const vertex = origin;
      const c = { x: 1, y: 0 };

      expect(angleAtVertex(a, vertex, c)).toBeNull();
    });

    it('returns null when coordinates contain Infinity or -Infinity', () => {
      const a = { x: Infinity, y: 1 };
      const vertex = origin;
      const c = { x: 1, y: -Infinity };

      expect(angleAtVertex(a, vertex, c)).toBeNull();
    });
  });

  describe('Coordinate Scaling with Video Dimensions', () => {
    it('scales normalized [0, 1] coordinates by actual video width and height', () => {
      // Normalized coordinates in a 16:9 video (1280 x 720)
      // Shoulder at (0.5, 0.2), Elbow at (0.5, 0.5), Wrist at (0.7, 0.5)
      // In pixel space:
      // Shoulder = (640, 144) -> u = (0, -216)
      // Elbow    = (640, 360)
      // Wrist    = (896, 360) -> v = (256, 0)
      // u . v = 0 -> exactly 90 degrees
      const shoulder = { x: 0.5, y: 0.2 };
      const elbow = { x: 0.5, y: 0.5 };
      const wrist = { x: 0.7, y: 0.5 };

      const angle = angleAtVertex(shoulder, elbow, wrist, { width: 1280, height: 720 });
      expect(angle).toBe(90);
    });

    it('produces distorted angles if aspect ratio is ignored versus correctly scaled', () => {
      // Without scaling (assuming 1:1), dx = 0.2, dy = 0.2 gives 90 deg because dx=dy
      // But in 16:9 (1280 x 720), pixel dx = 256, dy = 144, changing the angle!
      const a = { x: 0.3, y: 0.3 };
      const vertex = { x: 0.5, y: 0.5 };
      const c = { x: 0.7, y: 0.7 };

      // In any scaling, points on the same diagonal line are straight (180°)
      const angleStraight = angleAtVertex(a, vertex, c, { width: 1280, height: 720 });
      expect(angleStraight).toBe(180);
    });

    it('preserves anatomical angle under horizontal mirror reflection and handles invalid dimensions safely', () => {
      const shoulder = { x: 0.25, y: 0.3 };
      const elbow = { x: 0.4, y: 0.55 };
      const wrist = { x: 0.6, y: 0.45 };

      const unmirrored = angleAtVertex(shoulder, elbow, wrist, { width: 1280, height: 720 });
      const mirrored = angleAtVertex(
        { x: 1 - shoulder.x, y: shoulder.y },
        { x: 1 - elbow.x, y: elbow.y },
        { x: 1 - wrist.x, y: wrist.y },
        { width: 1280, height: 720 }
      );

      expect(unmirrored).not.toBeNull();
      expect(mirrored).toBe(unmirrored);

      // Invalid zero/negative video dimensions fall back safely without NaN
      const safeFallback = angleAtVertex(shoulder, elbow, wrist, { width: 0, height: -10 });
      expect(safeFallback).not.toBeNull();
      expect(Number.isFinite(safeFallback)).toBe(true);
    });
  });

  describe('Elbow Angle & Clinical Visibility Gating', () => {
    it('returns "insufficient_data" when elbow or wrist visibility is below 0.65 threshold', () => {
      const shoulder = { x: 0.2, y: 0.5, visibility: 0.9 };
      const elbow = { x: 0.5, y: 0.5, visibility: 0.55 }; // Weak elbow visibility
      const wrist = { x: 0.5, y: 0.2, visibility: 0.85 };

      const result = calculateElbowAngle(shoulder, elbow, wrist);
      expect(result.formStatus).toBe('insufficient_data');
      expect(result.angleDeg).toBeNull();
      expect(result.isReliable).toBe(false);
      expect(result.feedbackCode).toBe('INSUFFICIENT_DATA');
    });

    it('returns reliable angle when all three joints meet >= 0.65 threshold', () => {
      const shoulder = { x: 0.2, y: 0.5, visibility: 0.9 };
      const elbow = { x: 0.5, y: 0.5, visibility: 0.85 };
      const wrist = { x: 0.5, y: 0.2, visibility: 0.85 };

      const result = calculateElbowAngle(shoulder, elbow, wrist);
      expect(result.formStatus).toBe('neutral');
      expect(result.isReliable).toBe(true);
      expect(result.angleDeg).toBe(90);
    });

    it('resolves non-elbow configured triplets (LEFT_HIP -> LEFT_KNEE -> LEFT_ANKLE) and respects minVisibility', () => {
      const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
      landmarks[POSE_LANDMARKS.LEFT_HIP] = { x: 0.5, y: 0.2, z: 0, visibility: 0.85 };
      landmarks[POSE_LANDMARKS.LEFT_KNEE] = { x: 0.5, y: 0.5, z: 0, visibility: 0.85 };
      landmarks[POSE_LANDMARKS.LEFT_ANKLE] = { x: 0.7, y: 0.5, z: 0, visibility: 0.72 };

      const tripletOk = resolveConfiguredTriplet(
        landmarks,
        { proximal: 'LEFT_HIP', vertex: 'LEFT_KNEE', distal: 'LEFT_ANKLE' },
        0.7,
        'left'
      );
      expect(tripletOk.isReliable).toBe(true);
      expect(tripletOk.tripletIndices).toEqual([23, 25, 27]);

      const angleOk = calculateJointAngle(
        tripletOk.proximal,
        tripletOk.vertex,
        tripletOk.distal,
        { width: 1000, height: 1000 },
        0.7
      );
      expect(angleOk.isReliable).toBe(true);
      expect(angleOk.angleDeg).toBe(90);

      // With stricter minVisibility=0.75, LEFT_ANKLE (0.72) must fail and report exact configured name
      const tripletLow = resolveConfiguredTriplet(
        landmarks,
        { proximal: 'LEFT_HIP', vertex: 'LEFT_KNEE', distal: 'LEFT_ANKLE' },
        0.75,
        'left'
      );
      expect(tripletLow.isReliable).toBe(false);
      expect(tripletLow.missingLandmarks).toEqual(['LEFT_ANKLE']);
    });
  });
});
