# RehabBuddy (`Rehab_Buddy`)

> **AI Home Rehab Coach for Fracture Recovery**  
> *A browser-based AI physiotherapy assistant that watches patients do prescribed recovery exercises through the camera, corrects form in real time, counts valid reps, and shares recovery progress with doctors.*

---

## 🚀 Mission 01: Foundation & Real-Time Pose Detection (Completed)

This repository houses the production foundation for RehabBuddy, implemented with strict medical safety, offline capability, and accessibility standards.

### ✨ Key Capabilities Delivered
1. **On-Device Computer Vision Engine**:
   - MediaPipe Tasks Vision `PoseLandmarker` running 100% in-browser via WebAssembly / WebGL.
   - **Local Model Assets**: Local `pose_landmarker_lite.task` and local WASM binaries in `public/` (zero external CDN runtime dependency).
   - **Privacy Guarantee**: Raw camera frames **never** leave the client device or get uploaded.
2. **Robust Browser Camera Lifecycle**:
   - Explicit state machine: `idle` $\rightarrow$ `requesting-permission` $\rightarrow$ `initializing` $\rightarrow$ `active` $\rightarrow$ `permission-denied` | `camera-unavailable` | `error`.
   - Explicit user-triggered permission (no unsolicited camera activations).
   - Multi-device selection & selfie mirror mode support.
   - Complete stream and animation frame teardown on unmount.
3. **Biomechanical Pose Tracking & Visualization**:
   - 33 landmarks with clinical visibility thresholds ($\ge 0.65$ confidence).
   - Tracking states: `no-person` | `partially-visible` | `low-confidence` | `tracking-stable`.
   - Real-time HTML5 Canvas 2D skeleton overlay with coordinate mapping matching aspect ratio and mirrored orientation.
   - Neutral clinical styling (Medical cyan/sky blue) — distinct from future rep evaluation colors.
4. **Accessible, Multilingual Healthcare Experience**:
   - Bilingual support: **English** and **Hindi (हिंदी)** with instant toggle.
   - Large touch targets ($\ge 48$px) tailored for elderly patients (e.g. Ramesh).
   - Clear environmental checklist (Distance, Lighting, Stability) and medical advisory notice.
   - Live performance telemetry: Real FPS and inference latency (ms).

---

## 🛠️ Tech Stack

- **Framework**: React 19 + TypeScript (Strict Mode) + Vite 6
- **Styling**: Tailwind CSS (Medical Slate / Teal Palette)
- **Icons**: Lucide React
- **Pose Detection**: `@mediapipe/tasks-vision` (WASM + GPU delegate with CPU fallback)
- **Testing**: Vitest + React Testing Library + Playwright E2E

---

## 📂 Project Architecture

```
Rehab_Buddy/
├── e2e/
│   ├── camera-pose.spec.ts         # Playwright E2E browser tests
│   └── screenshots/                # Visual verification captures (desktop & mobile)
├── public/
│   ├── models/
│   │   └── pose_landmarker_lite.task # Local 5.7MB MediaPipe model
│   └── wasm/                       # Local MediaPipe vision WASM binaries
├── src/
│   ├── app/
│   │   └── App.tsx                 # Main application shell
│   ├── components/
│   │   ├── layout/Header.tsx       # Brand & language switcher
│   │   └── ui/
│   │       ├── SetupChecklist.tsx  # Distance, lighting & stability guide
│   │       ├── PrivacyBanner.tsx   # On-device privacy guarantee
│   │       └── ErrorAlert.tsx      # Permission & hardware error handling
│   ├── features/
│   │   ├── camera/
│   │   │   ├── components/CameraControls.tsx # Start/Stop, camera switch, mirror
│   │   │   ├── hooks/useCamera.ts  # Explicit state hook
│   │   │   └── services/cameraService.ts     # MediaStream lifecycle
│   │   └── pose/
│   │       ├── components/PoseCameraView.tsx # Video + Canvas RAF loop
│   │       ├── services/poseService.ts       # MediaPipe inference & joint checks
│   │       └── utils/skeletonDrawer.ts       # 2D Canvas rendering
│   ├── locales/
│   │   ├── en.ts                   # English translations
│   │   └── hi.ts                   # Hindi translations (Devanagari)
│   ├── test/                       # Vitest unit test suites
│   ├── types/                      # TypeScript schemas (camera, pose, i18n)
│   └── main.tsx
├── package.json
├── playwright.config.ts
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## ⚡ Quickstart & Development

### 1. Installation
```powershell
npm install
```

### 2. Run Development Server
```powershell
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Run Unit Tests (Vitest)
```powershell
npm run test
```

### 4. Run Playwright E2E Browser Tests
```powershell
npm run test:e2e
```

### 5. Production Build
```powershell
npm run build
```
Build outputs are written to `dist/`. To preview the production bundle:
```powershell
npm run preview
```

---

## 🛡️ Medical Safety & Privacy Notice
- **Privacy**: All video inference is performed 100% on the local device. No video frames, images, or audio are ever recorded or transmitted over the network.
- **Clinical Advisory**: RehabBuddy is an assistive rehabilitation aid and does not provide autonomous clinical diagnoses. All rehabilitation programs must be prescribed and monitored by a licensed medical practitioner.
