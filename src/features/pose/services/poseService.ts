import { FilesetResolver, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { NormalizedLandmark, TrackingStatus, KeyJointCheck, POSE_LANDMARKS } from '../../../types/pose';

const LOCAL_WASM_PATH = '/wasm';
const LOCAL_MODEL_PATH = '/models/pose_landmarker_lite.task';
const CDN_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

export type PoseDelegate = 'GPU' | 'CPU';

export interface DetectFrameOutput {
  landmarks: NormalizedLandmark[] | null;
  rawResult: PoseLandmarkerResult | null;
  isNewFrame: boolean;
  inferenceTimeMs: number;
  avgInferenceTimeMs: number;
  p95InferenceTimeMs: number;
  inferenceFps: number;
  cameraFps: number;
  activeDelegate: PoseDelegate | null;
}

export class PoseService {
  private landmarker: PoseLandmarker | null = null;
  private activeDelegate: PoseDelegate | null = null;
  private isInitializing = false;
  private lastVideoTime = -1;
  private lastLandmarks: NormalizedLandmark[] | null = null;
  private lastRawResult: PoseLandmarkerResult | null = null;

  // Performance monitoring
  private inferenceTimestamps: number[] = [];
  private cameraFrameTimestamps: number[] = [];
  private inferenceDurationsMs: number[] = [];
  private lastInferenceTimeMs = 0;

  /**
   * Initializes the PoseLandmarker using local assets with GPU acceleration (default)
   * or an explicit delegate, falling back cleanly to CPU if GPU fails.
   */
  public async initialize(preferredDelegate: PoseDelegate = 'GPU'): Promise<PoseLandmarker> {
    if (this.landmarker && this.activeDelegate === preferredDelegate) {
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
      // 1. Resolve WASM assets (local first, CDN emergency fallback only if local fails)
      let vision;
      try {
        vision = await FilesetResolver.forVisionTasks(LOCAL_WASM_PATH);
      } catch (wasmError) {
        console.warn('Local WASM loading failed, attempting CDN fallback:', wasmError);
        vision = await FilesetResolver.forVisionTasks(CDN_WASM_PATH);
      }

      const createWithDelegate = async (delegate: PoseDelegate) => {
        return PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: LOCAL_MODEL_PATH,
            delegate,
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      };

      // 2. Initialize Landmarker with requested delegate, falling back to CPU if GPU fails
      if (preferredDelegate === 'CPU') {
        this.landmarker = await createWithDelegate('CPU');
        this.activeDelegate = 'CPU';
      } else {
        try {
          this.landmarker = await createWithDelegate('GPU');
          this.activeDelegate = 'GPU';
        } catch (gpuError) {
          console.warn('GPU delegate failed or unsupported, falling back to CPU:', gpuError);
          this.landmarker = await createWithDelegate('CPU');
          this.activeDelegate = 'CPU';
        }
      }

      return this.landmarker;
    } catch (finalError) {
      console.error('Failed to initialize MediaPipe PoseLandmarker:', finalError);
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
   * Records arrival of a new hardware/media camera video frame (independent of inference rate).
   */
  public recordCameraFrame(now: number = performance.now()): void {
    this.cameraFrameTimestamps.push(now);
    this.cameraFrameTimestamps = this.cameraFrameTimestamps.filter((t) => now - t <= 1000);
  }

  /**
   * Processes a video frame and extracts 33 pose landmarks.
   * When the display refreshes faster than the camera frame rate, preserves the
   * previous landmarks without clearing the skeleton overlay or spiking false states.
   */
  public detectVideoFrame(
    videoElement: HTMLVideoElement,
    hasExternalCameraFrameTracker = false
  ): DetectFrameOutput {
    if (!this.landmarker || videoElement.readyState < 2) {
      return {
        landmarks: null,
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

    if (currentTime === this.lastVideoTime) {
      return {
        landmarks: this.lastLandmarks,
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
    this.inferenceDurationsMs.push(inferenceTime);
    if (this.inferenceDurationsMs.length > 120) {
      this.inferenceDurationsMs.shift();
    }

    this.inferenceTimestamps.push(endTime);
    this.inferenceTimestamps = this.inferenceTimestamps.filter((t) => endTime - t <= 1000);

    const landmarks = result.landmarks && result.landmarks.length > 0 ? result.landmarks[0] : null;
    this.lastLandmarks = landmarks;
    this.lastRawResult = result;

    return {
      landmarks,
      rawResult: result,
      isNewFrame: true,
      inferenceTimeMs: Math.round(inferenceTime),
      avgInferenceTimeMs: this.getAverageLatencyMs(),
      p95InferenceTimeMs: this.getP95LatencyMs(),
      inferenceFps: this.getInferenceFps(endTime),
      cameraFps: this.getCameraFps(endTime),
      activeDelegate: this.activeDelegate,
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
      const vis = lm.visibility ?? lm.presence ?? 1.0;
      return vis >= 0.65;
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

    let status: TrackingStatus = 'tracking-stable';

    if (totalVisibleJoints === 0) {
      status = 'low-confidence';
    } else if (upperJointsCount < 3) {
      status = 'partially-visible';
    } else {
      status = 'tracking-stable';
    }

    return {
      trackingStatus: status,
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
    this.inferenceTimestamps = [];
    this.cameraFrameTimestamps = [];
    this.inferenceDurationsMs = [];
    this.lastInferenceTimeMs = 0;
    this.lastVideoTime = -1;
    this.lastLandmarks = null;
    this.lastRawResult = null;
  }
}

export const poseService = new PoseService();
