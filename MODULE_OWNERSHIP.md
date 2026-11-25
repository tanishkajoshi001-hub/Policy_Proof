# RehabBuddy Module Ownership & Handoff Matrix

This document defines the strict ownership boundaries across all four team owners under the sequenced execution plan.

---

## 1. Branch & Owner Overview

| Owner | Stage | Branch | Primary Scope |
|:---|:---|:---|:---|
| **Startup Owner (You)** | First 20% | `foundation/startup` | Repository bootstrap, app shell, route slots, shared contracts (`v0.1`), design tokens, UI primitives, CI, tooling, and handoff docs. **Stops after handoff.** |
| **Person 3** | Middle 30% | `feature/motion-engine` | Camera lifecycle, MediaPipe PoseLandmarker, joint-angle math, exercise evaluation, rep/hold finite state machine, and local hardware verification. |
| **Person 4** | Middle 30% | `feature/patient-experience` | Patient onboarding/routes, exercise library UI, 0–10 VAS pain check flow, English/Hindi voice & i18n, session summary, and progress UI. |
| **Person 2** | Final 20% | `feature/backend-doctor-release` | Supabase schema/auth/RLS, production `PatientDataPort` / `DoctorDataPort` adapters, doctor workspace, final branch integration, E2E verification, and release. |

---

## 2. Exact Folder & File Ownership

### Startup Owner (`foundation/startup`)
- `src/app/**` (bootstrap, router, providers, layouts, error/loading/not-found boundaries, route slots)
- `src/shared/ui/**` (Button, Input, Card, Container, Alert, Loading, Dialog)
- `src/shared/design-tokens/**` (semantic CSS variables and typed tokens)
- `src/shared/contracts/**` (canonical export barrel and `v0.1` provisional contracts)
- Root configs: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`
- CI & Docs: `.github/**`, `README.md`, `docs/ARCHITECTURE.md`, `MODULE_OWNERSHIP.md`, `CONTRIBUTING.md`, `docs/contracts/README.md`

### Person 3 (`feature/motion-engine`) — Exact Takeover Files from Mission 01
Existing Mission 01 working code is preserved intact and assigned to **Person 3**:
- `src/features/camera/services/cameraService.ts`
- `src/features/camera/hooks/useCamera.ts`
- `src/features/camera/components/CameraControls.tsx`
- `src/features/pose/services/poseService.ts`
- `src/features/pose/utils/skeletonDrawer.ts`
- `src/features/pose/components/PoseCameraView.tsx`
- `src/types/camera.ts` *(Person 3 owns reconciling with `src/shared/contracts/motion.ts`)*
- `src/types/pose.ts` *(Person 3 owns reconciling `TrackingStatus` / `PoseFrameMetrics` with `src/shared/contracts/motion.ts`)*
- `src/test/cameraService.test.ts`
- `src/test/poseService.test.ts`
- `public/models/pose_landmarker_lite.task`
- `public/wasm/**`
- Reserved extension folder: `src/features/rehab-tracking/**`

### Person 4 (`feature/patient-experience`)
- `src/features/patient/**`
- `src/features/progress/**`
- `src/features/i18n/**`
- *(Note: Initial Mission 01 setup strings remain in `src/locales/en.ts`, `src/locales/hi.ts`, and `src/types/i18n.ts` until Person 4 consolidates them into `src/features/i18n/`.)*

### Person 2 (`feature/backend-doctor-release`)
- `src/features/doctor/**`
- `src/shared/adapters/**` *(production Supabase implementations of `PatientDataPort` and `DoctorDataPort`)*
- `supabase/**` *(migrations, schema, RLS policies)*
- `src/tests/**` *(cross-module integration tests)*
- Final branch merge, contract freeze, release verification, and deployment.

---

## 3. Non-Goals & Handoff Sequence

1. **Startup Owner** completes the 20% foundation, verifies baseline checks, commits on `foundation/startup`, and **stops**.
2. **Person 3** and **Person 4** branch from `foundation/startup` (or `main` once merged) and build independently in parallel using provisional contracts (`v0.1`), validating contract definitions with each other before freezing.
3. **Person 2** integrates `feature/motion-engine` and `feature/patient-experience`, implements Supabase/RLS + doctor workspace, freezes contracts, runs full verification, and ships the release.
