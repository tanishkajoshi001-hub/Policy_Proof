# RehabBuddy System Architecture

This document describes the **actual implemented repository architecture** as of the Startup Foundation handoff (`foundation/startup`).

---

## 1. Chosen Technology Stack

- **Frontend**: React 19 + TypeScript (strict mode) + Vite 6 + Tailwind CSS + Lucide React icons.
- **On-Device Pose Detection**: `@mediapipe/tasks-vision` (`PoseLandmarker`) with local WASM binaries (`public/wasm/`) and local model (`public/models/pose_landmarker_lite.task`). GPU delegate default with CPU XNNPACK delegate fallback.
- **Linting & Type Safety**: ESLint 9 (`typescript-eslint`, `react-hooks`, `react-refresh`) + `tsc --noEmit`.
- **Testing**: Vitest + React Testing Library (`jsdom`) for unit/component tests; Playwright (`@playwright/test`) for desktop and mobile browser E2E verification.
- **Planned Backend (Final 20% Stage — Person 2)**: Supabase (Auth, Postgres, Row-Level Security) wired behind `src/shared/contracts/` and `src/shared/adapters/` without coupling UI components to a specific database SDK.

---

## 2. Module Map & Ownership Structure

```
Rehab_Buddy/
├── .github/
│   ├── workflows/ci.yml                 # CI: npm ci -> lint -> typecheck -> test -> build
│   ├── PULL_REQUEST_TEMPLATE.md         # Ownership-aware PR checklist
│   └── CODEOWNERS                       # Path ownership matrix
├── docs/
│   ├── contracts/README.md              # Contract conventions & change process
│   ├── ARCHITECTURE.md                  # This document
│   ├── EXERCISES_SPEC.md                # Biomechanical reference & exercise matrix
│   ├── PRD_SUMMARY.md                   # Product PRD summary
│   ├── ROADMAP.md                       # Delivery milestones
│   └── RehabBuddy_PRD_20pct_Startup_Only.pdf
├── public/
│   ├── models/pose_landmarker_lite.task # Local MediaPipe pose model
│   └── wasm/                            # Local MediaPipe vision WASM binaries
├── src/
│   ├── app/                             # Startup shell (Startup Owner)
│   │   ├── App.tsx                      # Root composition (Providers -> Layout -> Router)
│   │   ├── config/env.ts                # Public env validation at startup
│   │   ├── providers/AppProviders.tsx   # Language, navigation, ErrorBoundary, Suspense
│   │   ├── layouts/AppLayout.tsx        # Header, route-slot nav, main container, footer
│   │   ├── router/AppRouter.tsx         # Route slots (/, /tracking, /patient, /doctor, 404)
│   │   ├── boundaries/                  # ErrorBoundary, LoadingFallback, NotFoundPage
│   │   └── slots/                       # TrackingSlot (M1 wrapper) & ReservedSlotPage
│   ├── shared/                          # Shared foundations (Startup Owner)
│   │   ├── contracts/                   # Provisional v0.1 contracts (app, motion, patient, doctor)
│   │   ├── design-tokens/               # Semantic CSS variables & typed tokens
│   │   ├── ui/                          # Button, Input, Card, Container, Alert, Loading, Dialog
│   │   └── adapters/                    # Adapter seam interfaces (implementations by Person 2)
│   ├── features/
│   │   ├── camera/                      # Person 3 (Preserved Mission 01)
│   │   ├── pose/                        # Person 3 (Preserved Mission 01)
│   │   ├── rehab-tracking/              # Person 3 (Reserved for angle/rep/hold engine)
│   │   ├── patient/                     # Person 4 (Reserved)
│   │   ├── progress/                    # Person 4 (Reserved)
│   │   ├── i18n/                        # Person 4 (Reserved)
│   │   └── doctor/                      # Person 2 (Reserved)
│   ├── components/ & locales/ & types/  # Preserved Mission 01 UI, EN/HI locales, pose/camera types
│   ├── test/                            # Vitest unit & shell tests
│   └── tests/                           # Reserved for Person 2 integration tests
├── MODULE_OWNERSHIP.md
├── CONTRIBUTING.md
└── .env.example
```

---

## 3. Dependency Direction Rules

```
src/app/*  ─────────────────────►  src/shared/* (contracts, ui, design-tokens)
   │                                    ▲
   └──► Route Slots                     │
          ├── features/camera & pose ───┘  (Person 3)
          ├── features/patient/*     ───┘  (Person 4)
          └── features/doctor/*      ───┘  (Person 2)
```

1. **Features consume `src/shared/*`** (`contracts`, `ui`, `design-tokens`), never the reverse.
2. **`src/shared/*` must never import from `src/features/*`** (except the temporary `v0.1` re-export of `TrackingStatus` from `src/types/pose.ts` until Person 3 consolidates it).
3. **No cross-feature private imports**: Person 4's UI consumes `TrackingSnapshot` and `TrackingSessionResult` from `src/shared/contracts`, never internal MediaPipe or angle math internals.

---

## 4. Application Shell & Routing Composition

- `/` and `/tracking`: Renders `TrackingSlot`, preserving the Mission 01 camera setup and real-time pose detection overlay (`PoseCameraView` + `CameraControls`).
- `/patient` (and `/patient/*`): Renders `ReservedSlotPage` for **Person 4** (`feature/patient-experience`).
- `/doctor` (and `/doctor/*`): Renders `ReservedSlotPage` for **Person 2** (`feature/backend-doctor-release`).
- `*`: Renders `NotFoundPage` with navigation back to `/`.

---

## 5. Privacy & On-Device Processing Guarantee

- Raw camera streams from `navigator.mediaDevices.getUserMedia` (`audio: false`) stay strictly in the browser's `<video>` element and `<canvas>` overlay.
- MediaPipe Pose inference runs locally using `/wasm/` and `/models/pose_landmarker_lite.task`.
- Zero camera frames, images, or video recordings are uploaded to any server.
