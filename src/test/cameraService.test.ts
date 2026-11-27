import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { CameraService } from '../features/camera/services/cameraService';
import { useCamera } from '../features/camera/hooks/useCamera';
import { CAMERA_RESOLUTION_PRESETS } from '../types/camera';

describe('CameraService & useCamera Lifecycle', () => {
  let cameraService: CameraService;
  const originalMediaDevices = navigator.mediaDevices;

  const createMockMediaStream = () => {
    const listeners = new Map<string, Set<EventListener>>();
    const mockTrack = {
      stop: vi.fn(),
      getSettings: () => ({ width: 1280, height: 720, frameRate: 30, deviceId: 'cam-1' }),
      addEventListener: vi.fn((type: string, cb: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(cb);
      }),
      removeEventListener: vi.fn((type: string, cb: EventListener) => {
        listeners.get(type)?.delete(cb);
      }),
      dispatchMockEvent: (type: string) => {
        listeners.get(type)?.forEach((cb) => cb(new Event(type)));
      },
    } as unknown as MediaStreamTrack & { dispatchMockEvent: (type: string) => void };

    const mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    return { mockStream, mockTrack, listeners };
  };

  beforeEach(() => {
    cameraService = new CameraService();
  });

  afterEach(() => {
    cameraService.stopStream();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
    vi.restoreAllMocks();
  });

  describe('Error Categorization', () => {
    it('categorizes NotAllowedError as permission error', () => {
      const error = new DOMException('Permission denied', 'NotAllowedError');
      const result = cameraService.categorizeError(error);

      expect(result.type).toBe('permission');
      expect(result.message).toContain('Camera permission was denied');
    });

    it('categorizes NotFoundError as not-found error', () => {
      const error = new DOMException('Device not found', 'NotFoundError');
      const result = cameraService.categorizeError(error);

      expect(result.type).toBe('not-found');
      expect(result.message).toContain('No video input device found');
    });

    it('categorizes NotReadableError as in-use error', () => {
      const error = new DOMException('Device in use', 'NotReadableError');
      const result = cameraService.categorizeError(error);

      expect(result.type).toBe('in-use');
      expect(result.message).toContain('Camera is currently in use');
    });

    it('categorizes OverconstrainedError properly', () => {
      const error = new DOMException('Constraints could not be satisfied', 'OverconstrainedError');
      const result = cameraService.categorizeError(error);

      expect(result.type).toBe('overconstrained');
      expect(result.message).toContain('resolution constraints');
    });

    it('categorizes unknown error objects gracefully', () => {
      const error = new Error('Random driver hardware failure');
      const result = cameraService.categorizeError(error);

      expect(result.type).toBe('unknown');
      expect(result.message).toBe('Random driver hardware failure');
    });
  });

  describe('Configurable Resolutions & Presets', () => {
    it('provides balanced, performance, and high presets matching PRD adaptability guidance', () => {
      expect(CAMERA_RESOLUTION_PRESETS.balanced).toBeDefined();
      expect(CAMERA_RESOLUTION_PRESETS.performance).toBeDefined();
      expect(CAMERA_RESOLUTION_PRESETS.high).toBeDefined();

      // Balanced balances landmark clarity and mid-range performance
      expect(CAMERA_RESOLUTION_PRESETS.balanced.idealWidth).toBe(1280);
      expect(CAMERA_RESOLUTION_PRESETS.balanced.idealHeight).toBe(720);

      // Performance prioritizes low-end mobile thermal/CPU budgets
      expect(CAMERA_RESOLUTION_PRESETS.performance.idealWidth).toBe(640);
      expect(CAMERA_RESOLUTION_PRESETS.performance.idealHeight).toBe(480);
    });
  });

  describe('Stream Lifecycle & Interruption Handling', () => {
    it('successfully stops tracks, detaches listeners, and clears stream', () => {
      const removeEventListenerMock = vi.fn();
      const mockTrack = {
        stop: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: removeEventListenerMock,
      } as unknown as MediaStreamTrack;

      const mockStream = {
        getTracks: () => [mockTrack],
        getVideoTracks: () => [mockTrack],
      } as unknown as MediaStream;

      // Access activeStream via internal cast without any
      const internalService = cameraService as unknown as {
        activeStream: MediaStream | null;
        activeTrackListeners: Array<{ track: MediaStreamTrack; type: string; listener: EventListener }>;
      };

      internalService.activeStream = mockStream;
      internalService.activeTrackListeners = [
        { track: mockTrack, type: 'ended', listener: vi.fn() },
      ];

      expect(cameraService.getStream()).toBe(mockStream);

      cameraService.stopStream();
      expect(mockTrack.stop).toHaveBeenCalled();
      expect(removeEventListenerMock).toHaveBeenCalledWith('ended', expect.any(Function));
      expect(cameraService.getStream()).toBeNull();
    });

    it('requests camera permission ONLY on startStream, enforces audio: false, and grants stream', async () => {
      const { mockStream } = createMockMediaStream();
      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: getUserMediaMock,
          enumerateDevices: vi.fn().mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam' }]),
        },
      });

      const stream = await cameraService.startStream({ preset: 'balanced' });
      expect(stream).toBe(mockStream);
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
      expect(getUserMediaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: false,
          video: expect.objectContaining({
            width: {
              ideal: CAMERA_RESOLUTION_PRESETS.balanced.idealWidth,
              min: CAMERA_RESOLUTION_PRESETS.balanced.minWidth,
            },
          }),
        })
      );
    });

    it('rejects with structured permission error when user denies camera access', async () => {
      const getUserMediaMock = vi
        .fn()
        .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: getUserMediaMock, enumerateDevices: vi.fn() },
      });

      await expect(cameraService.startStream()).rejects.toMatchObject({
        type: 'permission',
      });
      expect(cameraService.getStream()).toBeNull();
    });

    it('handles unavailable camera (NotFoundError and unsupported API) gracefully', async () => {
      const getUserMediaMock = vi
        .fn()
        .mockRejectedValue(new DOMException('No camera', 'NotFoundError'));

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: getUserMediaMock, enumerateDevices: vi.fn() },
      });

      await expect(cameraService.startStream()).rejects.toMatchObject({
        type: 'not-found',
      });

      // Missing navigator.mediaDevices
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
      });
      expect(cameraService.isSupported()).toBe(false);
      await expect(cameraService.startStream()).rejects.toMatchObject({
        type: 'not-found',
      });
    });

    it('handles repeated start/stop cycles cleanly without leaking tracks or listeners', async () => {
      const runs = [createMockMediaStream(), createMockMediaStream(), createMockMediaStream()];
      let callIdx = 0;
      const getUserMediaMock = vi.fn().mockImplementation(() => Promise.resolve(runs[callIdx++].mockStream));

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: getUserMediaMock, enumerateDevices: vi.fn() },
      });

      for (let i = 0; i < runs.length; i++) {
        await cameraService.startStream();
        expect(cameraService.getStream()).toBe(runs[i].mockStream);
        cameraService.stopStream();
        expect(runs[i].mockTrack.stop).toHaveBeenCalledTimes(1);
        expect(runs[i].listeners.get('ended')?.size ?? 0).toBe(0);
        expect(runs[i].listeners.get('mute')?.size ?? 0).toBe(0);
        expect(runs[i].listeners.get('unmute')?.size ?? 0).toBe(0);
        expect(cameraService.getStream()).toBeNull();
      }
    });
  });

  describe('useCamera Hook State Transitions', () => {
    it('stays idle until startCamera is invoked, transitions to active, handles interruption, and cleans up on unmount', async () => {
      const { mockStream, mockTrack } = createMockMediaStream();
      const getUserMediaMock = vi.fn().mockResolvedValue(mockStream);

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: getUserMediaMock,
          enumerateDevices: vi.fn().mockResolvedValue([]),
        },
      });

      const { result, unmount } = renderHook(() => useCamera());

      // Must NOT prompt for camera before explicit start action
      expect(result.current.cameraState).toBe('idle');
      expect(getUserMediaMock).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.startCamera();
      });

      expect(result.current.cameraState).toBe('active');
      expect(result.current.actualResolution).toEqual({ width: 1280, height: 720, frameRate: 30 });

      // Simulate track interruption and resume
      act(() => {
        mockTrack.dispatchMockEvent('mute');
      });
      expect(result.current.cameraState).toBe('interrupted');

      act(() => {
        mockTrack.dispatchMockEvent('unmute');
      });
      expect(result.current.cameraState).toBe('active');

      // Unmount must release active tracks
      unmount();
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    it('transitions useCamera to permission_denied and unavailable states on hardware errors', async () => {
      const getUserMediaMock = vi
        .fn()
        .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
        .mockRejectedValueOnce(new DOMException('Missing', 'NotFoundError'));

      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: getUserMediaMock,
          enumerateDevices: vi.fn().mockResolvedValue([]),
        },
      });

      const { result } = renderHook(() => useCamera());

      await act(async () => {
        await result.current.startCamera();
      });
      expect(result.current.cameraState).toBe('permission_denied');

      await act(async () => {
        await result.current.startCamera();
      });
      expect(result.current.cameraState).toBe('unavailable');
    });
  });
});
