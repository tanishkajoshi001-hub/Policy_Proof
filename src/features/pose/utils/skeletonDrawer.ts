import { NormalizedLandmark, POSE_CONNECTIONS, POSE_LANDMARKS } from '../../../types/pose';

export interface SkeletonDrawerOptions {
  mirrored?: boolean;
  minVisibility?: number;
}

// Neutral clinical aesthetic colors (Medical Cyan / Slate Blue)
// NOT green/red feedback (which is reserved for future exercise evaluation milestone)
const BONE_COLOR = '#0ea5e9'; // Tailwind sky-500
const BONE_GLOW_COLOR = 'rgba(14, 165, 233, 0.3)';
const JOINT_FILL = '#38bdf8'; // Tailwind sky-400
const JOINT_STROKE = '#0369a1'; // Tailwind sky-700
const JOINT_CORE = '#ffffff';

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  options: SkeletonDrawerOptions = {}
): void {
  const { mirrored = true, minVisibility = 0.45 } = options;

  ctx.clearRect(0, 0, width, height);

  if (!landmarks || landmarks.length === 0) {
    return;
  }

  // Transform normalized landmark [0, 1] into canvas pixel coordinates
  const getCanvasCoords = (lm: NormalizedLandmark): { x: number; y: number; visible: boolean } => {
    const rawX = lm.x;
    const rawY = lm.y;
    const visibility = lm.visibility ?? lm.presence ?? 1.0;

    // If mirrored (selfie mode), flip X coordinate horizontally
    const x = mirrored ? (1 - rawX) * width : rawX * width;
    const y = rawY * height;

    return {
      x,
      y,
      visible: visibility >= minVisibility,
    };
  };

  // 1. Draw connecting bones
  ctx.save();
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = BONE_COLOR;
  ctx.shadowColor = BONE_GLOW_COLOR;
  ctx.shadowBlur = 8;

  for (const [startIndex, endIndex] of POSE_CONNECTIONS) {
    const startLm = landmarks[startIndex];
    const endLm = landmarks[endIndex];

    if (!startLm || !endLm) continue;

    const start = getCanvasCoords(startLm);
    const end = getCanvasCoords(endLm);

    if (start.visible && end.visible) {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }
  ctx.restore();

  // 2. Draw key joint markers (focusing on rehabilitation joints)
  const keyJointIndices = [
    POSE_LANDMARKS.LEFT_SHOULDER,
    POSE_LANDMARKS.RIGHT_SHOULDER,
    POSE_LANDMARKS.LEFT_ELBOW,
    POSE_LANDMARKS.RIGHT_ELBOW,
    POSE_LANDMARKS.LEFT_WRIST,
    POSE_LANDMARKS.RIGHT_WRIST,
    POSE_LANDMARKS.LEFT_HIP,
    POSE_LANDMARKS.RIGHT_HIP,
    POSE_LANDMARKS.LEFT_KNEE,
    POSE_LANDMARKS.RIGHT_KNEE,
    POSE_LANDMARKS.LEFT_ANKLE,
    POSE_LANDMARKS.RIGHT_ANKLE,
  ];

  ctx.save();
  for (const index of keyJointIndices) {
    const lm = landmarks[index];
    if (!lm) continue;

    const pt = getCanvasCoords(lm);
    if (!pt.visible) continue;

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 7, 0, 2 * Math.PI);
    ctx.fillStyle = JOINT_FILL;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = JOINT_STROKE;
    ctx.stroke();

    // Inner bright white center dot
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = JOINT_CORE;
    ctx.fill();
  }
  ctx.restore();
}
