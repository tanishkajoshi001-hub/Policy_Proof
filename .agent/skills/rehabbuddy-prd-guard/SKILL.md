---
name: rehabbuddy-prd-guard
description: >-
  Guardrail and validation skill for RehabBuddy development. Ensures strict adherence to the PRD,
  verifies that all nine MVP features (F1–F9) are implemented and preserved, prevents scope creep,
  and executes pre-completion acceptance checks before declaring any development task complete.
---

# RehabBuddy PRD Guard Skill

This skill enforces strict adherence to the **AI Home Rehab Coach for Fracture Recovery (RehabBuddy)** PRD. Any AI agent or developer implementing features must consult and satisfy this skill before declaring work complete.

---

## 1. The 9 MVP Features (F1–F9) Mandate

Every feature must align directly with the PRD requirements. Never omit or alter their clinical purpose:

| ID | Feature Name | Core Requirement | Acceptance Criteria |
|:---:|:---|:---|:---|
| **F1** | Camera Pose Detection | In-browser MediaPipe Pose | Video processed 100% on-device at $\ge 15$ FPS. Zero server video upload. |
| **F2** | Config-Driven Exercise Library | 2–3 exercises for fracture recovery | Loaded from declarative JSON (startAngle, targetAngle, tolerance, holdSeconds, repGoal). |
| **F3** | Biomechanical Posture Check | Real-time joint angle calculation | Calculated via 3-point vector trigonometry (`atan2`) with confidence $> 0.65$. |
| **F4** | Instant Live Feedback | Green/Red skeleton overlay | Canvas skeleton turns Green (valid form) or Red (deviation) with corrective text cue within 1s. |
| **F5** | Multilingual Voice Guidance | Spoken cues via Web Speech API | English (`en-IN`) + at least 1 Indian language (Hindi `hi-IN` or Kannada `kn-IN`). Throttled (min 2.5s cooldown). |
| **F6** | Rep Counter & Hold Timer | Finite State Machine | Reps increment ONLY upon full ROM cycle (Start $\rightarrow$ Target $\rightarrow$ Hold $\rightarrow$ Return). No single-frame jumps. |
| **F7** | Pain Safety Gate | 0–10 Visual Analog Scale (VAS) | Evaluated before and after session. Pain $\ge 7$ immediately aborts exercise and flags clinician. |
| **F8** | Patient Progress Screen | Local session telemetry | Displays reps, accuracy percentage, pain trend curve across days. Offline-first persistence. |
| **F9** | Doctor Management Portal | Clinician dashboard | Doctor can view patient compliance/accuracy/pain logs and assign/modify target ROM angles. |

---

## 2. Scope Creep & Non-Goals Policy

AI agents MUST REJECT or defer the following out-of-scope requests during MVP development:
- ❌ **Autonomous Medical Diagnosis**: The app never diagnoses fractures or decides if an exercise is safe without a doctor's plan.
- ❌ **Replacing Clinicians**: Prominent disclaimer required: *"RehabBuddy is an assistive tool, not a substitute for professional medical care."*
- ❌ **Complex Integrations**: No hospital EHR/HL7 integrations, video call streaming servers, or payment gateways in hackathon MVP.
- ❌ **Cloud Video Processing**: Never propose sending video to a backend API (Whisper, Gemini video upload, custom backend CV).

---

## 3. Pre-Completion PRD Checklist

Before concluding any feature or turn, run through this verification checklist:
1. [ ] **Privacy**: Are raw camera frames kept strictly in client memory/canvas?
2. [ ] **Safety**: Is the 0–10 pain gate functional and cannot be bypassed?
3. [ ] **Accessibility**: Are touch targets $\ge 48$px with high contrast for elderly users (e.g. Ramesh)?
4. [ ] **Biomechanical Validity**: Are rep counts governed by the state machine rather than instantaneous thresholds?
5. [ ] **Offline Resilience**: Does the session work and save even if internet disconnects?
