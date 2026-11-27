import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createRehabTrackingController,
  RehabTrackingController,
  TrackingSnapshot,
  ELBOW_FLEXION_EXTENSION_REP,
  ELBOW_ISOMETRIC_HOLD,
  ExerciseDefinition,
} from '../features/rehab-tracking';
import {
  createRehabTrackingController as createFromContracts,
} from '../shared/contracts';
import { poseService } from '../features/pose/services/poseService';
import { POSE_LANDMARKS } from '../types/pose';

describe('Page 9 Integration Contract & RehabTrackingController Specification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('exports createRehabTrackingController factory callable without arguments', () => {
    const controller = createRehabTrackingController();
    expect(controller).toBeDefined();
    expect(typeof controller.attachMedia).toBe('function');
    expect(typeof controller.startExercise).toBe('function');
    expect(typeof controller.pause).toBe('function');
    expect(typeof controller.resume).toBe('function');
    expect(typeof controller.stop).toBe('function');
    expect(typeof controller.getSnapshot).toBe('function');
    expect(typeof controller.subscribe).toBe('function');
    expect(typeof controller.dispose).toBe('function');
  });

  it('exports createRehabTrackingController from src/shared/contracts with matching interface', () => {
    const controller = createFromContracts();
    expect(controller).toBeDefined();
    expect(typeof controller.attachMedia).toBe('function');
    expect(typeof controller.startExercise).toBe('function');
  });

  it('exposes all required Page 9 fields on TrackingSnapshot', () => {
    const controller: RehabTrackingController = createRehabTrackingController();
    const snapshot: TrackingSnapshot = controller.getSnapshot();

    // 1. Tracking status
    expect(snapshot).toHaveProperty('status');
    expect(['idle', 'initializing', 'ready', 'tracking', 'no_person', 'low_confidence', 'paused', 'completed', 'error']).toContain(snapshot.status);

    // 2. Current angle
    expect(snapshot).toHaveProperty('angleDeg');

    // 3. Form status
    expect(snapshot).toHaveProperty('formStatus');
    expect(['correct', 'incorrect', 'insufficient_data', 'not_evaluated', 'neutral']).toContain(snapshot.formStatus);

    // 4. Movement phase
    expect(snapshot).toHaveProperty('phase');
    expect(['waiting', 'outbound', 'target', 'returning', 'holding', 'complete']).toContain(snapshot.phase);

    // 5. Rep count and goal
    expect(snapshot).toHaveProperty('repCount');
    expect(snapshot).toHaveProperty('repGoal');
    expect(typeof snapshot.repCount).toBe('number');

    // 6. Hold elapsed time and goal
    expect(snapshot).toHaveProperty('holdElapsedMs');
    expect(snapshot).toHaveProperty('holdGoalMs');
    expect(typeof snapshot.holdElapsedMs).toBe('number');

    // 7. Feedback code
    expect(snapshot).toHaveProperty('feedbackCode');

    // 8. Confidence
    expect(snapshot).toHaveProperty('confidence');

    // 9. FPS
    expect(snapshot).toHaveProperty('fps');

    // 10. Missing landmarks
    expect(snapshot).toHaveProperty('missingLandmarks');
    expect(Array.isArray(snapshot.missingLandmarks)).toBe(true);

    // 11. Error code
    expect(snapshot).toHaveProperty('errorCode');
  });

  it('allows subscription to snapshots and unsubscription cleanly', () => {
    const controller = createRehabTrackingController();
    const listener = vi.fn();

    const unsubscribe = controller.subscribe(listener);
    expect(typeof unsubscribe).toBe('function');

    // Calling pause triggers snapshot update
    controller.pause('Clinical pause');
    expect(listener).toHaveBeenCalled();
    const lastCallArg = listener.mock.calls[0][0] as TrackingSnapshot;
    expect(lastCallArg.status).toBe('paused');
    expect(lastCallArg.feedbackCode).toBe('Clinical pause');

    // Unsubscribe removes listener
    listener.mockClear();
    unsubscribe();
    controller.pause('Second pause');
    expect(listener).not.toHaveBeenCalled();
  });

  it('attaches video and canvas elements without throwing', async () => {
    const controller = createRehabTrackingController();
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');

    await expect(controller.attachMedia(video, canvas)).resolves.not.toThrow();
  });

  it('starts exercise with typed ExerciseDefinition and stops returning TrackingSessionResult', async () => {
    const controller = createRehabTrackingController();
    await controller.startExercise(ELBOW_ISOMETRIC_HOLD);

    const snapshot = controller.getSnapshot();
    expect(snapshot.holdGoalMs).toBe(3000);

    const result = await controller.stop();
    expect(result).toHaveProperty('exerciseId', 'elbow_isometric_hold');
    expect(result).toHaveProperty('startedAt');
    expect(result).toHaveProperty('endedAt');
    expect(result).toHaveProperty('repCount');
    expect(result).toHaveProperty('holdCompletedMs');
    expect(result).toHaveProperty('accuracyPercent');
    expect(result).toHaveProperty('correctFrames');
    expect(result).toHaveProperty('evaluatedFrames');
    expect(result).toHaveProperty('stopReason');
    expect(['completed', 'user_stopped', 'tracking_error', 'camera_lost']).toContain(result.stopReason);
  });

  it('disposes resources idempotently and stops active session', async () => {
    const controller = createRehabTrackingController();
    await controller.startExercise(ELBOW_FLEXION_EXTENSION_REP);
    await expect(controller.dispose()).resolves.not.toThrow();

    const snapshot = controller.getSnapshot();
    expect(snapshot.status).toBe('completed');
  });

  it('rejects invalid ExerciseDefinition with INVALID_EXERCISE_CONFIG error state', async () => {
    const controller = createRehabTrackingController();
    const invalidDef: ExerciseDefinition = {
      ...ELBOW_FLEXION_EXTENSION_REP,
      repGoal: 0,
    };

    await expect(controller.startExercise(invalidDef)).rejects.toThrow(/Invalid ExerciseDefinition/);
    expect(controller.getSnapshot().status).toBe('error');
    expect(controller.getSnapshot().errorCode).toBe('INVALID_EXERCISE_CONFIG');
  });

  it('sets status="error" and errorCode="MODEL_INIT_FAILED" when PoseService initialization fails', async () => {
    vi.spyOn(poseService, 'getActiveDelegate').mockReturnValue(null);
    vi.spyOn(poseService, 'initialize').mockRejectedValue(new Error('WASM load failure'));

    const controller = createRehabTrackingController();
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    await controller.attachMedia(video, canvas);

    await expect(controller.startExercise(ELBOW_FLEXION_EXTENSION_REP)).rejects.toThrow('WASM load failure');
    expect(controller.getSnapshot().status).toBe('error');
    expect(controller.getSnapshot().errorCode).toBe('MODEL_INIT_FAILED');
  });

  it('handles no_person state, resizes overlay canvas to video dimensions, and pauses/resumes hold timer cleanly', async () => {
    vi.spyOn(poseService, 'getActiveDelegate').mockReturnValue('CPU');
    vi.spyOn(poseService, 'close').mockImplementation(() => {});

    const sampleLandmarks = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.95,
    }));
    // 60 degree target elbow angle
    sampleLandmarks[POSE_LANDMARKS.LEFT_SHOULDER] = { x: 0.3, y: 0.5, z: 0, visibility: 0.95 };
    sampleLandmarks[POSE_LANDMARKS.LEFT_ELBOW] = { x: 0.5, y: 0.5, z: 0, visibility: 0.95 };
    sampleLandmarks[POSE_LANDMARKS.LEFT_WRIST] = {
      x: 0.5 + 0.1,
      y: 0.5 - Math.sqrt(3) * 0.1,
      z: 0,
      visibility: 0.95,
    };

    let mode: 'person' | 'empty' = 'empty';
    vi.spyOn(poseService, 'detectVideoFrame').mockImplementation(() => {
      if (mode === 'empty') {
        return {
          landmarks: null,
          mappedJoints: null,
          armReliability: {
            status: 'insufficient_data',
            isLeftArmReliable: false,
            isRightArmReliable: false,
            isReliable: false,
            missingOrUnreliableJoints: ['leftElbow', 'leftWrist'],
            details: { leftElbowScore: 0, leftWristScore: 0, rightElbowScore: 0, rightWristScore: 0 },
          },
          rawResult: null,
          isNewFrame: true,
          inferenceTimeMs: 12,
          avgInferenceTimeMs: 12,
          p95InferenceTimeMs: 15,
          inferenceFps: 30,
          cameraFps: 30,
          activeDelegate: 'CPU',
        };
      }
      return {
        landmarks: sampleLandmarks,
        mappedJoints: poseService.extractRehabilitationJoints(sampleLandmarks),
        armReliability: poseService.evaluateArmReliability(sampleLandmarks, 'left'),
        rawResult: null,
        isNewFrame: true,
        inferenceTimeMs: 12,
        avgInferenceTimeMs: 12,
        p95InferenceTimeMs: 15,
        inferenceFps: 30,
        cameraFps: 30,
        activeDelegate: 'CPU',
      };
    });

    const controller = createRehabTrackingController();
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 1280, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 720, configurable: true });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });

    const mockTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    Object.defineProperty(video, 'srcObject', {
      value: { getTracks: () => [mockTrack] },
      writable: true,
      configurable: true,
    });

    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 150;

    let scheduledCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      scheduledCallback = cb;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    await controller.attachMedia(video, canvas);
    await controller.startExercise(ELBOW_ISOMETRIC_HOLD);

    // 1. Trigger frame with no person
    scheduledCallback?.(100);
    expect(controller.getSnapshot().status).toBe('no_person');
    expect(controller.getSnapshot().feedbackCode).toBe('PERSON_NOT_VISIBLE');
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);

    // 2. Trigger frame with person in target posture, pause, then resume
    mode = 'person';
    scheduledCallback?.(200);
    expect(controller.getSnapshot().status).toBe('tracking');

    controller.pause('Clinical pause');
    expect(controller.getSnapshot().status).toBe('paused');

    await controller.resume();
    expect(controller.getSnapshot().status).toBe('ready');

    // 3. Dispose releases attached MediaStream tracks
    await controller.dispose();
    expect(mockTrack.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });
});
