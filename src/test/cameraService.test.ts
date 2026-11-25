import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CameraService } from '../features/camera/services/cameraService';

describe('CameraService', () => {
  let cameraService: CameraService;

  beforeEach(() => {
    cameraService = new CameraService();
  });

  afterEach(() => {
    cameraService.stopStream();
    vi.restoreAllMocks();
  });

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

  it('successfully stops tracks and cleans up stream', () => {
    const mockTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;

    // Simulate active stream
    (cameraService as any).activeStream = mockStream;
    expect(cameraService.getStream()).toBe(mockStream);

    cameraService.stopStream();
    expect(mockTrack.stop).toHaveBeenCalled();
    expect(cameraService.getStream()).toBeNull();
  });
});
