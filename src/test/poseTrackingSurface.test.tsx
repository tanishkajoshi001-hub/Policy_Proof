import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PoseTrackingSurface } from '../features/rehab-tracking/components/PoseTrackingSurface';
import { poseService } from '../features/pose/services/poseService';
import { POSE_LANDMARKS } from '../types/pose';

describe('PoseTrackingSurface Canvas Resizing, Mirroring & Unified Controller Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles mirror reflection class and data attribute without affecting tracking', async () => {
    vi.spyOn(poseService, 'initialize').mockResolvedValue({} as never);
    vi.spyOn(poseService, 'getActiveDelegate').mockReturnValue('CPU');
    vi.spyOn(poseService, 'close').mockImplementation(() => {});

    const mockStream = {} as MediaStream;

    await act(async () => {
      render(
        <PoseTrackingSurface
          stream={mockStream}
          cameraState="active"
          isMirrored={true}
        />
      );
    });

    const surface = screen.getByTestId('pose-tracking-surface');
    const video = screen.getByLabelText('Real-time rehabilitation video stream');

    expect(surface).toHaveAttribute('data-mirrored', 'true');
    expect(video.className).toContain('scale-x-[-1]');

    const toggleMirrorBtn = screen.getByRole('button', { name: 'Toggle camera mirroring' });
    fireEvent.click(toggleMirrorBtn);

    expect(surface).toHaveAttribute('data-mirrored', 'false');
    expect(video.className).not.toContain('scale-x-[-1]');
  });

  it('resizes overlay canvas dynamically via RehabTrackingControllerImpl and emits neutral (not incorrect) transit feedback', async () => {
    vi.spyOn(poseService, 'initialize').mockResolvedValue({} as never);
    vi.spyOn(poseService, 'getActiveDelegate').mockReturnValue('GPU');
    vi.spyOn(poseService, 'close').mockImplementation(() => {});

    const landmarks = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.9,
    }));
    // 115° intermediate flexion (between start [145,180] and target [50,75])
    landmarks[POSE_LANDMARKS.LEFT_SHOULDER] = { x: 0.3, y: 0.5, z: 0, visibility: 0.9 };
    landmarks[POSE_LANDMARKS.LEFT_ELBOW] = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
    landmarks[POSE_LANDMARKS.LEFT_WRIST] = {
      x: 0.5 + 0.1 * Math.cos((65 * Math.PI) / 180),
      y: 0.5 - 0.1 * Math.sin((65 * Math.PI) / 180),
      z: 0,
      visibility: 0.9,
    };

    vi.spyOn(poseService, 'detectVideoFrame').mockReturnValue({
      landmarks,
      mappedJoints: poseService.extractRehabilitationJoints(landmarks),
      armReliability: poseService.evaluateArmReliability(landmarks, 'left'),
      rawResult: null,
      isNewFrame: true,
      inferenceTimeMs: 10,
      avgInferenceTimeMs: 10,
      p95InferenceTimeMs: 12,
      inferenceFps: 30,
      cameraFps: 30,
      activeDelegate: 'GPU',
    });

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    const snapshots: Array<{ formStatus: string; feedbackCode: string | null }> = [];

    const { container } = render(
      <PoseTrackingSurface
        stream={{} as MediaStream}
        cameraState="active"
        onSnapshotUpdate={(snap) =>
          snapshots.push({ formStatus: snap.formStatus, feedbackCode: snap.feedbackCode })
        }
      />
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const video = container.querySelector('video')!;
    const canvas = container.querySelector('canvas')!;

    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });

    let vWidth = 640;
    let vHeight = 480;
    Object.defineProperty(video, 'videoWidth', { get: () => vWidth, configurable: true });
    Object.defineProperty(video, 'videoHeight', { get: () => vHeight, configurable: true });

    act(() => {
      rafCallbacks[rafCallbacks.length - 1]?.(100);
    });
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    // Intermediate angle must be neutral (RETURN_TO_START / MOVE_TOWARD_TARGET), NEVER red 'incorrect'
    const lastSnap = snapshots[snapshots.length - 1];
    expect(lastSnap?.formStatus).toBe('neutral');

    vWidth = 1280;
    vHeight = 720;
    act(() => {
      rafCallbacks[rafCallbacks.length - 1]?.(200);
    });
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(720);
  });
});
