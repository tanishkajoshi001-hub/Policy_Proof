/**
 * @fileoverview Person 3 Motion Intelligence & Pose Tracking Engine Barrel.
 * Reference: RehabBuddy_PRD_30pct_Person3_Motion_Engine.pdf (Section 8.3).
 */

// Public contracts and types
export * from './types';

// Exercise catalog & validator
export * from './config/exercises';

// State machine & controller
export { RepStateMachine } from './services/repStateMachine';
export {
  RehabTrackingControllerImpl,
  createRehabTrackingController,
} from './services/rehabTrackingController';

// Geometric calculation utilities
export {
  angleAtVertex,
  calculateElbowAngle,
  calculateJointAngle,
  clamp,
  isArmJointReliable,
  EPSILON,
} from './utils/angleCalculator';

// Form evaluation utilities
export { evaluatePostureForm } from './utils/formEvaluator';

// Reusable Video & Canvas Surface
export {
  PoseTrackingSurface,
  type PoseTrackingSurfaceProps,
} from './components/PoseTrackingSurface';

// Developer Diagnostics Page
export { MotionWorkbench } from './workbench/MotionWorkbench';
