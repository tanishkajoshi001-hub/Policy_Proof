import { CameraDeviceInfo, CameraErrorDetails } from '../../../types/camera';

export class CameraService {
  private activeStream: MediaStream | null = null;

  /**
   * Checks if mediaDevices and getUserMedia are supported by the browser.
   */
  public isSupported(): boolean {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'
    );
  }

  /**
   * Retrieves all video input devices (cameras) available.
   */
  public async getAvailableCameras(): Promise<CameraDeviceInfo[]> {
    if (!this.isSupported()) {
      return [];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`,
          groupId: device.groupId,
        }));
    } catch {
      return [];
    }
  }

  /**
   * Requests camera access with appropriate constraints and returns the MediaStream.
   */
  public async startStream(deviceId?: string): Promise<MediaStream> {
    if (!this.isSupported()) {
      const err: CameraErrorDetails = {
        type: 'not-found',
        message: 'Camera API (navigator.mediaDevices.getUserMedia) is not supported in this browser.',
      };
      throw err;
    }

    // Stop any existing stream first
    this.stopStream();

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: 1280, min: 480 },
      height: { ideal: 720, min: 360 },
      frameRate: { ideal: 30, min: 15 },
    };

    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId };
    } else {
      videoConstraints.facingMode = 'user'; // Prefer front/selfie camera on mobile
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false, // RehabBuddy does NOT capture patient audio
      });

      this.activeStream = stream;
      return stream;
    } catch (error: any) {
      const errorDetails = this.categorizeError(error);
      throw errorDetails;
    }
  }

  /**
   * Halts all active media tracks and clears the active stream reference.
   */
  public stopStream(): void {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop exceptions
        }
      });
      this.activeStream = null;
    }
  }

  /**
   * Returns current active stream.
   */
  public getStream(): MediaStream | null {
    return this.activeStream;
  }

  /**
   * Maps DOMExceptions to structured CameraErrorDetails.
   */
  public categorizeError(error: any): CameraErrorDetails {
    if (error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
      return {
        type: 'permission',
        message: 'Camera permission was denied. Please allow camera permissions to continue.',
        originalError: error,
      };
    }

    if (error && (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError')) {
      return {
        type: 'not-found',
        message: 'No video input device found on this system.',
        originalError: error,
      };
    }

    if (error && error.name === 'NotReadableError') {
      return {
        type: 'in-use',
        message: 'Camera is currently in use by another application or blocked by the operating system.',
        originalError: error,
      };
    }

    if (error && error.name === 'OverconstrainedError') {
      return {
        type: 'overconstrained',
        message: 'Camera does not meet requested resolution constraints.',
        originalError: error,
      };
    }

    return {
      type: 'unknown',
      message: error?.message || 'An unexpected error occurred while accessing the camera.',
      originalError: error,
    };
  }
}

export const cameraService = new CameraService();
