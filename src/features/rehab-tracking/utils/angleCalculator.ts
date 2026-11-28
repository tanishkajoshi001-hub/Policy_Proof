/**
 * @fileoverview 2D Image-Plane Joint Angle Calculator for Elbow Rehabilitation.
 *
 * Mathematical Algorithm:
 * Vectors originating from the elbow joint vertex (B):
 *   u = A - B  (from Elbow to Shoulder)
 *   v = C - B  (from Elbow to Wrist)
 *
 * Cosine of angle via dot product:
 *   cos(theta) = clamp((u . v) / (|u| * |v|), -1, 1)
 *   theta = acos(cos(theta)) * 180 / PI
 *
 * IMPORTANT CLINICAL & BIOMECHANICAL NOTICE:
 * This calculation operates strictly on the 2D camera image projection plane.
 * It is subject to physical limitations including out-of-plane movements (foreshortening),
 * camera perspective angle, and joint self-occlusion.
 * It provides a practical, real-time guidance metric for exercise consistency,
 * but DOES NOT claim to measure clinically accurate 3D joint angles (such as true
 * goniometer or multi-camera optical motion capture measurements).
 */

import { NormalizedLandmark, CLINICAL_VISIBILITY_THRESHOLD, POSE_LANDMARKS } from '../../../types/pose';
import { FormStatus, ExerciseAngleConfig, BodySide } from '../../../shared/contracts/motion';

/** Small tolerance to prevent division-by-zero or zero-length vectors. */
export const EPSILON = 1e-6;

export interface Point2D {
  x: number;
  y: number;
  visibility?: number;
  presence?: number;
}

export interface VideoDimensions {
  width: number;
  height: number;
}

export interface AngleCalculationResult {
  angleDeg: number | null;
  formStatus: FormStatus;
  isReliable: boolean;
  feedbackCode: string | null;
  confidenceScore: number | null;
}

/**
 * Restricts a numeric value strictly within [min, max] interval.
 * Prevents floating-point drift outside [-1, 1] for Math.acos.
 */
export function clamp(val: number, min: number, max: number): number {
  if (Number.isNaN(val)) return min;
  return Math.min(Math.max(val, min), max);
}

/**
 * Checks whether coordinate values are valid finite numbers.
 */
function isValidPoint(p: Point2D | null | undefined): p is Point2D {
  if (!p) return false;
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

/**
 * Core 2D Planar Vector Angle Algorithm (PRD Specification).
 *
 * Calculates the internal angle at `vertex` formed by points `a` and `c`.
 * Optionally scales normalized coordinates ([0, 1]) by video width and height
 * to eliminate aspect-ratio distortion (e.g. 16:9 or 4:3 camera aspect ratios).
 *
 * @param a First endpoint (e.g., Shoulder)
 * @param vertex Vertex point where angle is measured (e.g., Elbow)
 * @param c Second endpoint (e.g., Wrist)
 * @param dimensions Optional video dimensions { width, height } for pixel-space scaling
 * @returns Angle in degrees [0, 180], or null if points are missing, collinear/zero-length, NaN, or Infinite.
 */
export function angleAtVertex(
  a: Point2D | null | undefined,
  vertex: Point2D | null | undefined,
  c: Point2D | null | undefined,
  dimensions?: VideoDimensions | null
): number | null {
  // 1. Guard against missing points, NaN, or Infinity
  if (!isValidPoint(a) || !isValidPoint(vertex) || !isValidPoint(c)) {
    return null;
  }

  // 2. Coordinate scaling (default to 1.0 if dimensions omitted)
  const scaleX = dimensions && dimensions.width > 0 ? dimensions.width : 1.0;
  const scaleY = dimensions && dimensions.height > 0 ? dimensions.height : 1.0;

  const ax = a.x * scaleX;
  const ay = a.y * scaleY;
  const vx = vertex.x * scaleX;
  const vy = vertex.y * scaleY;
  const cx = c.x * scaleX;
  const cy = c.y * scaleY;

  // 3. Compute vectors originating from vertex
  const u = {
    x: ax - vx,
    y: ay - vy,
  };

  const v = {
    x: cx - vx,
    y: cy - vy,
  };

  // 4. Calculate vector magnitudes
  const nu = Math.hypot(u.x, u.y);
  const nv = Math.hypot(v.x, v.y);

  // Guard against zero-length or sub-epsilon vectors (overlapping joints)
  if (!Number.isFinite(nu) || !Number.isFinite(nv) || nu < EPSILON || nv < EPSILON) {
    return null;
  }

  // 5. Compute dot product and clamped cosine
  const dot = u.x * v.x + u.y * v.y;
  const cosine = clamp(dot / (nu * nv), -1.0, 1.0);

  // 6. Convert radians to degrees (0° to 180°)
  const angleDegrees = (Math.acos(cosine) * 180.0) / Math.PI;

  if (!Number.isFinite(angleDegrees)) {
    return null;
  }

  return Math.round(angleDegrees * 10) / 10;
}

export interface ResolvedTripletResult {
  proximal: NormalizedLandmark | null;
  vertex: NormalizedLandmark | null;
  distal: NormalizedLandmark | null;
  tripletIndices: [number, number, number] | null;
  missingLandmarks: string[];
  isReliable: boolean;
  confidenceScore: number | null;
}

const GENERIC_LANDMARK_SIDE_MAP: Record<string, { left: number; right: number }> = {
  shoulder: { left: POSE_LANDMARKS.LEFT_SHOULDER, right: POSE_LANDMARKS.RIGHT_SHOULDER },
  elbow: { left: POSE_LANDMARKS.LEFT_ELBOW, right: POSE_LANDMARKS.RIGHT_ELBOW },
  wrist: { left: POSE_LANDMARKS.LEFT_WRIST, right: POSE_LANDMARKS.RIGHT_WRIST },
  hip: { left: POSE_LANDMARKS.LEFT_HIP, right: POSE_LANDMARKS.RIGHT_HIP },
  knee: { left: POSE_LANDMARKS.LEFT_KNEE, right: POSE_LANDMARKS.RIGHT_KNEE },
  ankle: { left: POSE_LANDMARKS.LEFT_ANKLE, right: POSE_LANDMARKS.RIGHT_ANKLE },
};

/**
 * Resolves a configured landmark name (e.g. 'LEFT_KNEE', 'RIGHT_ELBOW', or 'knee')
 * to its MediaPipe 33-point index, or null if unsupported.
 */
export function resolveLandmarkIndex(
  name: string,
  side: BodySide = 'left'
): number | null {
  if (name in POSE_LANDMARKS) {
    return POSE_LANDMARKS[name as keyof typeof POSE_LANDMARKS];
  }
  const lower = name.toLowerCase();
  if (lower in GENERIC_LANDMARK_SIDE_MAP) {
    return GENERIC_LANDMARK_SIDE_MAP[lower][side];
  }
  return null;
}

/**
 * Extracts a single NormalizedLandmark by configured landmark name.
 */
export function resolveLandmarkByName(
  landmarks: NormalizedLandmark[] | null | undefined,
  name: string,
  side: BodySide = 'left'
): NormalizedLandmark | null {
  if (!landmarks || landmarks.length === 0) return null;
  const idx = resolveLandmarkIndex(name, side);
  if (idx === null) return null;
  return landmarks[idx] ?? null;
}

/**
 * Config-driven landmark triplet resolver & per-landmark confidence gate.
 * Reports exact configured landmark names that failed visibility or finite-coord checks.
 */
export function resolveConfiguredTriplet(
  landmarks: NormalizedLandmark[] | null | undefined,
  angleConfig: Pick<ExerciseAngleConfig, 'proximal' | 'vertex' | 'distal'>,
  minVisibility: number = CLINICAL_VISIBILITY_THRESHOLD,
  side: BodySide = 'left'
): ResolvedTripletResult {
  const entries: Array<{ name: string; landmark: NormalizedLandmark | null; index: number | null }> = [
    {
      name: angleConfig.proximal,
      landmark: resolveLandmarkByName(landmarks, angleConfig.proximal, side),
      index: resolveLandmarkIndex(angleConfig.proximal, side),
    },
    {
      name: angleConfig.vertex,
      landmark: resolveLandmarkByName(landmarks, angleConfig.vertex, side),
      index: resolveLandmarkIndex(angleConfig.vertex, side),
    },
    {
      name: angleConfig.distal,
      landmark: resolveLandmarkByName(landmarks, angleConfig.distal, side),
      index: resolveLandmarkIndex(angleConfig.distal, side),
    },
  ];

  const missingLandmarks: string[] = [];
  const scores: number[] = [];

  for (const item of entries) {
    const lm = item.landmark;
    if (!lm || !Number.isFinite(lm.x) || !Number.isFinite(lm.y)) {
      missingLandmarks.push(item.name);
      scores.push(0);
      continue;
    }
    const vis = lm.visibility ?? lm.presence ?? 0;
    scores.push(vis);
    if (vis < minVisibility) {
      missingLandmarks.push(item.name);
    }
  }

  const allIndicesValid = entries.every((e) => e.index !== null);
  const tripletIndices: [number, number, number] | null = allIndicesValid
    ? [entries[0].index!, entries[1].index!, entries[2].index!]
    : null;

  const avgScore =
    scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null;

  return {
    proximal: entries[0].landmark,
    vertex: entries[1].landmark,
    distal: entries[2].landmark,
    tripletIndices,
    missingLandmarks,
    isReliable: missingLandmarks.length === 0,
    confidenceScore: landmarks && landmarks.length > 0 ? avgScore : null,
  };
}

/**
 * Generic Config-Driven 3-Point Joint Angle Calculator.
 * Works for any configured joint triplet (shoulder/elbow/wrist, hip/knee/ankle, etc.)
 * and enforces the supplied `minVisibility` confidence threshold.
 */
export function calculateJointAngle(
  proximal: Point2D | null | undefined,
  vertex: Point2D | null | undefined,
  distal: Point2D | null | undefined,
  dimensionsOrAspectRatio?: VideoDimensions | number | null,
  minVisibility: number = CLINICAL_VISIBILITY_THRESHOLD
): AngleCalculationResult {
  if (!proximal || !vertex || !distal) {
    return {
      angleDeg: null,
      formStatus: 'insufficient_data',
      isReliable: false,
      feedbackCode: 'INSUFFICIENT_DATA',
      confidenceScore: null,
    };
  }

  const dimensions: VideoDimensions | null = (() => {
    if (!dimensionsOrAspectRatio) return null;
    if (typeof dimensionsOrAspectRatio === 'number') {
      return { width: dimensionsOrAspectRatio, height: 1.0 };
    }
    return dimensionsOrAspectRatio;
  })();

  const pVis = proximal.visibility ?? proximal.presence ?? 0;
  const vVis = vertex.visibility ?? vertex.presence ?? 0;
  const dVis = distal.visibility ?? distal.presence ?? 0;
  const avgConfidence = Math.round(((pVis + vVis + dVis) / 3) * 100) / 100;

  if (pVis < minVisibility || vVis < minVisibility || dVis < minVisibility) {
    return {
      angleDeg: null,
      formStatus: 'insufficient_data',
      isReliable: false,
      feedbackCode: 'INSUFFICIENT_DATA',
      confidenceScore: avgConfidence,
    };
  }

  const angle = angleAtVertex(proximal, vertex, distal, dimensions);

  if (angle === null) {
    return {
      angleDeg: null,
      formStatus: 'insufficient_data',
      isReliable: false,
      feedbackCode: 'INSUFFICIENT_DATA',
      confidenceScore: avgConfidence,
    };
  }

  return {
    angleDeg: Math.round(angle),
    formStatus: 'neutral',
    isReliable: true,
    feedbackCode: null,
    confidenceScore: avgConfidence,
  };
}

/**
 * Convenience wrapper for Elbow Flexion Angle (A = Shoulder, Vertex = Elbow, C = Wrist).
 * Delegates directly to the generic `calculateJointAngle`.
 */
export function calculateElbowAngle(
  shoulder: Point2D | null | undefined,
  elbow: Point2D | null | undefined,
  wrist: Point2D | null | undefined,
  dimensions?: VideoDimensions | null,
  minVisibility: number = CLINICAL_VISIBILITY_THRESHOLD
): AngleCalculationResult {
  return calculateJointAngle(shoulder, elbow, wrist, dimensions, minVisibility);
}

/**
 * Validates whether an elbow or wrist landmark meets clinical reliability standards.
 */
export function isArmJointReliable(landmark: NormalizedLandmark | null | undefined): boolean {
  if (!landmark) return false;
  const confidence = landmark.visibility ?? landmark.presence ?? 0;
  return confidence >= CLINICAL_VISIBILITY_THRESHOLD;
}
