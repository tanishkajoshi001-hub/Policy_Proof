import { useState, useEffect, useCallback, useRef } from 'react';
import { CameraState, CameraDeviceInfo, CameraErrorDetails } from '../../../types/camera';
import { cameraService } from '../services/cameraService';

export interface UseCameraReturn {
  cameraState: CameraState;
  devices: CameraDeviceInfo[];
  activeDeviceId: string;
  error: CameraErrorDetails | null;
  stream: MediaStream | null;
  startCamera: (deviceId?: string) => Promise<void>;
  stopCamera: () => void;
  switchCamera: (deviceId: string) => Promise<void>;
}

export function useCamera(): UseCameraReturn {
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [devices, setDevices] = useState<CameraDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [error, setError] = useState<CameraErrorDetails | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Keep track of mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cameraService.stopStream();
    };
  }, []);

  // Refresh available camera devices
  const refreshDevices = useCallback(async () => {
    try {
      const list = await cameraService.getAvailableCameras();
      if (isMountedRef.current) {
        setDevices(list);
      }
    } catch {
      // Ignore device enumeration errors
    }
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    if (!isMountedRef.current) return;

    setError(null);
    setCameraState('requesting-permission');

    try {
      const mediaStream = await cameraService.startStream(deviceId);

      if (!isMountedRef.current) {
        cameraService.stopStream();
        return;
      }

      setCameraState('initializing');
      setStream(mediaStream);

      // Refresh camera devices list now that permission is granted (labels will be populated)
      await refreshDevices();

      if (!isMountedRef.current) {
        cameraService.stopStream();
        return;
      }

      setCameraState('active');

      // Find active device id if possible
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        if (settings.deviceId) {
          setActiveDeviceId(settings.deviceId);
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;

      const errorDetails: CameraErrorDetails = err?.type ? err : cameraService.categorizeError(err);
      setError(errorDetails);

      if (errorDetails.type === 'permission') {
        setCameraState('permission-denied');
      } else if (errorDetails.type === 'not-found') {
        setCameraState('camera-unavailable');
      } else {
        setCameraState('error');
      }

      setStream(null);
    }
  }, [refreshDevices]);

  const stopCamera = useCallback(() => {
    cameraService.stopStream();
    if (isMountedRef.current) {
      setStream(null);
      setCameraState('idle');
      setError(null);
    }
  }, []);

  const switchCamera = useCallback(async (newDeviceId: string) => {
    setActiveDeviceId(newDeviceId);
    await startCamera(newDeviceId);
  }, [startCamera]);

  return {
    cameraState,
    devices,
    activeDeviceId,
    error,
    stream,
    startCamera,
    stopCamera,
    switchCamera,
  };
}
