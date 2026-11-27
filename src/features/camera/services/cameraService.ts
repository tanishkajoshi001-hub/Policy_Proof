import {
  CameraDeviceInfo,
  CameraErrorDetails,
  CameraResolution,
  CameraStreamOptions,
  CAMERA_RESOLUTION_PRESETS,
} from '../../../types/camera';

export class CameraService {
  private activeStream: MediaStream | null = null;
  private activeTrackListeners: Array<{
    track: MediaStreamTrack;
    type: string;
    listener: EventListener;
  }> = [];

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
   * Requests camera access with configurable constraints balancing landmark stability
   * and phone performance, as recommended by the RehabBuddy PRD.
   *
   * Includes graceful fallback: if requested constraints fail with OverconstrainedError,
   * it automatically retries with relaxed constraints to guarantee camera availability.
   */
  public async startStream(options: CameraStreamOptions = {}): Promise<MediaStream> {
    if (!this.isSupported()) {
      const err: CameraErrorDetails = {
        type: 'not-found',
        message: 'Camera API (navigator.mediaDevices.getUserMedia) is not supported in this browser.',
      };
      throw err;
    }

    // Stop any existing stream and remove previous listeners
    this.stopStream();

    const {
      deviceId,
      preset = 'balanced',
      customResolution,
      facingMode = 'user',
      onInterrupted,
      onResumed,
    } = options;

    const baseConfig = CAMERA_RESOLUTION_PRESETS[preset] || CAMERA_RESOLUTION_PRESETS.balanced;
    const resolvedWidth = customResolution?.idealWidth ?? baseConfig.idealWidth;
    const resolvedHeight = customResolution?.idealHeight ?? baseConfig.idealHeight;
    const minWidth = customResolution?.minWidth ?? baseConfig.minWidth;
    const minHeight = customResolution?.minHeight ?? baseConfig.minHeight;
    const idealFps = customResolution?.idealFrameRate ?? baseConfig.idealFrameRate;
    const minFps = customResolution?.minFrameRate ?? baseConfig.minFrameRate;

    const videoConstraints: MediaTrackConstraints = {
      width: { ideal: resolvedWidth, min: minWidth },
      height: { ideal: resolvedHeight, min: minHeight },
      frameRate: { ideal: idealFps, min: minFps },
    };

    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId };
    } else {
      videoConstraints.facingMode = facingMode;
    }

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false, // RehabBuddy explicitly guarantees zero audio recording for patient privacy
      });
    } catch (initialErr: unknown) {
      // Overconstrained fallback: retry with standard unconstrained video on budget devices
      const isOverconstrained =
        initialErr instanceof DOMException && initialErr.name === 'OverconstrainedError';

      if (isOverconstrained) {
        console.warn('Requested camera resolution overconstrained, falling back to basic video constraints.');
        try {
          const fallbackConstraints: MediaTrackConstraints = deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode };

          stream = await navigator.mediaDevices.getUserMedia({
            video: fallbackConstraints,
            audio: false,
          });
        } catch (fallbackErr: unknown) {
          throw this.categorizeError(fallbackErr);
        }
      } else {
        throw this.categorizeError(initialErr);
      }
    }

    this.activeStream = stream;

    // Attach lifecycle event listeners to detect interruption (track mute/end events)
    this.attachTrackListeners(stream, onInterrupted, onResumed);

    return stream;
  }

  /**
   * Attaches track ended and mute listeners to detect camera interruptions
   * (e.g. backgrounded tabs, OS camera revocation, or hardware disconnection).
   */
  private attachTrackListeners(
    stream: MediaStream,
    onInterrupted?: (reason: 'ended' | 'muted' | 'visibility_hidden') => void,
    onResumed?: () => void
  ): void {
    const videoTracks = stream.getVideoTracks();

    videoTracks.forEach((track) => {
      const handleEnded = () => {
        if (onInterrupted) {
          onInterrupted('ended');
        }
      };

      const handleMute = () => {
        if (onInterrupted) {
          onInterrupted('muted');
        }
      };

      const handleUnmute = () => {
        if (onResumed) {
          onResumed();
        }
      };

      track.addEventListener('ended', handleEnded);
      track.addEventListener('mute', handleMute);
      track.addEventListener('unmute', handleUnmute);

      this.activeTrackListeners.push(
        { track, type: 'ended', listener: handleEnded },
        { track, type: 'mute', listener: handleMute },
        { track, type: 'unmute', listener: handleUnmute }
      );
    });
  }

  /**
   * Halts all active media tracks, detaches event listeners, and clears stream reference.
   */
  public stopStream(): void {
    // Remove all track listeners
    this.activeTrackListeners.forEach(({ track, type, listener }) => {
      try {
        track.removeEventListener(type, listener);
      } catch {
        // Ignore unbind exceptions
      }
    });
    this.activeTrackListeners = [];

    // Stop each track
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
   * Inspects active video track and returns actual negotiated hardware resolution.
   */
  public getActualResolution(): CameraResolution | null {
    if (!this.activeStream) return null;
    const videoTrack = this.activeStream.getVideoTracks()[0];
    if (!videoTrack) return null;

    const settings = videoTrack.getSettings();
    if (settings.width && settings.height) {
      return {
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
      };
    }
    return null;
  }

  /**
   * Maps DOMExceptions and runtime errors to structured CameraErrorDetails.
   */
  public categorizeError(error: unknown): CameraErrorDetails {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return {
          type: 'permission',
          message: 'Camera permission was denied. Please allow camera permissions in browser settings.',
          originalError: error,
        };
      }

      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return {
          type: 'not-found',
          message: 'No video input device found on this system.',
          originalError: error,
        };
      }

      if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        return {
          type: 'in-use',
          message: 'Camera is currently in use by another application or blocked by the operating system.',
          originalError: error,
        };
      }

      if (error.name === 'OverconstrainedError') {
        return {
          type: 'overconstrained',
          message: 'Camera does not meet requested resolution constraints.',
          originalError: error,
        };
      }
    }

    const message =
      error instanceof Error ? error.message : 'An unexpected error occurred while accessing the camera.';

    return {
      type: 'unknown',
      message,
      originalError: error,
    };
  }
}

export const cameraService = new CameraService();
