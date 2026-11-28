# Contributing to RehabBuddy

Thank you for contributing to RehabBuddy. This repository uses a strict ownership-isolated workflow so multiple engineers can build in parallel without merge conflicts or duplicated types.

---

## 1. Branch Naming & Workflow

| Owner | Branch Name |
|:---|:---|
| Startup / Foundation | `foundation/startup` |
| Motion Engine (Person 3) | `feature/motion-engine` |
| Patient Experience (Person 4) | `feature/patient-experience` |
| Backend, Doctor & Release (Person 2) | `feature/backend-doctor-release` |

### Creating Your Feature Branch
Start from the verified foundation:
```bash
git checkout foundation/startup
git pull
git checkout -b feature/<your-module>
```

---

## 2. Dependency Direction & No-Overlap Rules

1. **One-directional imports**:
   - `src/features/<your-feature>/**` **may** import from `src/shared/contracts`, `src/shared/ui`, and `src/shared/design-tokens`.
   - `src/shared/**` **must never** import internals from `src/features/**`.
   - Features **must never** import private internals from another feature's folder.
2. **Respect path ownership**: Only edit files inside your assigned folders (see `MODULE_OWNERSHIP.md` and `.github/CODEOWNERS`).
3. **Single canonical contracts**: Never duplicate `TrackingSnapshot`, `ExerciseDefinition`, or `PatientSessionRecord` inside feature folders—propose updates in `src/shared/contracts/` (see `docs/contracts/README.md`).
4. **Never commit secrets**: Do not commit `.env`, `.env.local`, API keys, service role tokens, or patient data.

### Person 3 Shared-File Integration Manifest (`fix/motion-engine-audit`)
The following minimal edits outside `src/features/{camera,pose,rehab-tracking}` were required and are documented for Person 2's final integration:
- `src/shared/contracts/app.ts` & `src/app/router/AppRouter.tsx`: Added `/workbench` (`APP_ROUTES.WORKBENCH`) route mapping to `TrackingSlot`.
- `src/app/slots/TrackingSlot.tsx`: Added segmented tab toggle between the preserved Camera Setup View (`/`, `/tracking`) and Motion Intelligence Workbench (`/workbench`), passing `t` to `PoseTrackingSurface`.
- `src/shared/contracts/motion.ts`: Finalized `v1.0.0` pure types/interfaces (zero imports from `src/features/*`).
- `src/locales/{en,hi}.ts` & `src/types/i18n.ts`: Added `resumeCamera`, `cameraInterruptedTitle/Msg`, and `resolution*` strings used by `CameraControls` & `PoseTrackingSurface`.
- `src/test/setup.ts`: Added JSDOM `roundRect`, `closePath`, `measureText`, and `fillText` canvas polyfills and `@testing-library/jest-dom/vitest` import.

---

## 3. Required Local Checks Before Opening a PR

All pull requests run CI (`lint`, `typecheck`, `test`, `build`). Run these locally before pushing:

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

For browser UI/routing verification:
```bash
npm run test:e2e
```

---

## 4. Local Hardware Camera Verification (Person 3 Procedure)

GitHub Actions CI runs in headless Linux without a physical camera. Whenever Person 3 updates `src/features/camera/**`, `src/features/pose/**`, or `src/features/rehab-tracking/**`, run local hardware checks before opening a PR:

1. Start the production preview locally:
   ```bash
   npm run build
   npm run preview
   ```
2. Open the local URL in Chrome/Edge on a device with a real webcam (and on a mid-range Android browser over HTTPS/port-forwarding if available).
3. Explicitly click **Start Camera** and verify:
   - Permission prompt and stream initialization succeed.
   - Skeleton overlay aligns accurately in both mirrored and unmirrored modes.
   - Telemetry HUD confirms **Pose FPS ≥ 15** and reports Camera FPS, Avg latency, and P95 latency.
   - Leaving the camera frame transitions status to **No Person Detected**.
   - Test CPU delegate (`?delegate=cpu`) and verify inference runs cleanly.
   - Click **Stop Camera** and confirm the camera indicator light turns off.
4. Record your hardware device, delegate, observed FPS, and screenshots in the PR template.
