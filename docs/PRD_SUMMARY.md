# PRD Summary: AI Home Rehab Coach for Fracture Recovery (RehabBuddy)

> **Source**: `PRD AI Home Rehab Coach for Fracture Recovery.pdf` (Version 1.0 Draft - Hackathon Edition)  
> **Status**: Approved for Hackathon Implementation  

---

## 1. Executive Summary & Vision
- **Product Name**: RehabBuddy (`Rehab_Buddy`)
- **One-Line Summary**: A browser-based AI physiotherapist that monitors patients performing prescribed fracture recovery exercises via a smartphone or laptop camera, verifies posture and joint angle ranges in real time, counts valid repetitions and hold durations, and reports compliance and recovery trajectory to treating clinicians.
- **Vision**: Democratize post-fracture physical rehabilitation. Enable any patient—from rural villages with low bandwidth and low literacy to urban professionals unable to commute—to perform safe, guided, verified recovery protocols at home.

---

## 2. Problem Statement
Following orthopedic fracture reduction, casting, or surgical fixation, structured physical therapy is required to restore range of motion (ROM), muscular strength, and joint articulation. In practice:
1. **Scarcity & Geography**: Physiotherapists are expensive, geographically distant, or unavailable in rural and tier-2/3 regions.
2. **Poor Compliance & Incorrect Form**: Patients forget movement paths, execute compensatory/abnormal motions that hinder recovery, or cease therapy prematurely.
3. **Severe Clinical Complications**: Mal-exercise or omitted rehabilitation results in arthrofibrosis (joint stiffness), tendon shortening, muscle atrophy, or permanent functional deficit.
4. **Clinical Blind Spot**: Orthopedic doctors and physical therapists have zero visibility into whether patients perform their home exercises, do them properly, or exceed safe thresholds.

---

## 3. Scope & Personas

### 3.1 Target Personas
- **Primary Persona (Ramesh, 58, Rural Farmer)**: Recovering from distal radius / forearm fracture. Clinic is 40 km away. Uses budget Android smartphone on 2G/3G or patchy Wi-Fi. Needs vernacular voice guidance (Hindi/Kannada), minimal text, high-contrast visual indicators (Green/Red skeleton), and zero complicated setup.
- **Secondary Persona (Anita, 34, Urban Professional)**: Fractured ankle. Limited time for frequent physical therapy visits. Desires high autonomy, structured daily workouts, and remote oversight by her orthopedic doctor.
- **Clinical Persona (Dr. / PT)**: Orthopedic surgeon or physiotherapist who prescribes specific exercise regimens, sets target ROM angles/tolerances, and monitors patient adherence and pain scores.
- **Caregiver / ASHA Worker**: Community health worker or family member helping set up camera distance and encouraging compliance.

### 3.2 Goals (Hackathon MVP Scope)
1. **Real-time On-device Pose Detection**: MediaPipe Pose in-browser (runs on mid-range Android phone or laptop at $\ge 15$ FPS).
2. **Exercise Guidance & Form Verification**: Compare detected joint angles against target range of motion (ROM) in real time.
3. **Instant Audio-Visual Feedback**: Skeleton turns green (correct) or red (incorrect/compensatory); real-time corrective cues; voice feedback in English + at least 1 Indian regional language (Hindi / Kannada).
4. **Automated Rep & Hold Counting**: Finite state machine detecting starting position $\rightarrow$ inflection/target angle $\rightarrow$ sustained hold $\rightarrow$ return to start.
5. **Pain & Safety Gate**: 0–10 Visual Analog Scale (VAS) pain evaluation pre- and post-session; immediate cutoff and doctor warning if pain is high.
6. **Patient & Doctor Progress Views**:
   - Patient: Daily reps, accuracy percentage, pain tracking.
   - Doctor: Dashboard showing patient compliance, accuracy trends, pain logs, and ability to assign/modify exercise plans.

### 3.3 Non-Goals (Out of Scope for MVP)
- Automatic fracture diagnosis or autonomous prescription without doctor involvement.
- Replacing licensed medical professionals.
- Full electronic health record (EHR) / hospital management system integration.
- Telemedicine video streaming calls or payment gateways.
- Formal medical device regulatory certification (e.g., FDA/CDSCO).

---

## 4. Key Functional Requirements (FR)

| ID | Requirement | Technical Implementation Notes |
|:---|:---|:---|
| **FR1** | Joint Detection | Track shoulder, elbow, wrist, hip, knee, ankle keypoints via camera feed. |
| **FR2** | Real-Time Performance | Process pose at $\ge 15$ FPS on mid-tier mobile browsers or laptops. |
| **FR3** | Dynamic Exercise Config | Exercises defined via declarative JSON configuration (joints, startAngle, targetAngle, tolerance, holdSeconds, repGoal) without code changes. |
| **FR4** | Validated Rep Counting | Rep increments only upon reaching target angle within tolerance, holding if required, and returning to starting angle without bad form. |
| **FR5** | Sub-second Feedback | Provide audio/visual corrective cues within 1 second of posture deviation. |
| **FR6** | Multilingual Voice & UI | Support English and at least one Indian language (Hindi `hi-IN` or Kannada `kn-IN`) via Web Speech API (`SpeechSynthesis`). |
| **FR7** | Pain Gate & Safety Stop | Pre/post-session pain assessment (0–10). If pain exceeds safety threshold ($\ge 7$), abort session and notify clinician. |
| **FR8** | Session Analytics | Persist reps, accuracy %, duration, pain scores, timestamp. |
| **FR9** | Doctor Management Portal | Portal to review patient progress, adjust ROM goals, and customize assigned routines. |

---

## 5. Non-Functional Requirements (NFR)

1. **Privacy & Security**:
   - **Zero Video Upload**: Raw camera frames NEVER leave the client device.
   - Only calculated mathematical values (joint angles, rep counts, accuracy scores, pain ratings) are synced.
2. **Offline Resilience**:
   - Pose detection, angle calculation, speech synthesis, and local logging function 100% offline.
   - Results cache in `localStorage` / `IndexedDB` and sync to cloud backend when internet is restored.
3. **Accessibility**:
   - High-contrast visual overlays, large touch targets, minimal textual density for low-literacy users.
   - Loud, clear auditory guidance for patients exercising at a distance from the screen.
4. **Clinical Safety Disclaimer**:
   - Prominent disclaimer on all entry points stating RehabBuddy is an assistive guidance aid and not a diagnostic or therapeutic medical device.

---

## 6. Technical Stack Summary

| Domain | Technology Choice | Rationale |
|:---|:---|:---|
| **Frontend Framework** | React (Vite) + Tailwind CSS + Lucide Icons | Lightweight, responsive, mobile-first, rapid hackathon velocity. |
| **Computer Vision / Pose** | MediaPipe Pose (JavaScript / WASM) | 100% on-device client-side inference, zero server GPU cost, low latency. |
| **Biomechanical Math** | Custom Vector Trigonometry (`Math.atan2`) | 3-point planar joint angle calculation with temporal smoothing. |
| **Audio Guidance** | Web Speech API (`SpeechSynthesisUtterance`) | Native browser support, zero external paid TTS API latency or cost. |
| **Charts & Analytics** | Chart.js or Recharts | Clean visual progress tracking for compliance and accuracy trends. |
| **Storage & Sync** | IndexedDB / LocalStorage + Supabase or Firebase | Offline-first with seamless cloud synchronization for doctor view. |
| **Deployment** | Vercel, Netlify, or GitHub Pages | Instant static hosting with HTTPS (required for camera access). |
