import { describe, it, expect, vi } from 'vitest';
import { PoseService } from '../features/pose/services/poseService';
import { NormalizedLandmark, POSE_LANDMARKS } from '../types/pose';
import { calculateJointAngle } from '../features/rehab-tracking/utils/angleCalculator';
import { evaluatePostureForm } from '../features/rehab-tracking/utils/formEvaluator';

describe('PoseService Key Joint Mapping & Confidence Validation', () => {
  const poseService = new PoseService();

  const createDummyLandmarks = (visibilityScore = 0.9): NormalizedLandmark[] => {
    return Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0.0,
      visibility: visibilityScore,
      presence: visibilityScore,
    }));
  };

  it('reports "no-person" when landmarks array is null or empty', () => {
    const res1 = poseService.evaluateKeyJoints(null);
    expect(res1.trackingStatus).toBe('no-person');

    const res2 = poseService.evaluateKeyJoints([]);
    expect(res2.trackingStatus).toBe('no-person');
  });

  it('maps both left and right sides for Shoulder, Elbow, Wrist, Hip, Knee, and Ankle', () => {
    const landmarks = createDummyLandmarks(0.85);

    // Assign unique distinct test coordinates to verify mappings
    landmarks[POSE_LANDMARKS.LEFT_SHOULDER].x = 0.11;
    landmarks[POSE_LANDMARKS.RIGHT_SHOULDER].x = 0.12;
    landmarks[POSE_LANDMARKS.LEFT_ELBOW].x = 0.13;
    landmarks[POSE_LANDMARKS.RIGHT_ELBOW].x = 0.14;
    landmarks[POSE_LANDMARKS.LEFT_WRIST].x = 0.15;
    landmarks[POSE_LANDMARKS.RIGHT_WRIST].x = 0.16;
    landmarks[POSE_LANDMARKS.LEFT_HIP].x = 0.23;
    landmarks[POSE_LANDMARKS.RIGHT_HIP].x = 0.24;
    landmarks[POSE_LANDMARKS.LEFT_KNEE].x = 0.25;
    landmarks[POSE_LANDMARKS.RIGHT_KNEE].x = 0.26;
    landmarks[POSE_LANDMARKS.LEFT_ANKLE].x = 0.27;
    landmarks[POSE_LANDMARKS.RIGHT_ANKLE].x = 0.28;

    const mapped = poseService.extractRehabilitationJoints(landmarks);
    expect(mapped).not.toBeNull();

    // Shoulder verification
    expect(mapped?.leftShoulder?.x).toBe(0.11);
    expect(mapped?.leftShoulder?.isReliable).toBe(true);
    expect(mapped?.rightShoulder?.x).toBe(0.12);
    expect(mapped?.rightShoulder?.isReliable).toBe(true);

    // Elbow verification
    expect(mapped?.leftElbow?.x).toBe(0.13);
    expect(mapped?.leftElbow?.isReliable).toBe(true);
    expect(mapped?.rightElbow?.x).toBe(0.14);
    expect(mapped?.rightElbow?.isReliable).toBe(true);

    // Wrist verification
    expect(mapped?.leftWrist?.x).toBe(0.15);
    expect(mapped?.leftWrist?.isReliable).toBe(true);
    expect(mapped?.rightWrist?.x).toBe(0.16);
    expect(mapped?.rightWrist?.isReliable).toBe(true);

    // Hip verification
    expect(mapped?.leftHip?.x).toBe(0.23);
    expect(mapped?.rightHip?.x).toBe(0.24);

    // Knee verification
    expect(mapped?.leftKnee?.x).toBe(0.25);
    expect(mapped?.rightKnee?.x).toBe(0.26);

    // Ankle verification
    expect(mapped?.leftAnkle?.x).toBe(0.27);
    expect(mapped?.rightAnkle?.x).toBe(0.28);
  });

  it('returns "insufficient_data" when elbow or wrist visibility is below 0.65 threshold', () => {
    const landmarks = createDummyLandmarks(0.9);

    // Degrade left elbow visibility below 0.65
    landmarks[POSE_LANDMARKS.LEFT_ELBOW].visibility = 0.45;

    const check = poseService.evaluateArmReliability(landmarks, 'left');
    expect(check.status).toBe('insufficient_data');
    expect(check.isLeftArmReliable).toBe(false);
    expect(check.missingOrUnreliableJoints).toContain('leftElbow');

    // Calculate angle for elbow flexion [shoulder, elbow, wrist]
    const angleResult = calculateJointAngle(
      landmarks[POSE_LANDMARKS.LEFT_SHOULDER],
      landmarks[POSE_LANDMARKS.LEFT_ELBOW],
      landmarks[POSE_LANDMARKS.LEFT_WRIST]
    );

    // Must return insufficient_data, NOT an incorrect posture result
    expect(angleResult.formStatus).toBe('insufficient_data');
    expect(angleResult.angleDeg).toBeNull();
    expect(angleResult.isReliable).toBe(false);

    // Evaluate posture form: must return insufficient_data, not needs-adjustment
    const formResult = evaluatePostureForm(angleResult, {
      startAngleDeg: 160,
      targetAngleDeg: 60,
      toleranceDeg: 10,
    });

    expect(formResult.formStatus).toBe('insufficient_data');
    expect(formResult.feedbackCode).toBe('INSUFFICIENT_DATA');
  });

  it('returns "insufficient_data" when wrist visibility is below 0.65 threshold', () => {
    const landmarks = createDummyLandmarks(0.9);

    // Degrade right wrist visibility below 0.65
    landmarks[POSE_LANDMARKS.RIGHT_WRIST].visibility = 0.52;

    const check = poseService.evaluateArmReliability(landmarks, 'right');
    expect(check.status).toBe('insufficient_data');
    expect(check.isRightArmReliable).toBe(false);
    expect(check.missingOrUnreliableJoints).toContain('rightWrist');

    const angleResult = calculateJointAngle(
      landmarks[POSE_LANDMARKS.RIGHT_SHOULDER],
      landmarks[POSE_LANDMARKS.RIGHT_ELBOW],
      landmarks[POSE_LANDMARKS.RIGHT_WRIST]
    );

    expect(angleResult.formStatus).toBe('insufficient_data');
    expect(angleResult.angleDeg).toBeNull();
  });

  it('reports "reliable" and computes accurate angle when both elbow and wrist are visible (>= 0.65)', () => {
    const landmarks = createDummyLandmarks(0.8);

    // Place joints in a clear 90 degree configuration
    // Shoulder at (0.2, 0.5), Elbow at (0.5, 0.5), Wrist at (0.5, 0.2)
    const shoulder = { x: 0.2, y: 0.5, visibility: 0.9 };
    const elbow = { x: 0.5, y: 0.5, visibility: 0.85 };
    const wrist = { x: 0.5, y: 0.2, visibility: 0.88 };

    landmarks[POSE_LANDMARKS.LEFT_SHOULDER] = shoulder;
    landmarks[POSE_LANDMARKS.LEFT_ELBOW] = elbow;
    landmarks[POSE_LANDMARKS.LEFT_WRIST] = wrist;

    const check = poseService.evaluateArmReliability(landmarks, 'left');
    expect(check.status).toBe('reliable');
    expect(check.isLeftArmReliable).toBe(true);

    const angleResult = calculateJointAngle(shoulder, elbow, wrist);
    expect(angleResult.isReliable).toBe(true);
    expect(angleResult.angleDeg).toBe(90);
  });

  it('computes average and P95 latency accurately over recorded durations', () => {
    const svc = new PoseService();

    // Access inference durations safely via internal structure
    const internalSvc = svc as unknown as { inferenceDurationsMs: number[] };
    internalSvc.inferenceDurationsMs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    expect(svc.getAverageLatencyMs()).toBe(55);
    expect(svc.getP95LatencyMs()).toBe(100);
  });

  it('rejects stale video frame timestamps and zero-sized frames without re-running inference', () => {
    const svc = new PoseService();
    const detectForVideoMock = vi.fn().mockReturnValue({ landmarks: [createDummyLandmarks(0.9)] });
    (svc as unknown as { landmarker: unknown }).landmarker = {
      detectForVideo: detectForVideoMock,
      close: vi.fn(),
    };

    // Zero-sized video frame
    const zeroVideo = { readyState: 2, videoWidth: 0, videoHeight: 0, currentTime: 0.1 } as HTMLVideoElement;
    expect(svc.detectVideoFrame(zeroVideo).isNewFrame).toBe(false);
    expect(detectForVideoMock).not.toHaveBeenCalled();

    // First valid frame runs inference
    const video = { readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 0.5 } as HTMLVideoElement;
    const first = svc.detectVideoFrame(video);
    expect(first.isNewFrame).toBe(true);
    expect(detectForVideoMock).toHaveBeenCalledTimes(1);

    // Same currentTime (stale frame) does NOT call detectForVideo again
    const stale = svc.detectVideoFrame(video);
    expect(stale.isNewFrame).toBe(false);
    expect(detectForVideoMock).toHaveBeenCalledTimes(1);
  });

  it('handles partial landmark arrays with missing wrist entry cleanly as insufficient_data', () => {
    const partial = createDummyLandmarks(0.9).slice(0, 14); // Missing LEFT_WRIST (15) and RIGHT_WRIST (16)
    const armCheck = poseService.evaluateArmReliability(partial, 'left');
    expect(armCheck.status).toBe('insufficient_data');
    expect(armCheck.missingOrUnreliableJoints).toContain('leftWrist');
  });
});
