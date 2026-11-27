/**
 * @fileoverview Exercise Posture Evaluator with Clinical Confidence Gating.
 *
 * Compares computed joint angles against exercise specifications (startAngle, targetAngle, tolerance).
 * Enforces rule:
 * If the elbow or wrist cannot be detected reliably, returns 'insufficient_data',
 * NEVER an incorrect posture result ('needs-adjustment').
 */

import { FormStatus } from '../../../shared/contracts/motion';
import { AngleCalculationResult } from './angleCalculator';

export interface FormEvaluationResult {
  formStatus: FormStatus;
  feedbackCode: string | null;
  message: string;
  isWithinTargetRange: boolean;
  deviationDeg: number | null;
}

export interface ExerciseToleranceParams {
  startAngleDeg: number;
  targetAngleDeg: number;
  toleranceDeg: number;
}

/**
 * Evaluates patient posture based on calculated joint angle and confidence gating.
 */
export function evaluatePostureForm(
  angleResult: AngleCalculationResult,
  params: ExerciseToleranceParams
): FormEvaluationResult {
  // 1. If landmark visibility is weak or elbow/wrist is not reliable: return insufficient_data
  if (!angleResult.isReliable || angleResult.angleDeg === null) {
    return {
      formStatus: 'insufficient_data',
      feedbackCode: 'INSUFFICIENT_DATA',
      message: 'Joint position unclear. Please ensure elbow and wrist are in full view of the camera.',
      isWithinTargetRange: false,
      deviationDeg: null,
    };
  }

  const { targetAngleDeg, toleranceDeg } = params;
  const currentAngle = angleResult.angleDeg;
  const lowerBound = targetAngleDeg - toleranceDeg;
  const upperBound = targetAngleDeg + toleranceDeg;

  // 2. Check if user is within the target inflection / hold zone
  const isWithinTarget = currentAngle >= lowerBound && currentAngle <= upperBound;

  if (isWithinTarget) {
    return {
      formStatus: 'correct',
      feedbackCode: 'FORM_CORRECT',
      message: 'Great form! Hold this position.',
      isWithinTargetRange: true,
      deviationDeg: Math.abs(currentAngle - targetAngleDeg),
    };
  }

  // 3. User is moving toward target or has not reached target yet
  const deviation = Math.abs(currentAngle - targetAngleDeg);

  return {
    formStatus: 'needs-adjustment',
    feedbackCode: currentAngle > targetAngleDeg ? 'ADJUST_TOO_HIGH' : 'ADJUST_TOO_LOW',
    message: currentAngle > targetAngleDeg ? 'Move slightly lower.' : 'Lift slightly higher.',
    isWithinTargetRange: false,
    deviationDeg: deviation,
  };
}
