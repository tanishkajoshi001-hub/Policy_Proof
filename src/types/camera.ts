/**
 * @fileoverview Camera subsystem types and configurations.
 * Aligns strictly with RehabBuddy PRD camera lifecycle states and adaptive resolution guidelines.
 */

/**
 * Authoritative camera lifecycle states as defined in RehabBuddy PRD:
 * - idle: Initial resting state; camera is off; waiting for user action.
 * - requesting_permission: User clicked Start; browser permission prompt is active.
 * - initializing: Permission granted; hardware stream is spinning up.
 * - active: Video stream is flowing; frames are being captured and processed.
 * - permission_denied: User declined or blocked camera permissions.
 * - unavailable: Camera hardware is missing, in use, or unsupported.
 * - interrupted: Video stream was disrupted (backgrounded tab, OS mute, disconnected cable).
 * - error: General or unrecoverable camera hardware/runtime exception.
 */
export type CameraState =
  | 'idle'
  | 'requesting_permission'
  | 'initializing'
  | 'active'
  | 'permission_denied'
  | 'unavailable'
  | 'interrupted'
  | 'error'
  // Backwards-compatible aliases for legacy/transition code
  | 'requesting-permission'
  | 'permission-denied'
  | 'camera-unavailable';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  groupId?: string;
}

/**
 * Configurable resolution presets.
 * Note: The PRD deliberately does NOT prescribe a single fixed resolution (e.g. 640x480 vs 1280x720);
 * rather, it mandates choosing a practical, configurable resolution that balances landmark stability
 * with low-end/mid-range phone performance and thermal limits.
 */
export type CameraResolutionPreset = 'balanced' | 'performance' | 'high';

export interface CameraResolutionConfig {
  idealWidth: number;
  idealHeight: number;
  minWidth?: number;
  minHeight?: number;
  idealFrameRate?: number;
  minFrameRate?: number;
}

export const CAMERA_RESOLUTION_PRESETS: Record<CameraResolutionPreset, CameraResolutionConfig> = {
  // Practical default: clear joint definitions for elbow/wrist/finger tracking on mid-range devices
  balanced: {
    idealWidth: 1280,
    idealHeight: 720,
    minWidth: 480,
    minHeight: 360,
    idealFrameRate: 30,
    minFrameRate: 15,
  },
  // Lower processing overhead: ideal for low-end / budget smartphones or low-battery mode
  performance: {
    idealWidth: 640,
    idealHeight: 480,
    minWidth: 320,
    minHeight: 240,
    idealFrameRate: 30,
    minFrameRate: 15,
  },
  // High fidelity: optimal for desktop or tablet clinical diagnosis
  high: {
    idealWidth: 1920,
    idealHeight: 1080,
    minWidth: 640,
    minHeight: 480,
    idealFrameRate: 30,
    minFrameRate: 20,
  },
};

export interface CameraStreamOptions {
  deviceId?: string;
  preset?: CameraResolutionPreset;
  customResolution?: Partial<CameraResolutionConfig>;
  facingMode?: 'user' | 'environment';
  onInterrupted?: (reason: 'ended' | 'muted' | 'visibility_hidden') => void;
  onResumed?: () => void;
}

export interface CameraResolution {
  width: number;
  height: number;
  frameRate?: number;
}

export interface CameraErrorDetails {
  type: 'permission' | 'not-found' | 'in-use' | 'overconstrained' | 'interrupted' | 'unknown';
  message: string;
  originalError?: unknown;
}
