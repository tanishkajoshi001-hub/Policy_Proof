import { NormalizedLandmark, POSE_CONNECTIONS, POSE_LANDMARKS } from '../../../types/pose';
import { FormStatus } from '../../../shared/contracts/motion';

export interface SkeletonDrawerOptions {
  mirrored?: boolean;
  minVisibility?: number;
  formStatus?: FormStatus | string;
  angleDeg?: number | null;
  side?: 'left' | 'right';
  activeTripletIndices?: [number, number, number];
  showAngleBadge?: boolean;
  showAngleArc?: boolean;
  highlightArm?: boolean;
}

export interface SkeletonTheme {
  boneColor: string;
  boneGlowColor: string;
  jointFill: string;
  jointStroke: string;
  jointCore: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

/**
 * Returns the color theme matching the PRD specification:
 * - Green = correct form.
 * - Red = incorrect form.
 * - Neutral/amber = insufficient data or tracking loss.
 */
export function getSkeletonTheme(formStatus?: FormStatus | string): SkeletonTheme {
  switch (formStatus) {
    case 'correct':
      return {
        boneColor: '#22c55e', // Green (Tailwind emerald-500)
        boneGlowColor: 'rgba(34, 197, 94, 0.45)',
        jointFill: '#4ade80', // Emerald 400
        jointStroke: '#15803d', // Emerald 700
        jointCore: '#ffffff',
        badgeBg: 'rgba(20, 83, 45, 0.90)',
        badgeText: '#86efac',
        badgeBorder: '#22c55e',
      };

    case 'incorrect':
    case 'needs-adjustment':
      return {
        boneColor: '#ef4444', // Red (Tailwind rose-500)
        boneGlowColor: 'rgba(239, 68, 68, 0.45)',
        jointFill: '#f87171', // Rose 400
        jointStroke: '#b91c1c', // Rose 700
        jointCore: '#ffffff',
        badgeBg: 'rgba(136, 19, 55, 0.90)',
        badgeText: '#fecdd3',
        badgeBorder: '#ef4444',
      };

    case 'insufficient_data':
    case 'low-confidence':
    case 'partially-visible':
    case 'no-person':
    case 'no_person':
      return {
        boneColor: '#f59e0b', // Amber (Tailwind amber-500)
        boneGlowColor: 'rgba(245, 158, 11, 0.45)',
        jointFill: '#fbbf24', // Amber 400
        jointStroke: '#b45309', // Amber 700
        jointCore: '#ffffff',
        badgeBg: 'rgba(120, 53, 15, 0.90)',
        badgeText: '#fde68a',
        badgeBorder: '#f59e0b',
      };

    case 'neutral':
    case 'idle':
    case 'not_evaluated':
    case 'unknown':
    default:
      return {
        boneColor: '#0ea5e9', // Neutral Medical Cyan (Tailwind sky-500)
        boneGlowColor: 'rgba(14, 165, 233, 0.35)',
        jointFill: '#38bdf8', // Sky 400
        jointStroke: '#0369a1', // Sky 700
        jointCore: '#ffffff',
        badgeBg: 'rgba(12, 74, 110, 0.90)',
        badgeText: '#bae6fd',
        badgeBorder: '#0ea5e9',
      };
  }
}

/**
 * High-performance 2D Canvas skeleton renderer with dynamic color-coding and joint angle overlays.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  options: SkeletonDrawerOptions = {}
): void {
  const {
    mirrored = true,
    minVisibility = 0.45,
    formStatus = 'neutral',
    angleDeg = null,
    side = 'left',
    activeTripletIndices,
    showAngleBadge = true,
    showAngleArc = true,
    highlightArm = true,
  } = options;

  ctx.clearRect(0, 0, width, height);

  if (!landmarks || landmarks.length === 0) {
    return;
  }

  const theme = getSkeletonTheme(formStatus);

  // Transform normalized landmark [0, 1] into canvas pixel coordinates
  const getCanvasCoords = (lm: NormalizedLandmark | undefined): { x: number; y: number; visible: boolean } => {
    if (!lm) return { x: 0, y: 0, visible: false };
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

  // Determine active joint triplet (configured triplet or default elbow side)
  const shoulderIndex =
    activeTripletIndices?.[0] ??
    (side === 'right' ? POSE_LANDMARKS.RIGHT_SHOULDER : POSE_LANDMARKS.LEFT_SHOULDER);
  const elbowIndex =
    activeTripletIndices?.[1] ??
    (side === 'right' ? POSE_LANDMARKS.RIGHT_ELBOW : POSE_LANDMARKS.LEFT_ELBOW);
  const wristIndex =
    activeTripletIndices?.[2] ??
    (side === 'right' ? POSE_LANDMARKS.RIGHT_WRIST : POSE_LANDMARKS.LEFT_WRIST);

  const isArmBone = (idxA: number, idxB: number): boolean => {
    return (
      (idxA === shoulderIndex && idxB === elbowIndex) ||
      (idxA === elbowIndex && idxB === shoulderIndex) ||
      (idxA === elbowIndex && idxB === wristIndex) ||
      (idxA === wristIndex && idxB === elbowIndex)
    );
  };

  // 1. Draw connecting bones
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const [startIndex, endIndex] of POSE_CONNECTIONS) {
    const startLm = landmarks[startIndex];
    const endLm = landmarks[endIndex];

    if (!startLm || !endLm) continue;

    const start = getCanvasCoords(startLm);
    const end = getCanvasCoords(endLm);

    if (start.visible && end.visible) {
      const activeBone = highlightArm && isArmBone(startIndex, endIndex);

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);

      if (activeBone) {
        // Prominent highlighted active arm bone
        ctx.lineWidth = 6;
        ctx.strokeStyle = theme.boneColor;
        ctx.shadowColor = theme.boneGlowColor;
        ctx.shadowBlur = 12;
      } else {
        // Regular body bone (slightly dimmed if an arm is active)
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = highlightArm ? 'rgba(148, 163, 184, 0.65)' : theme.boneColor;
        ctx.shadowColor = highlightArm ? 'rgba(0, 0, 0, 0.2)' : theme.boneGlowColor;
        ctx.shadowBlur = 6;
      }

      ctx.stroke();
    }
  }
  ctx.restore();

  // 2. Draw angle arc at the elbow joint vertex
  const shoulderCoord = getCanvasCoords(landmarks[shoulderIndex]);
  const elbowCoord = getCanvasCoords(landmarks[elbowIndex]);
  const wristCoord = getCanvasCoords(landmarks[wristIndex]);

  if (
    showAngleArc &&
    angleDeg !== null &&
    !isNaN(angleDeg) &&
    shoulderCoord.visible &&
    elbowCoord.visible &&
    wristCoord.visible
  ) {
    ctx.save();
    const v1x = shoulderCoord.x - elbowCoord.x;
    const v1y = shoulderCoord.y - elbowCoord.y;
    const v2x = wristCoord.x - elbowCoord.x;
    const v2y = wristCoord.y - elbowCoord.y;

    const angle1 = Math.atan2(v1y, v1x);
    const angle2 = Math.atan2(v2y, v2x);

    const arcRadius = Math.min(36, Math.max(20, Math.hypot(v1x, v1y) * 0.25));

    ctx.beginPath();
    ctx.moveTo(elbowCoord.x, elbowCoord.y);
    ctx.arc(elbowCoord.x, elbowCoord.y, arcRadius, angle1, angle2, false);
    ctx.closePath();
    ctx.fillStyle = theme.boneGlowColor;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = theme.boneColor;
    ctx.stroke();
    ctx.restore();
  }

  // 3. Draw key joint markers (rehabilitation joints)
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

    const isActiveJoint = index === shoulderIndex || index === elbowIndex || index === wristIndex;
    const radius = isActiveJoint ? 8 : 5.5;

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = isActiveJoint ? theme.jointFill : 'rgba(203, 213, 225, 0.8)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = isActiveJoint ? theme.jointStroke : '#475569';
    ctx.stroke();

    // Inner bright center dot
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius * 0.35, 0, 2 * Math.PI);
    ctx.fillStyle = theme.jointCore;
    ctx.fill();
  }
  ctx.restore();

  // 4. Draw floating angle badge near the active elbow vertex
  if (
    showAngleBadge &&
    angleDeg !== null &&
    !isNaN(angleDeg) &&
    elbowCoord.visible
  ) {
    ctx.save();
    const angleText = `${Math.round(angleDeg)}°`;
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const textWidth = ctx.measureText(angleText).width;

    const paddingX = 10;
    const paddingY = 6;
    const badgeW = textWidth + paddingX * 2;
    const badgeH = 24 + paddingY;

    // Position badge offset from elbow
    const badgeX = Math.min(width - badgeW - 10, Math.max(10, elbowCoord.x + 18));
    const badgeY = Math.min(height - badgeH - 10, Math.max(10, elbowCoord.y - 18));

    // Pill background
    ctx.beginPath();
    const ctxWithRoundRect = ctx as unknown as {
      roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
    };
    if (typeof ctxWithRoundRect.roundRect === 'function') {
      ctxWithRoundRect.roundRect(badgeX, badgeY, badgeW, badgeH, 12);
    } else {
      ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    ctx.fillStyle = theme.badgeBg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = theme.badgeBorder;
    ctx.stroke();

    // Text
    ctx.fillStyle = theme.badgeText;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(angleText, badgeX + badgeW / 2, badgeY + badgeH / 2);
    ctx.restore();
  }
}
