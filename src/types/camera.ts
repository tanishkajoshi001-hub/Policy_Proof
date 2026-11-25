export type CameraState =
  | 'idle'
  | 'requesting-permission'
  | 'initializing'
  | 'active'
  | 'permission-denied'
  | 'camera-unavailable'
  | 'error';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  groupId?: string;
}

export interface CameraResolution {
  width: number;
  height: number;
}

export interface CameraErrorDetails {
  type: 'permission' | 'not-found' | 'in-use' | 'overconstrained' | 'unknown';
  message: string;
  originalError?: unknown;
}
