import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { CameraService } from '../features/camera/services/cameraService';
import {
  createRehabTrackingController,
  ELBOW_FLEXION_EXTENSION_REP,
} from '../features/rehab-tracking';

describe('Motion Engine Privacy & Zero-Upload Guarantees (PRD Table 10.1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never uses remote CDN URLs, MediaRecorder, or video upload paths in source files', () => {
    const poseServiceSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/pose/services/poseService.ts'),
      'utf8'
    );
    const controllerSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/rehab-tracking/services/rehabTrackingController.ts'),
      'utf8'
    );
    const cameraSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/camera/services/cameraService.ts'),
      'utf8'
    );

    expect(poseServiceSource).not.toMatch(/cdn\.jsdelivr\.net|unpkg\.com|http:\/\//i);
    expect(poseServiceSource).toContain("const LOCAL_WASM_PATH = '/wasm'");
    expect(poseServiceSource).toContain("const LOCAL_MODEL_PATH = '/models/pose_landmarker_lite.task'");

    for (const src of [poseServiceSource, controllerSource, cameraSource]) {
      expect(src).not.toMatch(/MediaRecorder/i);
      expect(src).not.toMatch(/fetch\s*\(/i);
      expect(src).not.toMatch(/XMLHttpRequest/i);
      expect(src).not.toMatch(/sendBeacon/i);
      expect(src).not.toMatch(/new\s+WebSocket/i);
    }
  });

  it('makes zero network requests and enforces audio: false across camera + controller lifecycle', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Unexpected fetch call during on-device tracking');
    });

    const mockTrack = {
      stop: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getSettings: () => ({ width: 640, height: 480, frameRate: 30 }),
    } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    const getUserMediaSpy = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: getUserMediaSpy,
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    const cam = new CameraService();
    await cam.startStream();
    expect(getUserMediaSpy).toHaveBeenCalledWith(
      expect.objectContaining({ audio: false })
    );

    const controller = createRehabTrackingController();
    await controller.startExercise(ELBOW_FLEXION_EXTENSION_REP);
    controller.pause();
    await controller.resume();
    await controller.stop();
    await controller.dispose();
    cam.stopStream();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
