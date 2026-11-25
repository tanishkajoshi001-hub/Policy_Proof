import { describe, it, expect } from 'vitest';
import { PoseService } from '../features/pose/services/poseService';
import { NormalizedLandmark, POSE_LANDMARKS } from '../types/pose';

describe('PoseService Key Joint & Tracking Evaluation', () => {
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

  it('reports "tracking-stable" when all upper joints meet 0.65 visibility threshold', () => {
    const landmarks = createDummyLandmarks(0.85);
    const result = poseService.evaluateKeyJoints(landmarks);

    expect(result.trackingStatus).toBe('tracking-stable');
    expect(result.keyJoints.leftElbow).toBe(true);
    expect(result.keyJoints.rightElbow).toBe(true);
    expect(result.keyJoints.leftShoulder).toBe(true);
  });

  it('reports "partially-visible" when only 1 or 2 joints are confident', () => {
    const landmarks = createDummyLandmarks(0.2); // Low visibility for all
    // Only set left shoulder and left elbow high
    landmarks[POSE_LANDMARKS.LEFT_SHOULDER].visibility = 0.9;
    landmarks[POSE_LANDMARKS.LEFT_ELBOW].visibility = 0.9;

    const result = poseService.evaluateKeyJoints(landmarks);
    expect(result.trackingStatus).toBe('partially-visible');
    expect(result.keyJoints.leftShoulder).toBe(true);
    expect(result.keyJoints.leftElbow).toBe(true);
    expect(result.keyJoints.leftWrist).toBe(false);
  });

  it('reports "low-confidence" when all required joints are below 0.65 threshold', () => {
    const landmarks = createDummyLandmarks(0.3); // All below 0.65
    const result = poseService.evaluateKeyJoints(landmarks);

    expect(result.trackingStatus).toBe('low-confidence');
  });

  it('reports "partially-visible" when only lower-body joints are visible', () => {
    const landmarks = createDummyLandmarks(0.2);
    landmarks[POSE_LANDMARKS.LEFT_HIP].visibility = 0.9;
    landmarks[POSE_LANDMARKS.LEFT_KNEE].visibility = 0.9;
    const result = poseService.evaluateKeyJoints(landmarks);

    expect(result.trackingStatus).toBe('partially-visible');
    expect(result.keyJoints.leftHip).toBe(true);
    expect(result.keyJoints.leftKnee).toBe(true);
  });

  it('computes average and P95 latency accurately over recorded durations', () => {
    const svc = new PoseService();
    (svc as any).inferenceDurationsMs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

    expect(svc.getAverageLatencyMs()).toBe(55);
    expect(svc.getP95LatencyMs()).toBe(100);
  });
});
