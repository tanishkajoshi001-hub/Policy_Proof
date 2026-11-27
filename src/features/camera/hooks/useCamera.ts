import { useState, useEffect, useCallback, useRef } from 'react';
import {
  CameraState,
  CameraDeviceInfo,
  CameraErrorDetails,
  CameraResolution,
  CameraResolutionPreset,
} from '../../../types/camera';
import { cameraService } from '../services/cameraService';

export interface UseCameraReturn {
  cameraState: CameraState;
  devices: CameraDeviceInfo[];
  activeDeviceId: string;
  resolutionPreset: CameraResolutionPreset;
  actualResolution: CameraResolution | null;
  error: CameraErrorDetails | null;
  stream: MediaStream | null;
  startCamera: (deviceId?: string, preset?: CameraResolutionPreset) => Promise<void>;
  stopCamera: () => void;
  restartCamera: () => Promise<void>;
  switchCamera: (deviceId: string) => Promise<void>;
  setResolutionPreset: (preset: CameraResolutionPreset) => void;
}

export function useCamera(): UseCameraReturn {
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [devices, setDevices] = useState<CameraDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [resolutionPreset, setResolutionPreset] = useState<CameraResolutionPreset>('balanced');
  const [actualResolution, setActualResolution] = useState<CameraResolution | null>(null);
  const [error, setError] = useState<CameraErrorDetails | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const isInterruptedRef = useRef<boolean>(false);

  // Refresh available camera devices
  const refreshDevices = useCallback(async () => {
    try {
      const list = await cameraService.getAvailableCameras();
      if (isMountedRef.current) {
        setDevices(list);
      }
    } catch {
      // Ignore device enumeration exceptions
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraService.stopStream();
    if (isMountedRef.current) {
      setStream(null);
      setActualResolution(null);
      setCameraState('idle');
      setError(null);
      isInterruptedRef.current = false;
    }
  }, []);

  const handleInterrupted = useCallback((reason: 'ended' | 'muted' | 'visibility_hidden') => {
    if (!isMountedRef.current) return;
    console.warn(`Camera feed interrupted (reason: ${reason})`);
    isInterruptedRef.current = true;
    setCameraState('interrupted');
    setError({
      type: 'interrupted',
      message: 'Camera stream was interrupted by the operating system, device disconnection, or tab backgrounding.',
    });
  }, []);

  const handleResumed = useCallback(() => {
    if (!isMountedRef.current) return;
    if (isInterruptedRef.current && cameraService.getStream()) {
      console.info('Camera stream resumed from interruption.');
      isInterruptedRef.current = false;
      setCameraState('active');
      setError(null);
    }
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string, presetOverride?: CameraResolutionPreset) => {
      if (!isMountedRef.current) return;

      setError(null);
      isInterruptedRef.current = false;
      setCameraState('requesting_permission');

      const targetPreset = presetOverride || resolutionPreset;

      try {
        const mediaStream = await cameraService.startStream({
          deviceId,
          preset: targetPreset,
          onInterrupted: handleInterrupted,
          onResumed: handleResumed,
        });

        if (!isMountedRef.current) {
          cameraService.stopStream();
          return;
        }

        setCameraState('initializing');
        setStream(mediaStream);

        // Populate device labels now that permission has been granted
        await refreshDevices();

        if (!isMountedRef.current) {
          cameraService.stopStream();
          return;
        }

        setCameraState('active');

        // Extract actual negotiated hardware resolution
        const actual = cameraService.getActualResolution();
        setActualResolution(actual);

        // Store active device ID from stream
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          if (settings.deviceId) {
            setActiveDeviceId(settings.deviceId);
          }
        }
      } catch (err: unknown) {
        if (!isMountedRef.current) return;

        const errorDetails: CameraErrorDetails =
          typeof err === 'object' && err !== null && 'type' in err
            ? (err as CameraErrorDetails)
            : cameraService.categorizeError(err);

        setError(errorDetails);

        if (errorDetails.type === 'permission') {
          setCameraState('permission_denied');
        } else if (errorDetails.type === 'not-found') {
          setCameraState('unavailable');
        } else {
          setCameraState('error');
        }

        setStream(null);
        setActualResolution(null);
      }
    },
    [resolutionPreset, refreshDevices, handleInterrupted, handleResumed]
  );

  const restartCamera = useCallback(async () => {
    stopCamera();
    await startCamera(activeDeviceId || undefined, resolutionPreset);
  }, [stopCamera, startCamera, activeDeviceId, resolutionPreset]);

  const switchCamera = useCallback(
    async (newDeviceId: string) => {
      setActiveDeviceId(newDeviceId);
      await startCamera(newDeviceId, resolutionPreset);
    },
    [startCamera, resolutionPreset]
  );

  const handlePresetChange = useCallback(
    (preset: CameraResolutionPreset) => {
      setResolutionPreset(preset);
      if (cameraState === 'active') {
        startCamera(activeDeviceId || undefined, preset);
      }
    },
    [cameraState, activeDeviceId, startCamera]
  );

  // Monitor visibility change (backgrounding the browser tab on phones or desktops)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && cameraService.getStream()) {
        handleInterrupted('visibility_hidden');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [handleInterrupted]);

  // Clean track release on component unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cameraService.stopStream();
    };
  }, []);

  return {
    cameraState,
    devices,
    activeDeviceId,
    resolutionPreset,
    actualResolution,
    error,
    stream,
    startCamera,
    stopCamera,
    restartCamera,
    switchCamera,
    setResolutionPreset: handlePresetChange,
  };
}
