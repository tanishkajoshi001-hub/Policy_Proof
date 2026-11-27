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

import { NormalizedLandmark, CLINICAL_VISIBILITY_THRESHOLD } from '../../../types/pose';
import { FormStatus } from '../../../shared/contracts/motion';

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

/**
 * Specialized Elbow Flexion Angle Calculator (A = Shoulder, Vertex = Elbow, C = Wrist).
 *
 * Strictly enforces clinical visibility threshold (0.65):
 * If the elbow or wrist cannot be detected reliably, returns 'insufficient_data',
 * NEVER an incorrect posture result.
 */
export function calculateElbowAngle(
  shoulder: Point2D | null | undefined,
  elbow: Point2D | null | undefined,
  wrist: Point2D | null | undefined,
  dimensions?: VideoDimensions | null
): AngleCalculationResult {
  if (!shoulder || !elbow || !wrist) {
    return {
      angleDeg: null,
      formStatus: 'insufficient_data',
      isReliable: false,
      feedbackCode: 'INSUFFICIENT_DATA',
      confidenceScore: null,
    };
  }

  const sVis = shoulder.visibility ?? shoulder.presence ?? 0;
  const eVis = elbow.visibility ?? elbow.presence ?? 0;
  const wVis = wrist.visibility ?? wrist.presence ?? 0;

  // Confidence check: If elbow or wrist is below 0.65, do not report an angle
  if (
    sVis < CLINICAL_VISIBILITY_THRESHOLD ||
    eVis < CLINICAL_VISIBILITY_THRESHOLD ||
    wVis < CLINICAL_VISIBILITY_THRESHOLD
  ) {
    return {
      angleDeg: null,
      formStatus: 'insufficient_data',
      isReliable: false,
      feedbackCode: 'INSUFFICIENT_DATA',
      confidenceScore: Math.round(((sVis + eVis + wVis) / 3) * 100) / 100,
    };
  }

  const angle = angleAtVertex(shoulder, elbow, wrist, dimensions);

  if (angle === null) {
    return {
      angleDeg: null,
      formStatus: 'insufficient_data',
      isReliable: false,
      feedbackCode: 'INSUFFICIENT_DATA',
      confidenceScore: Math.round(((sVis + eVis + wVis) / 3) * 100) / 100,
    };
  }

  return {
    angleDeg: Math.round(angle),
    formStatus: 'neutral',
    isReliable: true,
    feedbackCode: null,
    confidenceScore: Math.round(((sVis + eVis + wVis) / 3) * 100) / 100,
  };
}

/**
 * General Joint Angle Calculator adhering to RehabTrackingController specifications.
 */
export function calculateJointAngle(
  proximal: Point2D | null | undefined,
  vertex: Point2D | null | undefined,
  distal: Point2D | null | undefined,
  dimensionsOrAspectRatio?: VideoDimensions | number | null
): AngleCalculationResult {
  const dimensions: VideoDimensions | null = (() => {
    if (!dimensionsOrAspectRatio) return null;
    if (typeof dimensionsOrAspectRatio === 'number') {
      return { width: dimensionsOrAspectRatio, height: 1.0 };
    }
    return dimensionsOrAspectRatio;
  })();

  return calculateElbowAngle(proximal, vertex, distal, dimensions);
}

/**
 * Validates whether an elbow or wrist landmark meets clinical reliability standards.
 */
export function isArmJointReliable(landmark: NormalizedLandmark | null | undefined): boolean {
  if (!landmark) return false;
  const confidence = landmark.visibility ?? landmark.presence ?? 0;
  return confidence >= CLINICAL_VISIBILITY_THRESHOLD;
}
