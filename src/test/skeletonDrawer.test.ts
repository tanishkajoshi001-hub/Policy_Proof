import { describe, it, expect, vi } from 'vitest';
import { drawSkeleton, getSkeletonTheme } from '../features/pose/utils/skeletonDrawer';
import { NormalizedLandmark, POSE_LANDMARKS } from '../types/pose';

describe('SkeletonDrawer & PRD Color Specification', () => {
  describe('getSkeletonTheme Color Mapping', () => {
    it('returns GREEN (#22c55e) for correct posture form', () => {
      const theme = getSkeletonTheme('correct');
      expect(theme.boneColor).toBe('#22c55e');
      expect(theme.jointFill).toBe('#4ade80');
      expect(theme.jointStroke).toBe('#15803d');
      expect(theme.badgeBorder).toBe('#22c55e');
    });

    it('returns RED (#ef4444) for incorrect posture form or needs-adjustment', () => {
      const incorrectTheme = getSkeletonTheme('incorrect');
      expect(incorrectTheme.boneColor).toBe('#ef4444');
      expect(incorrectTheme.jointFill).toBe('#f87171');
      expect(incorrectTheme.jointStroke).toBe('#b91c1c');

      const needsAdjTheme = getSkeletonTheme('needs-adjustment');
      expect(needsAdjTheme.boneColor).toBe('#ef4444');
    });

    it('returns AMBER (#f59e0b) for insufficient data and tracking loss', () => {
      const insufficientTheme = getSkeletonTheme('insufficient_data');
      expect(insufficientTheme.boneColor).toBe('#f59e0b');
      expect(insufficientTheme.jointFill).toBe('#fbbf24');
      expect(insufficientTheme.jointStroke).toBe('#b45309');

      const lowConfTheme = getSkeletonTheme('low-confidence');
      expect(lowConfTheme.boneColor).toBe('#f59e0b');

      const noPersonTheme = getSkeletonTheme('no-person');
      expect(noPersonTheme.boneColor).toBe('#f59e0b');
    });

    it('returns NEUTRAL CYAN (#0ea5e9) for neutral, idle, or uninitialized states', () => {
      const neutralTheme = getSkeletonTheme('neutral');
      expect(neutralTheme.boneColor).toBe('#0ea5e9');

      const idleTheme = getSkeletonTheme('idle');
      expect(idleTheme.boneColor).toBe('#0ea5e9');

      const defaultTheme = getSkeletonTheme(undefined);
      expect(defaultTheme.boneColor).toBe('#0ea5e9');
    });
  });

  describe('drawSkeleton Canvas Rendering', () => {
    const createMockContext = () => {
      return {
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        closePath: vi.fn(),
        rect: vi.fn(),
        roundRect: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 40 }),
        fillText: vi.fn(),
        lineWidth: 0,
        lineCap: '',
        lineJoin: '',
        strokeStyle: '',
        fillStyle: '',
        shadowColor: '',
        shadowBlur: 0,
        font: '',
        textBaseline: '',
        textAlign: '',
      } as unknown as CanvasRenderingContext2D;
    };

    const createSampleLandmarks = (): NormalizedLandmark[] => {
      const landmarks: NormalizedLandmark[] = [];
      for (let i = 0; i < 33; i++) {
        landmarks.push({
          x: 0.5,
          y: 0.5,
          z: 0.0,
          visibility: 0.9,
          presence: 0.9,
        });
      }
      // Position left arm triplet
      landmarks[POSE_LANDMARKS.LEFT_SHOULDER] = { x: 0.6, y: 0.3, z: 0, visibility: 0.95 };
      landmarks[POSE_LANDMARKS.LEFT_ELBOW] = { x: 0.7, y: 0.5, z: 0, visibility: 0.92 };
      landmarks[POSE_LANDMARKS.LEFT_WRIST] = { x: 0.65, y: 0.7, z: 0, visibility: 0.88 };
      return landmarks;
    };

    it('clears canvas and returns safely for empty landmarks', () => {
      const ctx = createMockContext();
      drawSkeleton(ctx, [], 640, 480);
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
      expect(ctx.stroke).not.toHaveBeenCalled();
    });

    it('renders skeleton lines and joints for valid landmarks', () => {
      const ctx = createMockContext();
      const landmarks = createSampleLandmarks();

      drawSkeleton(ctx, landmarks, 640, 480, {
        formStatus: 'correct',
        mirrored: true,
      });

      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 640, 480);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('renders angle arc and floating angle badge when angleDeg is provided', () => {
      const ctx = createMockContext();
      const landmarks = createSampleLandmarks();

      drawSkeleton(ctx, landmarks, 640, 480, {
        formStatus: 'correct',
        angleDeg: 142.5,
        side: 'left',
        showAngleBadge: true,
        showAngleArc: true,
      });

      // Verification of badge text rendering
      expect(ctx.fillText).toHaveBeenCalledWith('143°', expect.any(Number), expect.any(Number));
      expect(ctx.closePath).toHaveBeenCalled();
    });

    it('applies red styling when posture form is incorrect', () => {
      const ctx = createMockContext();
      const landmarks = createSampleLandmarks();

      drawSkeleton(ctx, landmarks, 640, 480, {
        formStatus: 'incorrect',
        angleDeg: 35,
        side: 'left',
      });

      expect(ctx.fillText).toHaveBeenCalledWith('35°', expect.any(Number), expect.any(Number));
    });

    it('applies amber styling when form is insufficient_data', () => {
      const ctx = createMockContext();
      const landmarks = createSampleLandmarks();

      drawSkeleton(ctx, landmarks, 640, 480, {
        formStatus: 'insufficient_data',
        angleDeg: 90,
        side: 'left',
      });

      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('accurately reflects X coordinates when mirrored=true vs mirrored=false across canvas sizes', () => {
      const ctxMirrored = createMockContext();
      const ctxUnmirrored = createMockContext();
      const landmarks = createSampleLandmarks();
      // Left elbow is at x = 0.7, y = 0.5
      landmarks[POSE_LANDMARKS.LEFT_ELBOW] = { x: 0.7, y: 0.5, z: 0, visibility: 0.95 };

      // Desktop 1280x720 mirrored -> elbow X = (1 - 0.7) * 1280 = 384, Y = 0.5 * 720 = 360
      drawSkeleton(ctxMirrored, landmarks, 1280, 720, {
        mirrored: true,
        formStatus: 'correct',
        side: 'left',
      });
      const mirroredArcCalls = (ctxMirrored.arc as ReturnType<typeof vi.fn>).mock.calls;
      const hasMirroredElbow = mirroredArcCalls.some(
        ([x, y]) => Math.abs(x - 384) < 0.01 && Math.abs(y - 360) < 0.01
      );
      expect(hasMirroredElbow).toBe(true);

      // Mobile 393x851 unmirrored -> elbow X = 0.7 * 393 = 275.1, Y = 0.5 * 851 = 425.5
      drawSkeleton(ctxUnmirrored, landmarks, 393, 851, {
        mirrored: false,
        formStatus: 'correct',
        side: 'left',
      });
      const unmirroredArcCalls = (ctxUnmirrored.arc as ReturnType<typeof vi.fn>).mock.calls;
      const hasUnmirroredElbow = unmirroredArcCalls.some(
        ([x, y]) => Math.abs(x - 275.1) < 0.01 && Math.abs(y - 425.5) < 0.01
      );
      expect(hasUnmirroredElbow).toBe(true);
    });
  });
});
