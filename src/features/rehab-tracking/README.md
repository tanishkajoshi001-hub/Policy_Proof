# RehabBuddy Motion Intelligence & Pose Tracking Engine

**Owner**: Person 3 — Computer Vision & Exercise Intelligence (30% Work Package)  
**Branch**: `feature/motion-engine`  
**Contract Version**: `v1.0.0` (PRD Page 9 Specification)

---

## 1. Module Architecture & File Map

```text
src/features/rehab-tracking/
├── index.ts                          # Public module entry point (Person 4 / Person 2 barrel)
├── types.ts                          # Module types aligned with src/shared/contracts/motion.ts
├── README.md                         # Integration guide, privacy & performance report
├── config/
│   └── exercises.ts                  # Config-driven ExerciseCatalog + validateExerciseDefinition()
├── services/
│   ├── rehabTrackingController.ts    # Page 9 RehabTrackingController & createRehabTrackingController()
│   └── repStateMachine.ts            # Finite-state machine (Rep cycle, monotonic hold, feedback codes)
├── utils/
│   ├── angleCalculator.ts            # 2D image-plane vertex geometry (EPSILON, clamp, pixel scaling)
│   └── formEvaluator.ts              # Target/tolerance posture classification + insufficient_data gating
├── components/
│   └── PoseTrackingSurface.tsx       # Reusable <video> + <canvas> skeleton surface
└── workbench/
    └── MotionWorkbench.tsx           # Developer diagnostics dashboard (/workbench)
```

Supporting camera & pose runtime layers (owned by Person 3):
- `src/features/camera/**` — `CameraService`, `useCamera`, `CameraControls`
- `src/features/pose/**` — `PoseService` (`@mediapipe/tasks-vision@0.10.35`, Apache 2.0), `skeletonDrawer.ts`
- `public/models/pose_landmarker_lite.task` & `public/wasm/*` — Local offline WASM + model assets

---

## 2. Public TypeScript Exports

Import directly from `@/features/rehab-tracking` (`src/features/rehab-tracking/index.ts`) or `@/shared/contracts` (`src/shared/contracts/motion.ts`):

- **Factory & Controller**:
  - `createRehabTrackingController(): RehabTrackingController`
  - `RehabTrackingController` interface (`attachMedia`, `startExercise`, `pause`, `resume`, `stop`, `getSnapshot`, `subscribe`, `dispose`)
- **Snapshot & Session Contracts**:
  - `TrackingSnapshot` (`status`, `updatedAt`, `formStatus`, `phase`, `angleDeg`, `repCount`, `repGoal`, `holdElapsedMs`, `holdGoalMs`, `holdComplete`, `feedbackCode`, `confidence`, `fps`, `missingLandmarks`, `errorCode`)
  - `TrackingSessionResult` (`exerciseId`, `startedAt`, `endedAt`, `repCount`, `holdCompletedMs`, `accuracyPercent`, `correctFrames`, `evaluatedFrames`, `averageFps`, `stopReason`)
- **Exercise Catalog & Validator**:
  - `ELBOW_FLEXION_EXTENSION_REP` (`id: 'elbow_flexion_extension_rep'`, `clinicianReviewStatus: 'demo_unvalidated'`)
  - `ELBOW_ISOMETRIC_HOLD` (`id: 'elbow_isometric_hold'`, `clinicianReviewStatus: 'demo_unvalidated'`)
  - `EXERCISE_CATALOG`, `getExerciseDefinition(id)`, `validateExerciseDefinition(def)`
- **UI Components**:
  - `PoseTrackingSurface` (reusable video + color-coded skeleton overlay)
  - `MotionWorkbench` (developer diagnostic page at `/workbench`)

---

## 3. Exact Integration Guide for Person 4 (Patient Experience)

### Option A: Controller-Driven Integration (Custom Patient `<video>` & `<canvas>`)

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  createRehabTrackingController,
  getExerciseDefinition,
  TrackingSnapshot,
  TrackingSessionResult,
} from '../features/rehab-tracking';
import { useCamera } from '../features/camera/hooks/useCamera';

export function PatientExerciseSession({ exerciseId }: { exerciseId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef(createRehabTrackingController());

  const { cameraState, stream, startCamera, stopCamera } = useCamera();
  const [snapshot, setSnapshot] = useState<TrackingSnapshot>(() =>
    controllerRef.current.getSnapshot()
  );

  // 1. Subscribe to throttled TrackingSnapshots
  useEffect(() => {
    const controller = controllerRef.current;
    // subscribe() does NOT fire an implicit initial event; getSnapshot() provides initial state
    const unsubscribe = controller.subscribe((next) => {
      setSnapshot(next);
      // Person 4 maps next.feedbackCode -> localized English/Hindi copy & SpeechSynthesis
    });

    return () => {
      unsubscribe();
      void controller.dispose();
    };
  }, []);

  // 2. Attach media & start exercise after user explicitly starts camera
  const handleStartSession = async () => {
    await startCamera(); // Triggers browser permission ONLY on user click
    const definition = getExerciseDefinition(exerciseId);
    if (!definition || !videoRef.current || !canvasRef.current) return;

    await controllerRef.current.attachMedia(videoRef.current, canvasRef.current);
    await controllerRef.current.startExercise(definition);
  };

  // 3. Stop session & persist TrackingSessionResult via Person 4/Person 2 data port
  const handleFinishSession = async (): Promise<TrackingSessionResult> => {
    const result = await controllerRef.current.stop();
    stopCamera();
    return result;
  };

  return (
    <div>
      <video ref={videoRef} playsInline muted autoPlay />
      <canvas ref={canvasRef} />
      <p>Phase: {snapshot.phase} | Reps: {snapshot.repCount}/{snapshot.repGoal}</p>
      <p>Hold: {(snapshot.holdElapsedMs / 1000).toFixed(1)}s</p>
      <p>Code: {snapshot.feedbackCode}</p>
    </div>
  );
}
```

### Option B: Mount Reusable `PoseTrackingSurface`

Person 4 can mount `<PoseTrackingSurface>` directly inside patient views and consume `onSnapshotUpdate` / `onFrameProcessed`:

```tsx
<PoseTrackingSurface
  stream={stream}
  cameraState={cameraState}
  definition={activeExercise}
  isMirrored={true}
  onSnapshotUpdate={(partial) => {
    // Update angle / form status / feedbackCode badges
  }}
/>
```

### Structured `FeedbackCode` Dictionary (Person 4 Localization Mapping)

| `feedbackCode` | Meaning | Expected Patient UI / Speech Behavior |
|:---|:---|:---|
| `MOVE_TOWARD_TARGET` | User is at start or moving toward target angle | Prompt patient to bend toward target range; do not count yet |
| `TARGET_REACHED` | Target range achieved with `>= 0.65` confidence | Positive cue; hold timer accrues in `hold` mode |
| `RETURN_TO_START` | Target reached; waiting for return to start range | Instruct patient to return smoothly to start position |
| `FORM_OUT_OF_RANGE` | Joint angle outside allowed range for current phase | Gentle form cue (no medical diagnosis) |
| `POSE_NOT_CLEAR` | Missing or low-confidence elbow/wrist (`< 0.65`) | Ask patient to adjust lighting/framing; counters frozen |
| `PERSON_NOT_VISIBLE` | No subject detected in frame | Prompt camera setup check; counters frozen |
| `EXERCISE_COMPLETE` | Prescribed `repGoal` or `holdSeconds` goal met | Trigger session completion flow |

---

## 4. Clinical, Biomechanical & Runtime Limitations

- **Contract Boundary (`v1.0.0`)**: `src/shared/contracts/motion.ts` exports pure TypeScript contracts only (`v1.0.0`, promoted from `v0.1.0-provisional`). Runtime exports (`createRehabTrackingController`, `PoseTrackingSurface`, `MotionWorkbench`) are imported strictly from `src/features/rehab-tracking`.
- **Single-Subject Tracking (`numPoses: 1`)**: MediaPipe `PoseLandmarker` is configured with `numPoses: 1`, which tracks MediaPipe's single primary subject. Multi-person ambiguity gating (`> 1` person in frame) is a documented hackathon limitation.
- **Warmup Exclusion**: The first 5 inference frames after model initialization are treated as cold-start shader/WASM warmup and excluded from rolling steady-state `avgInferenceTimeMs` / `p95InferenceTimeMs` telemetry (`resetMetrics()` resets the warmup window).
- **Demo Thresholds (`demo_unvalidated`)**: Both included exercises (`elbow_flexion_extension_rep` and `elbow_isometric_hold`) carry `clinicianReviewStatus: 'demo_unvalidated'`. Sample values (`160°` start, `60°` target, `10°` tolerance, `3s` hold, `10` reps) are engineering placeholders and **not** medically approved rehabilitation limits.
- **2D Image-Plane Limitation**: `angleAtVertex()` computes 2D planar joint angles scaled by video dimensions (`videoWidth × videoHeight`). Out-of-plane forearm rotation, perspective foreshortening, or camera skew will distort projected angles; patients should face the camera as guided in the setup checklist.
- **Session Accuracy Metric**: `TrackingSessionResult.accuracyPercent` reflects observed session form accuracy (`correctFrames / evaluatedFrames * 100`, excluding `insufficient_data` frames; `null` if `evaluatedFrames === 0`), not clinical recovery progress.
- **Third-Party Dependency Pinning**: `@mediapipe/tasks-vision` is pinned at `0.10.35` (Apache License 2.0, Google LLC) using locally packaged assets in `public/wasm/` and `public/models/pose_landmarker_lite.task`.

---

## 5. Performance & Privacy Report (PRD Section 9.1 / Section 12)

- **Module**: Motion Intelligence & Pose Tracking Engine
- **Branch**: `fix/motion-engine-audit` (replaces audit blockers from `feature/motion-engine`)
- **Automated Verification Scope**:
  - TypeScript strict check (`npm run typecheck`), ESLint (`npm run lint`), Vitest unit/adversarial/integration suite (`npm run test`), Playwright E2E tests (`desktop-chrome` & `mobile-chrome`), and Vite production build (`npm run build`).
  - Privacy & offline runtime verification: zero `MediaRecorder`, zero `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon` calls during tracking, `audio: false` enforced on `getUserMedia`, external CDN fallback removed from `poseService.ts`, and `context.setOffline(true)` verified in Playwright for in-session camera restart after initial asset load (note: cold page reloads while offline require a Service Worker / PWA precache or persistent HTTP cache headers on `/wasm/` and `/models/`, not provided by `vite preview`).
  - Timestamped state-machine feedback latency verified `< 1ms` in JS evaluation after posture error injection (`< 1000ms` PRD FR5 threshold).
- **Physical Hardware Verification Status**:
  - **Desktop Real Webcam (`GPU` & `CPU` delegates, steady-state FPS, P95 latency)**: **NOT VERIFIED** in automated headless CI (no physical webcam attached to sandbox).
  - **Mid-Range Android Browser (`FR2 / PERF-01 >= 15 FPS`, `< 1s` end-to-end latency)**: **NOT VERIFIED** (no physical Android phone measured).
  - **Measurement Protocol**: Run `npm run build && npm run preview` on target laptop webcam and mid-range Android phone, open `/workbench` (testing both `GPU (Auto)` and `Force CPU` buttons / `?delegate=cpu`), allow 5-frame warmup, and record exact hardware, OS, browser, resolution, Camera FPS, Pose FPS, Avg Latency, and P95 Latency.
