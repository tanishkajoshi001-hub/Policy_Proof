export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

export type TrackingStatus =
  | 'idle'
  | 'no-person'
  | 'partially-visible'
  | 'low-confidence'
  | 'tracking-stable';

export interface KeyJointCheck {
  leftShoulder: boolean;
  rightShoulder: boolean;
  leftElbow: boolean;
  rightElbow: boolean;
  leftWrist: boolean;
  rightWrist: boolean;
  leftHip: boolean;
  rightHip: boolean;
  leftKnee: boolean;
  rightKnee: boolean;
  leftAnkle: boolean;
  rightAnkle: boolean;
}

export interface PoseFrameMetrics {
  fps: number;
  cameraFps: number;
  inferenceFps: number;
  inferenceTimeMs: number;
  avgInferenceTimeMs: number;
  p95InferenceTimeMs: number;
  activeDelegate: 'GPU' | 'CPU' | null;
  trackingStatus: TrackingStatus;
  keyJointsVisible: KeyJointCheck;
  landmarkCount: number;
  timestamp: number;
}

// MediaPipe Pose Landmark Indices (0 to 32)
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

// Anatomical connections for rendering the skeleton
export const POSE_CONNECTIONS: [number, number][] = [
  // Upper Body & Arms
  [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER],
  [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_ELBOW],
  [POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.LEFT_WRIST],
  [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW],
  [POSE_LANDMARKS.RIGHT_ELBOW, POSE_LANDMARKS.RIGHT_WRIST],
  
  // Torso
  [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_HIP],
  [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_HIP],
  [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP],

  // Lower Body & Legs
  [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE],
  [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.LEFT_ANKLE],
  [POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE],
  [POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.RIGHT_ANKLE],
];
