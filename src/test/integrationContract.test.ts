import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createRehabTrackingController,
  RehabTrackingController,
  RehabTrackingControllerImpl,
  TrackingSnapshot,
  ELBOW_FLEXION_EXTENSION_REP,
  ELBOW_ISOMETRIC_HOLD,
  ExerciseDefinition,
} from '../features/rehab-tracking';
import * as SharedContracts from '../shared/contracts';
import { poseService } from '../features/pose/services/poseService';
import { POSE_LANDMARKS } from '../types/pose';

describe('Page 9 Integration Contract & RehabTrackingController Specification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enforces one-directional dependency boundary (shared/contracts has zero imports or exports from features/)', () => {
    const motionContractSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/shared/contracts/motion.ts'),
      'utf8'
    );
    expect(motionContractSource).not.toMatch(/features\//);
    expect('createRehabTrackingController' in SharedContracts).toBe(false);
  });

  it('exports createRehabTrackingController factory callable without arguments from rehab-tracking', () => {
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

  it('exposes all required Page 9 fields on TrackingSnapshot', () => {
    const controller: RehabTrackingController = createRehabTrackingController();
    const snapshot: TrackingSnapshot = controller.getSnapshot();

    expect(snapshot).toHaveProperty('status');
    expect(['idle', 'initializing', 'ready', 'tracking', 'no_person', 'low_confidence', 'paused', 'completed', 'error']).toContain(snapshot.status);
    expect(snapshot).toHaveProperty('angleDeg');
    expect(snapshot).toHaveProperty('formStatus');
    expect(['correct', 'incorrect', 'insufficient_data', 'not_evaluated', 'neutral']).toContain(snapshot.formStatus);
    expect(snapshot).toHaveProperty('phase');
    expect(['waiting', 'outbound', 'target', 'returning', 'holding', 'complete']).toContain(snapshot.phase);
    expect(snapshot).toHaveProperty('repCount');
    expect(snapshot).toHaveProperty('repGoal');
    expect(typeof snapshot.repCount).toBe('number');
    expect(snapshot).toHaveProperty('holdElapsedMs');
    expect(snapshot).toHaveProperty('holdGoalMs');
    expect(typeof snapshot.holdElapsedMs).toBe('number');
    expect(snapshot).toHaveProperty('feedbackCode');
    expect(snapshot).toHaveProperty('confidence');
    expect(snapshot).toHaveProperty('fps');
    expect(snapshot).toHaveProperty('missingLandmarks');
    expect(Array.isArray(snapshot.missingLandmarks)).toBe(true);
    expect(snapshot).toHaveProperty('errorCode');
  });

  it('emits structured feedbackCode on pause and supports clean subscribe/unsubscribe', () => {
    const controller = createRehabTrackingController();
    const listener = vi.fn();

    const unsubscribe = controller.subscribe(listener);
    expect(typeof unsubscribe).toBe('function');

    // Unstructured prose is normalized to structured SESSION_PAUSED code
    controller.pause('User paused manually');
    expect(listener).toHaveBeenCalledTimes(1);
    const snap1 = listener.mock.calls[0][0] as TrackingSnapshot;
    expect(snap1.status).toBe('paused');
    expect(snap1.feedbackCode).toBe('SESSION_PAUSED');

    // Structured codes are preserved
    controller.pause('CLINICAL_PAUSE');
    expect((listener.mock.calls[1][0] as TrackingSnapshot).feedbackCode).toBe('CLINICAL_PAUSE');

    listener.mockClear();
    unsubscribe();
    controller.pause();
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

  it('disposes resources idempotently without firing spurious completed events to subscribers', async () => {
    vi.spyOn(poseService, 'close').mockImplementation(() => {});
    const controller = createRehabTrackingController();
    const listener = vi.fn();
    controller.subscribe(listener);

    await controller.startExercise(ELBOW_FLEXION_EXTENSION_REP);
    listener.mockClear();

    await expect(controller.dispose()).resolves.not.toThrow();
    // dispose() must NOT emit a fake 'completed' session notification during teardown
    expect(listener).not.toHaveBeenCalled();
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

  it('evaluates non-elbow config (LEFT_HIP -> LEFT_KNEE -> LEFT_ANKLE) end-to-end and skips stale frames', async () => {
    vi.spyOn(poseService, 'getActiveDelegate').mockReturnValue('GPU');
    vi.spyOn(poseService, 'close').mockImplementation(() => {});

    const kneeConfig: ExerciseDefinition = {
      id: 'knee_extension_demo',
      name: 'Knee Extension (Config-Driven Test)',
      bodyRegion: 'upper_limb',
      side: 'left',
      mode: 'rep',
      angle: {
        proximal: 'LEFT_HIP',
        vertex: 'LEFT_KNEE',
        distal: 'LEFT_ANKLE',
        startRangeDeg: [70, 100],
        targetRangeDeg: [160, 180],
        toleranceDeg: 10,
      },
      repGoal: 2,
      holdSeconds: null,
      minLandmarkVisibility: 0.7,
      targetEntryDwellMs: 0,
      maxTrackingGapMs: 1000,
      clinicianReviewStatus: 'demo_unvalidated',
    };

    const makeLandmarks = (kneeAngle: 'start' | 'returning' | 'target' | 'missing_ankle') => {
      const lms = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
      // Hip at (0.5, 0.2), Knee at (0.5, 0.5) -> proximal vector up
      lms[POSE_LANDMARKS.LEFT_HIP] = { x: 0.5, y: 0.2, z: 0, visibility: 0.95 };
      lms[POSE_LANDMARKS.LEFT_KNEE] = { x: 0.5, y: 0.5, z: 0, visibility: 0.95 };
      if (kneeAngle === 'start') {
        // 90 degrees bent knee: ankle to the right (0.8, 0.5)
        lms[POSE_LANDMARKS.LEFT_ANKLE] = { x: 0.8, y: 0.5, z: 0, visibility: 0.95 };
      } else if (kneeAngle === 'returning') {
        // 135 degrees bent knee: ankle down-right (0.5 + 0.2, 0.5 + 0.2)
        lms[POSE_LANDMARKS.LEFT_ANKLE] = { x: 0.7, y: 0.7, z: 0, visibility: 0.95 };
      } else if (kneeAngle === 'target') {
        // 180 degrees straight knee: ankle straight down (0.5, 0.8)
        lms[POSE_LANDMARKS.LEFT_ANKLE] = { x: 0.5, y: 0.8, z: 0, visibility: 0.95 };
      } else {
        // Low confidence ankle
        lms[POSE_LANDMARKS.LEFT_ANKLE] = { x: 0.5, y: 0.8, z: 0, visibility: 0.3 };
      }
      return lms;
    };

    const detectMock = vi.spyOn(poseService, 'detectVideoFrame');
    let nextResult = { landmarks: makeLandmarks('start') as ReturnType<typeof makeLandmarks> | null, isNewFrame: true };

    detectMock.mockImplementation(() => ({
      landmarks: nextResult.landmarks,
      mappedJoints: poseService.extractRehabilitationJoints(nextResult.landmarks),
      armReliability: poseService.evaluateArmReliability(nextResult.landmarks, 'left'),
      rawResult: null,
      isNewFrame: nextResult.isNewFrame,
      inferenceTimeMs: 10,
      avgInferenceTimeMs: 10,
      p95InferenceTimeMs: 12,
      inferenceFps: 30,
      cameraFps: 30,
      activeDelegate: 'GPU',
    }));

    const controller = new RehabTrackingControllerImpl();
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 1000, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1000, configurable: true });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });

    const canvas = document.createElement('canvas');
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    let fakeNow = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => fakeNow);

    await controller.attachMedia(video, canvas);
    await controller.startExercise(kneeConfig);

    // 1. Start at 90° knee flexion
    fakeNow += 200;
    controller.processCurrentVideoFrame();
    expect(controller.getSnapshot().angleDeg).toBe(90);
    expect(controller.getSnapshot().phase).toBe('outbound');

    // 2. Stale frame (isNewFrame=false) must NOT advance frameCount or state
    fakeNow += 200;
    nextResult = { landmarks: makeLandmarks('missing_ankle'), isNewFrame: false };
    controller.processCurrentVideoFrame();
    expect(controller.getSnapshot().angleDeg).toBe(90);

    // 3. Low-confidence LEFT_ANKLE must report exact configured landmark name 'LEFT_ANKLE'
    fakeNow += 200;
    nextResult = { landmarks: makeLandmarks('missing_ankle'), isNewFrame: true };
    controller.processCurrentVideoFrame();
    expect(controller.getSnapshot().formStatus).toBe('insufficient_data');
    expect(controller.getSnapshot().missingLandmarks).toEqual(['LEFT_ANKLE']);

    // 4. Extend to 180° (target reached immediately since dwell=0) -> returning 135° -> return to 90° -> repCount = 1
    fakeNow += 200;
    nextResult = { landmarks: makeLandmarks('target'), isNewFrame: true };
    controller.processCurrentVideoFrame();
    expect(controller.getSnapshot().angleDeg).toBe(180);
    expect(controller.getSnapshot().phase).toBe('target');

    fakeNow += 200;
    nextResult = { landmarks: makeLandmarks('returning'), isNewFrame: true };
    controller.processCurrentVideoFrame();
    expect(controller.getSnapshot().angleDeg).toBe(135);
    expect(controller.getSnapshot().phase).toBe('returning');

    fakeNow += 200;
    nextResult = { landmarks: makeLandmarks('start'), isNewFrame: true };
    controller.processCurrentVideoFrame();
    expect(controller.getSnapshot().repCount).toBe(1);
    expect(controller.getSnapshot().phase).toBe('complete');

    const sessionResult = await controller.stop();
    expect(sessionResult.repCount).toBe(1);
    expect(sessionResult.exerciseId).toBe('knee_extension_demo');
  });

  it('handles no_person state, resizes overlay canvas to video dimensions, and pauses/resumes hold timer cleanly', async () => {
    vi.spyOn(poseService, 'getActiveDelegate').mockReturnValue('GPU');
    vi.spyOn(poseService, 'close').mockImplementation(() => {});

    const sampleLandmarks = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.95,
    }));
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
          activeDelegate: 'GPU',
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
        activeDelegate: 'GPU',
      };
    });

    const controller = new RehabTrackingControllerImpl();
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

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    await controller.attachMedia(video, canvas);
    await controller.startExercise(ELBOW_ISOMETRIC_HOLD);

    controller.processCurrentVideoFrame();
    expect(controller.getSnapshot().status).toBe('no_person');
    expect(controller.getSnapshot().feedbackCode).toBe('PERSON_NOT_VISIBLE');
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);

    mode = 'person';
    controller.processCurrentVideoFrame();
    expect(controller.getSnapshot().status).toBe('tracking');

    controller.pause('CLINICAL_PAUSE');
    expect(controller.getSnapshot().status).toBe('paused');
    expect(controller.getSnapshot().feedbackCode).toBe('CLINICAL_PAUSE');

    await controller.resume();
    expect(controller.getSnapshot().status).toBe('ready');

    await controller.dispose();
    expect(mockTrack.stop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });
});
