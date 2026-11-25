# RehabBuddy (`Rehab_Buddy`)

> **AI Home Rehab Coach for Fracture Recovery**  
> *A browser-based AI physiotherapy assistant that watches patients do prescribed recovery exercises through the camera, guides posture in real time on-device, and tracks recovery progress.*

---

## Current Repository Stage

This repository contains:
1. **Verified Mission 01 Camera & Pose Foundation** (`src/features/camera/**`, `src/features/pose/**`) using local MediaPipe PoseLandmarker (`@mediapipe/tasks-vision`) assets (`public/models/` & `public/wasm/`).
2. **Startup Foundation & Initial Handoff (First 20%)** (`foundation/startup`): Application shell, route slots (`/`, `/tracking`, `/patient` reserved, `/doctor` reserved), `v0.1` provisional shared contracts (`src/shared/contracts/`), semantic design tokens, reusable accessible UI primitives, ESLint + strict TypeScript + CI, and ownership documentation.

---

## Prerequisites

- **Node.js**: v22+ (tested with v24.14.1)
- **npm**: v10+ (single package manager with committed `package-lock.json`)
- **Browser**: Modern Chromium/Edge/Firefox/Safari with webcam access for local pose testing

---

## Setup & Development Commands

```bash
# 1. Install dependencies reproducibly from package-lock.json
npm ci

# 2. Optional: copy public environment template
cp .env.example .env.local

# 3. Start local development server (http://localhost:3000)
npm run dev
```

### Quality, Testing & Build Commands

| Command | Purpose |
|:---|:---|
| `npm run lint` | Run ESLint across `src/**/*.{ts,tsx}` |
| `npm run typecheck` | Run TypeScript strict check (`tsc --noEmit`) |
| `npm run test` | Run Vitest unit & shell component tests |
| `npm run test:e2e` | Run Playwright headless browser tests (desktop & mobile viewports with synthetic camera stream) |
| `npm run build` | Run `tsc && vite build` to produce `dist/` |
| `npm run preview` | Preview the production `dist/` bundle locally |

---

## Documentation Index

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Stack, module map, dependency direction, routing, and contracts.
- **[MODULE_OWNERSHIP.md](MODULE_OWNERSHIP.md)** — Four-owner boundaries, branches, and exact Person 3 takeover file list.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Branch workflow, PR checklist, and local hardware camera verification procedure.
- **[docs/contracts/README.md](docs/contracts/README.md)** — Canonical `v0.1` provisional contracts and change process.
- **[docs/PRD_SUMMARY.md](docs/PRD_SUMMARY.md)** — Product requirements synthesis.
- **[docs/EXERCISES_SPEC.md](docs/EXERCISES_SPEC.md)** — Biomechanics & exercise config reference.

---

## Privacy & Medical Disclaimer

- **Privacy**: Camera streams (`audio: false`) and MediaPipe pose inference run locally in the browser using local WASM and model files. No raw camera frames are uploaded or recorded.
- **Medical Advisory**: RehabBuddy is a rehabilitation support tool and does not diagnose, treat, or replace professional medical advice. Exercise plans must be approved by a qualified doctor or physiotherapist.
