# AI Agent Development Handbook: RehabBuddy

Welcome to **RehabBuddy** (`Rehab_Buddy`). This document is the primary operating manual and architectural specification for AI agents (and human contributors) developing, testing, and maintaining this codebase.

---

## 1. Project Mission & Identity

- **What is RehabBuddy?** An offline-first, client-side, browser-based AI physical rehabilitation coach specifically tailored for post-fracture recovery.
- **The Core Problem**: In developing and rural areas, patients recovering from bone fractures lack access to physical therapists, perform exercises with incorrect biomechanical form, or stop prematurely due to unmonitored pain.
- **The Solution**: Real-time pose tracking via a basic smartphone or laptop camera using **MediaPipe Pose** in the browser. It guides the patient with vernacular voice instructions (English, Hindi, Kannada), visual green/red skeleton overlays, counts valid repetitions and hold times, monitors pain thresholds, and securely syncs telemetry to a doctor's dashboard.

---

## 2. Fast Navigation & Documentation Index

For deep dives into specific subsystems, read the corresponding document:
- 📄 [PRD Summary](file:///c:/rehab-buddy/Rehab_Buddy/docs/PRD_SUMMARY.md) — Product requirements, personas, functional specs (FR1–FR9), and NFRs.
- 🏗️ [System Architecture](file:///c:/rehab-buddy/Rehab_Buddy/docs/ARCHITECTURE.md) — Client-side pipeline, state machines, offline storage, and cloud sync.
- 📐 [Exercise Specifications](file:///c:/rehab-buddy/Rehab_Buddy/docs/EXERCISES_SPEC.md) — MediaPipe landmark indices (0–32), angle math, exercise configs, and multilingual audio matrices.
- 🗺️ [Hackathon Roadmap](file:///c:/rehab-buddy/Rehab_Buddy/docs/ROADMAP.md) — 48-hour phased milestone breakdown and task checklist.

---

## 3. Non-Negotiable Engineering Rules & Guardrails

When generating or modifying code in this repository, you **MUST** uphold these five core guardrails:

> [!CAUTION]
> **RULE 1: PRIVACY — ZERO VIDEO STREAMING OR STORAGE**  
> Raw camera video frames or images MUST NEVER leave the client browser. No backend streaming, no saving raw frames to databases. All MediaPipe Pose inference happens locally in WebAssembly/WebGL. Only mathematical values (angles, reps, accuracy %, pain scores) are persisted.

> [!IMPORTANT]
> **RULE 2: CLINICAL SAFETY & PAIN STOP GATE**  
> Every exercise session requires a pre-session and post-session 0–10 Visual Analog Scale (VAS) pain rating. If pain is $\ge 7$ or spikes dangerously, the session MUST be halted immediately with a safety modal advising the patient to rest and contact their doctor. Include the medical disclaimer on all patient-facing screens: *"RehabBuddy is an assistive guide, not a substitute for professional medical care."*

> [!TIP]
> **RULE 3: DECLARATIVE EXERCISE CONFIGURATION**  
> Never hardcode exercise angle rules, thresholds, or hold timers inside React UI components. All exercises must be loaded from declarative JSON/TypeScript configurations adhering to the schema in [EXERCISES_SPEC.md](file:///c:/rehab-buddy/Rehab_Buddy/docs/EXERCISES_SPEC.md).

> [!TIP]
> **RULE 4: SPEECH SYNTHESIS THROTTLING**  
> Do not trigger `window.speechSynthesis.speak()` on every video frame. Speech cues must be debounced/throttled through a state-aware audio queue (minimum cooldown: 2.5 seconds between spoken cues) to prevent overlapping audio chaos.

> [!NOTE]
> **RULE 5: ACCESSIBILITY & LOW-LITERACY DESIGN**  
> Target user Ramesh is 58, speaks Hindi/Kannada, and uses a budget smartphone. Prioritize:
> - Giant touch targets ($\ge 48$px).
> - High-contrast indicators (Vibrant Green `#22C55E` for good form, Bright Red `#EF4444` for incorrect form).
> - Voice-first cues for all critical state changes.

---

## 4. Recommended Directory Structure

When implementing the application codebase, adopt this clean modular architecture:

```
Rehab_Buddy/
├── docs/                             # Deep technical specifications
│   ├── ARCHITECTURE.md
│   ├── EXERCISES_SPEC.md
│   ├── PRD_SUMMARY.md
│   └── ROADMAP.md
├── src/
│   ├── assets/                       # Audio chimes (ding.mp3), logos, animations
│   ├── components/
│   │   ├── camera/
│   │   │   ├── CameraFeed.tsx        # Video element + MediaPipe camera controller
│   │   │   └── SkeletonCanvas.tsx    # 2D Canvas rendering skeleton & angles
│   │   ├── exercise/
│   │   │   ├── ExerciseCard.tsx      # Exercise selection card
│   │   │   ├── RepCounterHUD.tsx     # Large rep & hold timer overlay
│   │   │   └── FormFeedbackBanner.tsx# Real-time corrective text banner
│   │   ├── safety/
│   │   │   ├── PainRatingModal.tsx   # 0-10 slider / visual face scale
│   │   │   └── MedicalDisclaimer.tsx # Standard clinical disclaimer
│   │   ├── dashboard/
│   │   │   ├── PatientProgress.tsx   # Reps, streak, accuracy charts
│   │   │   └── DoctorPortal.tsx      # Clinician view & prescription editor
│   │   └── common/
│   │       ├── LanguageSelector.tsx  # EN / HI / KN language toggle
│   │       └── Navbar.tsx
│   ├── config/
│   │   ├── exercises.ts              # Declarative exercise configs (Elbow, Shoulder, Knee)
│   │   └── i18n.ts                   # Multilingual text & speech strings
│   ├── engines/
│   │   ├── angleCalculator.ts        # 3-point angle math & EMA smoothing
│   │   ├── repStateMachine.ts        # Finite state machine (Idle->Start->Peak->Return)
│   │   └── voiceCoach.ts             # Web Speech API wrapper with queue & throttle
│   ├── hooks/
│   │   ├── useCamera.ts              # Webcam initialization & resolution handling
│   │   ├── usePoseDetection.ts       # MediaPipe Pose hook
│   │   └── useExerciseSession.ts     # Orchestrates engine, reps, and state
│   ├── services/
│   │   ├── storageService.ts         # IndexedDB / LocalStorage persistence
│   │   └── syncService.ts            # Supabase / Firebase offline sync
│   ├── types/
│   │   ├── exercise.ts               # ExerciseConfig, JointTriplet, etc.
│   │   ├── pose.ts                   # Landmark, AngleResult, SkeletonState
│   │   └── session.ts                # SessionRecord, RepLog, PainScore
│   ├── App.tsx                       # Main router & state provider
│   ├── index.css                     # Tailwind CSS imports
│   └── main.tsx
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── AGENT.md                          # This handbook
```

---

## 5. Core Mathematical & Algorithmic Patterns

### 5.1 3-Point Planar Angle Calculation
Always use `Math.atan2` on 2D coordinates normalized to screen aspect ratio:

```typescript
export interface Point2D {
  x: number;
  y: number;
  visibility?: number;
}

export function calculateJointAngle(
  proximal: Point2D,
  vertex: Point2D,
  distal: Point2D
): number {
  const radians =
    Math.atan2(distal.y - vertex.y, distal.x - vertex.x) -
    Math.atan2(proximal.y - vertex.y, proximal.x - vertex.x);

  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) {
    angle = 360.0 - angle;
  }
  return Math.round(angle);
}
```

### 5.2 Exponential Moving Average (Jitter Reduction)
```typescript
export class AngleSmoother {
  private prevAngle: number | null = null;
  private alpha: number;

  constructor(alpha: number = 0.35) {
    this.alpha = alpha;
  }

  smooth(currentAngle: number): number {
    if (this.prevAngle === null) {
      this.prevAngle = currentAngle;
      return currentAngle;
    }
    const smoothed = this.alpha * currentAngle + (1 - this.alpha) * this.prevAngle;
    this.prevAngle = smoothed;
    return Math.round(smoothed);
  }

  reset(): void {
    this.prevAngle = null;
  }
}
```

### 5.3 Repetition State Machine
```typescript
export type ExerciseState = 
  | 'ALIGNMENT'     // Waiting for user to be visible in frame
  | 'START'         // In starting position
  | 'IN_MOTION'     // Moving towards target angle
  | 'HOLDING'       // At target angle, countdown active
  | 'RETURNING'     // Moving back to start
  | 'COMPLETED';    // Rep incremented

export interface StateMachineResult {
  state: ExerciseState;
  repCount: number;
  holdTimeRemaining: number;
  isFormCorrect: boolean;
  feedbackMessage: string;
}
```

---

## 6. How to Verify & Test (For AI Agents)

Since AI agents cannot look through a physical webcam, use these strategies to test and verify your code:

1. **Synthetic Landmark Simulator**:
   - Create a test fixture (`tests/fixtures/mockPoses.ts`) that feeds synthetic landmark arrays into `angleCalculator.ts` and `repStateMachine.ts`.
   - Verify that progressing from $160^\circ \rightarrow 60^\circ \rightarrow \text{hold } 3s \rightarrow 160^\circ$ increments `repCount` from `0` to `1`.
2. **Offline Data Persistence Test**:
   - Verify that sessions saved while `navigator.onLine === false` are retrieved properly from `storageService` and flagged `synced: false`.
3. **Safety Gate Unit Test**:
   - Verify that initializing a session with `painScore = 8` immediately triggers the abort callback and does not start pose detection.

---

## 7. Current Project Status & Immediate Next Step

- [x] PRD reviewed and codified into specs.
- [x] Architecture, Exercise definitions, and Roadmap documents created.
- [ ] **Next Immediate Task**: Initialize the React + Vite + TypeScript application in `Rehab_Buddy/` and install MediaPipe dependencies.
