/**
 * @fileoverview MediaPipe PoseLandmarker Integration Service.
 *
 * License & Attribution:
 * - Library: @mediapipe/tasks-vision (pinned version: 0.10.35)
 * - License: Apache License 2.0 (Google LLC)
 * - Model: pose_landmarker_lite.task (Apache 2.0)
 * - Binaries: WebAssembly runtime in /public/wasm/ (Apache 2.0)
 *
 * Core Biomechanical Guarantees:
 * 1. 100% on-device WebAssembly/WebGL inference processing live camera frames.
 * 2. Zero fake or simulated landmarks in production tracking.
 * 3. Extracts and maps both left and right sides of Shoulder, Elbow, Wrist, Hip, Knee, and Ankle joints.
 * 4. Strictly validates landmark visibility/confidence against the 0.65 threshold.
 *    If the elbow or wrist cannot be detected reliably, returns 'insufficient_data',
 *    NEVER an incorrect posture result.
 */

import { FilesetResolver, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import {
  NormalizedLandmark,
  TrackingStatus,
  KeyJointCheck,
  POSE_LANDMARKS,
  MappedRehabilitationJoints,
  RehabilitationJoint,
  ArmReliabilityCheck,
  CLINICAL_VISIBILITY_THRESHOLD,
} from '../../../types/pose';

const LOCAL_WASM_PATH = '/wasm';
const LOCAL_MODEL_PATH = '/models/pose_landmarker_lite.task';

export type PoseDelegate = 'GPU' | 'CPU';
export type { MappedRehabilitationJoints };

export interface DetectFrameOutput {
  landmarks: NormalizedLandmark[] | null;
  mappedJoints: MappedRehabilitationJoints | null;
  armReliability: ArmReliabilityCheck;
  rawResult: PoseLandmarkerResult | null;
  isNewFrame: boolean;
  inferenceTimeMs: number;
  avgInferenceTimeMs: number;
  p95InferenceTimeMs: number;
  inferenceFps: number;
  cameraFps: number;
  activeDelegate: PoseDelegate | null;
  warmupComplete?: boolean;
  warmupDurationMs?: number;
}

export class PoseService {
  private landmarker: PoseLandmarker | null = null;
  private activeDelegate: PoseDelegate | null = null;
  private isInitializing = false;
  private lastVideoTime = -1;
  private lastLandmarks: NormalizedLandmark[] | null = null;
  private lastRawResult: PoseLandmarkerResult | null = null;

  // Performance monitoring (excludes initial cold-start shader/WASM warmup frames)
  private readonly WARMUP_FRAMES = 5;
  private warmupFramesRemaining = 5;
  private warmupDurationMs = 0;
  private inferenceTimestamps: number[] = [];
  private cameraFrameTimestamps: number[] = [];
  private inferenceDurationsMs: number[] = [];
  private lastInferenceTimeMs = 0;
  private latestDetection: DetectFrameOutput | null = null;

  /**
   * Initializes the MediaPipe PoseLandmarker using locally served model and WASM assets.
   * Leverages GPU acceleration by default, with automatic fallback to CPU (XNNPACK).
   */
  public async initialize(preferredDelegate: PoseDelegate = 'GPU'): Promise<PoseLandmarker> {
    if (this.landmarker && this.activeDelegate === preferredDelegate) {
      this.resetMetrics();
      return this.landmarker;
    }

    if (this.landmarker && this.activeDelegate !== preferredDelegate) {
      this.close();
    }

    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (this.landmarker) return this.landmarker;
    }

    this.isInitializing = true;

    try {
      // 1. Resolve WASM assets strictly from local /public/wasm/ (no external CDN calls)
      const vision = await FilesetResolver.forVisionTasks(LOCAL_WASM_PATH);

      const createWithDelegate = async (delegate: PoseDelegate) => {
        return PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: LOCAL_MODEL_PATH,
            delegate,
          },
          // Single-pose mode (`numPoses: 1`) tracks MediaPipe's primary subject;
          // multi-person ambiguity gating is a documented hackathon limitation.
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      };

      // 2. Initialize Landmarker with requested delegate, falling back cleanly to CPU if GPU fails
      if (preferredDelegate === 'CPU') {
        this.landmarker = await createWithDelegate('CPU');
        this.activeDelegate = 'CPU';
      } else {
        try {
          this.landmarker = await createWithDelegate('GPU');
          this.activeDelegate = 'GPU';
        } catch (gpuError) {
          console.warn('GPU delegate failed or unsupported on this device, falling back to CPU (XNNPACK):', gpuError);
          this.landmarker = await createWithDelegate('CPU');
          this.activeDelegate = 'CPU';
        }
      }

      this.resetMetrics();
      return this.landmarker;
    } catch (finalError) {
      console.error('Failed to initialize MediaPipe PoseLandmarker from local assets:', finalError);
      this.activeDelegate = null;
      throw finalError;
    } finally {
      this.isInitializing = false;
    }
  }

  public getActiveDelegate(): PoseDelegate | null {
    return this.activeDelegate;
  }

  /**
   * Records arrival of a new hardware camera video frame.
   */
  public recordCameraFrame(now: number = performance.now()): void {
    this.cameraFrameTimestamps.push(now);
    this.cameraFrameTimestamps = this.cameraFrameTimestamps.filter((t) => now - t <= 1000);
  }

  /**
   * Processes an actual video frame from the camera, extracting 33 normalized landmarks
   * and mapping rehabilitation joints.
   *
   * Guarantees that only real video frames are processed (no synthetic data in production).
   */
  public detectVideoFrame(
    videoElement: HTMLVideoElement,
    hasExternalCameraFrameTracker = false
  ): DetectFrameOutput {
    const defaultArmReliability: ArmReliabilityCheck = {
      status: 'insufficient_data',
      isLeftArmReliable: false,
      isRightArmReliable: false,
      isReliable: false,
      missingOrUnreliableJoints: ['leftElbow', 'leftWrist', 'rightElbow', 'rightWrist'],
      details: {
        leftElbowScore: 0,
        leftWristScore: 0,
        rightElbowScore: 0,
        rightWristScore: 0,
      },
    };

    if (
      !this.landmarker ||
      videoElement.readyState < 2 ||
      videoElement.videoWidth === 0 ||
      videoElement.videoHeight === 0
    ) {
      return {
        landmarks: null,
        mappedJoints: null,
        armReliability: defaultArmReliability,
        rawResult: null,
        isNewFrame: false,
        inferenceTimeMs: 0,
        avgInferenceTimeMs: 0,
        p95InferenceTimeMs: 0,
        inferenceFps: 0,
        cameraFps: 0,
        activeDelegate: this.activeDelegate,
      };
    }

    const now = performance.now();
    const currentTime = videoElement.currentTime;

    // Skip redundant processing if the video frame timestamp has not advanced
    if (currentTime === this.lastVideoTime) {
      const mapped = this.extractRehabilitationJoints(this.lastLandmarks);
      const armCheck = this.evaluateArmReliability(this.lastLandmarks);

      return {
        landmarks: this.lastLandmarks,
        mappedJoints: mapped,
        armReliability: armCheck,
        rawResult: this.lastRawResult,
        isNewFrame: false,
        inferenceTimeMs: Math.round(this.lastInferenceTimeMs),
        avgInferenceTimeMs: this.getAverageLatencyMs(),
        p95InferenceTimeMs: this.getP95LatencyMs(),
        inferenceFps: this.getInferenceFps(now),
        cameraFps: this.getCameraFps(now),
        activeDelegate: this.activeDelegate,
      };
    }

    this.lastVideoTime = currentTime;
    if (!hasExternalCameraFrameTracker) {
      this.recordCameraFrame(now);
    }

    const startTime = performance.now();
    const result = this.landmarker.detectForVideo(videoElement, startTime);
    const endTime = performance.now();
    const inferenceTime = endTime - startTime;

    this.lastInferenceTimeMs = inferenceTime;
    if (this.warmupFramesRemaining > 0) {
      this.warmupFramesRemaining--;
      this.warmupDurationMs += inferenceTime;
    } else {
      this.inferenceDurationsMs.push(inferenceTime);
      if (this.inferenceDurationsMs.length > 120) {
        this.inferenceDurationsMs.shift();
      }

      this.inferenceTimestamps.push(endTime);
      this.inferenceTimestamps = this.inferenceTimestamps.filter((t) => endTime - t <= 1000);
    }

    const landmarks = result.landmarks && result.landmarks.length > 0 ? result.landmarks[0] : null;
    this.lastLandmarks = landmarks;
    this.lastRawResult = result;

    const mappedJoints = this.extractRehabilitationJoints(landmarks);
    const armReliability = this.evaluateArmReliability(landmarks);

    const output: DetectFrameOutput = {
      landmarks,
      mappedJoints,
      armReliability,
      rawResult: result,
      isNewFrame: true,
      inferenceTimeMs: Math.round(inferenceTime),
      avgInferenceTimeMs: this.getAverageLatencyMs(),
      p95InferenceTimeMs: this.getP95LatencyMs(),
      inferenceFps: this.getInferenceFps(endTime),
      cameraFps: this.getCameraFps(endTime),
      activeDelegate: this.activeDelegate,
      warmupComplete: this.warmupFramesRemaining === 0,
      warmupDurationMs: Math.round(this.warmupDurationMs),
    };
    this.latestDetection = output;
    return output;
  }

  public getLatestDetection(): DetectFrameOutput | null {
    return this.latestDetection;
  }

  /**
   * Maps MediaPipe keypoints into the 6 rehabilitation joint pairs for both left and right sides:
   * - Shoulder (11, 12)
   * - Elbow (13, 14)
   * - Wrist (15, 16)
   * - Hip (23, 24)
   * - Knee (25, 26)
   * - Ankle (27, 28)
   *
   * Each joint includes visibility scores and isReliable flag (visibility >= 0.65).
   */
  public extractRehabilitationJoints(
    landmarks: NormalizedLandmark[] | null
  ): MappedRehabilitationJoints | null {
    if (!landmarks || landmarks.length === 0) {
      return null;
    }

    const mapJoint = (
      index: number,
      bodyPart: 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle',
      side: 'left' | 'right'
    ): RehabilitationJoint | null => {
      const lm = landmarks[index];
      if (!lm) return null;
      const vis = lm.visibility ?? lm.presence ?? 0;
      const pres = lm.presence ?? lm.visibility ?? 0;

      return {
        bodyPart,
        side,
        landmarkIndex: index,
        x: lm.x,
        y: lm.y,
        z: lm.z,
        visibility: vis,
        presence: pres,
        isReliable: vis >= CLINICAL_VISIBILITY_THRESHOLD,
      };
    };

    return {
      leftShoulder: mapJoint(POSE_LANDMARKS.LEFT_SHOULDER, 'shoulder', 'left'),
      rightShoulder: mapJoint(POSE_LANDMARKS.RIGHT_SHOULDER, 'shoulder', 'right'),
      leftElbow: mapJoint(POSE_LANDMARKS.LEFT_ELBOW, 'elbow', 'left'),
      rightElbow: mapJoint(POSE_LANDMARKS.RIGHT_ELBOW, 'elbow', 'right'),
      leftWrist: mapJoint(POSE_LANDMARKS.LEFT_WRIST, 'wrist', 'left'),
      rightWrist: mapJoint(POSE_LANDMARKS.RIGHT_WRIST, 'wrist', 'right'),
      leftHip: mapJoint(POSE_LANDMARKS.LEFT_HIP, 'hip', 'left'),
      rightHip: mapJoint(POSE_LANDMARKS.RIGHT_HIP, 'hip', 'right'),
      leftKnee: mapJoint(POSE_LANDMARKS.LEFT_KNEE, 'knee', 'left'),
      rightKnee: mapJoint(POSE_LANDMARKS.RIGHT_KNEE, 'knee', 'right'),
      leftAnkle: mapJoint(POSE_LANDMARKS.LEFT_ANKLE, 'ankle', 'left'),
      rightAnkle: mapJoint(POSE_LANDMARKS.RIGHT_ANKLE, 'ankle', 'right'),
    };
  }

  /**
   * Strictly evaluates elbow and wrist visibility.
   * If the elbow or wrist cannot be detected reliably (visibility < 0.65),
   * returns 'insufficient_data' so posture evaluation will pause rather than emit false deviations.
   */
  public evaluateArmReliability(
    landmarks: NormalizedLandmark[] | null,
    targetSide: 'left' | 'right' | 'either' | 'both' = 'either'
  ): ArmReliabilityCheck {
    const getConfidence = (index: number): number => {
      if (!landmarks || !landmarks[index]) return 0;
      const lm = landmarks[index];
      return lm.visibility ?? lm.presence ?? 0;
    };

    const leftElbowScore = getConfidence(POSE_LANDMARKS.LEFT_ELBOW);
    const leftWristScore = getConfidence(POSE_LANDMARKS.LEFT_WRIST);
    const rightElbowScore = getConfidence(POSE_LANDMARKS.RIGHT_ELBOW);
    const rightWristScore = getConfidence(POSE_LANDMARKS.RIGHT_WRIST);

    const isLeftElbowReliable = leftElbowScore >= CLINICAL_VISIBILITY_THRESHOLD;
    const isLeftWristReliable = leftWristScore >= CLINICAL_VISIBILITY_THRESHOLD;
    const isRightElbowReliable = rightElbowScore >= CLINICAL_VISIBILITY_THRESHOLD;
    const isRightWristReliable = rightWristScore >= CLINICAL_VISIBILITY_THRESHOLD;

    const isLeftArmReliable = isLeftElbowReliable && isLeftWristReliable;
    const isRightArmReliable = isRightElbowReliable && isRightWristReliable;

    const missingOrUnreliableJoints: string[] = [];
    if (!isLeftElbowReliable) missingOrUnreliableJoints.push('leftElbow');
    if (!isLeftWristReliable) missingOrUnreliableJoints.push('leftWrist');
    if (!isRightElbowReliable) missingOrUnreliableJoints.push('rightElbow');
    if (!isRightWristReliable) missingOrUnreliableJoints.push('rightWrist');

    const isReliable =
      targetSide === 'left'
        ? isLeftArmReliable
        : targetSide === 'right'
        ? isRightArmReliable
        : targetSide === 'both'
        ? isLeftArmReliable && isRightArmReliable
        : isLeftArmReliable || isRightArmReliable;

    return {
      status: isReliable ? 'reliable' : 'insufficient_data',
      isLeftArmReliable,
      isRightArmReliable,
      isReliable,
      missingOrUnreliableJoints,
      details: {
        leftElbowScore,
        leftWristScore,
        rightElbowScore,
        rightWristScore,
      },
    };
  }

  /**
   * Evaluates landmark visibility against the 0.65 clinical confidence threshold.
   */
  public evaluateKeyJoints(landmarks: NormalizedLandmark[] | null): {
    trackingStatus: TrackingStatus;
    keyJoints: KeyJointCheck;
  } {
    const defaultCheck: KeyJointCheck = {
      leftShoulder: false,
      rightShoulder: false,
      leftElbow: false,
      rightElbow: false,
      leftWrist: false,
      rightWrist: false,
      leftHip: false,
      rightHip: false,
      leftKnee: false,
      rightKnee: false,
      leftAnkle: false,
      rightAnkle: false,
    };

    if (!landmarks || landmarks.length === 0) {
      return {
        trackingStatus: 'no-person',
        keyJoints: defaultCheck,
      };
    }

    const checkVisibility = (index: number): boolean => {
      const lm = landmarks[index];
      if (!lm) return false;
      const vis = lm.visibility ?? lm.presence ?? 0;
      return vis >= CLINICAL_VISIBILITY_THRESHOLD;
    };

    const check: KeyJointCheck = {
      leftShoulder: checkVisibility(POSE_LANDMARKS.LEFT_SHOULDER),
      rightShoulder: checkVisibility(POSE_LANDMARKS.RIGHT_SHOULDER),
      leftElbow: checkVisibility(POSE_LANDMARKS.LEFT_ELBOW),
      rightElbow: checkVisibility(POSE_LANDMARKS.RIGHT_ELBOW),
      leftWrist: checkVisibility(POSE_LANDMARKS.LEFT_WRIST),
      rightWrist: checkVisibility(POSE_LANDMARKS.RIGHT_WRIST),
      leftHip: checkVisibility(POSE_LANDMARKS.LEFT_HIP),
      rightHip: checkVisibility(POSE_LANDMARKS.RIGHT_HIP),
      leftKnee: checkVisibility(POSE_LANDMARKS.LEFT_KNEE),
      rightKnee: checkVisibility(POSE_LANDMARKS.RIGHT_KNEE),
      leftAnkle: checkVisibility(POSE_LANDMARKS.LEFT_ANKLE),
      rightAnkle: checkVisibility(POSE_LANDMARKS.RIGHT_ANKLE),
    };

    const upperJointsCount =
      (check.leftShoulder ? 1 : 0) +
      (check.rightShoulder ? 1 : 0) +
      (check.leftElbow ? 1 : 0) +
      (check.rightElbow ? 1 : 0) +
      (check.leftWrist ? 1 : 0) +
      (check.rightWrist ? 1 : 0);

    const lowerJointsCount =
      (check.leftHip ? 1 : 0) +
      (check.rightHip ? 1 : 0) +
      (check.leftKnee ? 1 : 0) +
      (check.rightKnee ? 1 : 0) +
      (check.leftAnkle ? 1 : 0) +
      (check.rightAnkle ? 1 : 0);

    const totalVisibleJoints = upperJointsCount + lowerJointsCount;

    let resolvedStatus: TrackingStatus;
    if (totalVisibleJoints === 0) {
      resolvedStatus = 'low-confidence';
    } else if (upperJointsCount < 3) {
      resolvedStatus = 'partially-visible';
    } else {
      resolvedStatus = 'tracking-stable';
    }

    return {
      trackingStatus: resolvedStatus,
      keyJoints: check,
    };
  }

  public getAverageLatencyMs(): number {
    if (this.inferenceDurationsMs.length === 0) return 0;
    const sum = this.inferenceDurationsMs.reduce((acc, v) => acc + v, 0);
    return Math.round((sum / this.inferenceDurationsMs.length) * 10) / 10;
  }

  public getP95LatencyMs(): number {
    if (this.inferenceDurationsMs.length === 0) return 0;
    const sorted = [...this.inferenceDurationsMs].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
    return Math.round(sorted[idx] * 10) / 10;
  }

  private getInferenceFps(now: number = performance.now()): number {
    this.inferenceTimestamps = this.inferenceTimestamps.filter((t) => now - t <= 1000);
    return this.inferenceTimestamps.length;
  }

  private getCameraFps(now: number = performance.now()): number {
    this.cameraFrameTimestamps = this.cameraFrameTimestamps.filter((t) => now - t <= 1000);
    return this.cameraFrameTimestamps.length;
  }

  /** Resets rolling FPS/latency telemetry and warmup window. */
  public resetMetrics(): void {
    this.warmupFramesRemaining = this.WARMUP_FRAMES;
    this.warmupDurationMs = 0;
    this.inferenceTimestamps = [];
    this.cameraFrameTimestamps = [];
    this.inferenceDurationsMs = [];
    this.lastInferenceTimeMs = 0;
    this.latestDetection = null;
  }

  public close(): void {
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch {
        // Ignore close errors
      }
      this.landmarker = null;
    }
    this.activeDelegate = null;
    this.resetMetrics();
    this.lastVideoTime = -1;
    this.lastLandmarks = null;
    this.lastRawResult = null;
  }
}

export const poseService = new PoseService();
