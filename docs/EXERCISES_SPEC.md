# Exercise Specifications & Biomechanics Engine Reference

This document defines the declarative configuration schema, landmark mappings, mathematical models, and multilingual feedback templates for RehabBuddy exercises.

---

## 1. MediaPipe Pose Landmark Indices

RehabBuddy relies on MediaPipe Pose (33 3D body keypoints). The critical landmarks used in post-fracture rehabilitation are:

| Index | Landmark Name | Anatomical Region | Typical Exercises |
|:---:|:---|:---|:---|
| **11** | `LEFT_SHOULDER` | Upper Extremity | Arm raise, elbow bend, shoulder abduction |
| **12** | `RIGHT_SHOULDER` | Upper Extremity | Arm raise, elbow bend, shoulder abduction |
| **13** | `LEFT_ELBOW` | Upper Extremity | Elbow flexion/extension, pronation/supination |
| **14** | `RIGHT_ELBOW` | Upper Extremity | Elbow flexion/extension, pronation/supination |
| **15** | `LEFT_WRIST` | Upper Extremity | Wrist flexion, elbow bend |
| **16** | `RIGHT_WRIST` | Upper Extremity | Wrist flexion, elbow bend |
| **23** | `LEFT_HIP` | Lower Extremity / Torso | Knee extension, hip abduction, squat |
| **24** | `RIGHT_HIP` | Lower Extremity / Torso | Knee extension, hip abduction, squat |
| **25** | `LEFT_KNEE` | Lower Extremity | Knee extension/flexion, leg raises |
| **26** | `RIGHT_KNEE` | Lower Extremity | Knee extension/flexion, leg raises |
| **27** | `LEFT_ANKLE` | Lower Extremity | Knee extension, ankle dorsiflexion |
| **28** | `RIGHT_ANKLE` | Lower Extremity | Knee extension, ankle dorsiflexion |

> [!IMPORTANT]
> All landmarks carry `{ x, y, z, visibility }`. If the `visibility` score of any primary joint drops below **0.65**, the posture evaluation must pause and prompt the user to reposition into camera view.

---

## 2. Declarative Exercise Schema (JSON)

Every exercise in RehabBuddy is defined via a standalone JSON configuration:

```typescript
export interface ExerciseConfig {
  id: string;
  name: string;
  targetRegion: "elbow" | "shoulder" | "knee" | "ankle" | "wrist";
  fractureContext: string;
  description: {
    en: string;
    hi: string;
    kn: string;
  };
  cameraSetupTips: {
    en: string;
    hi: string;
    kn: string;
  };
  side: "left" | "right" | "bilateral" | "auto";
  primaryJoint: {
    name: string;
    vertex: number;      // Middle joint (e.g., Elbow = 13)
    proximal: number;    // Joint closer to body (e.g., Shoulder = 11)
    distal: number;      // Joint farther from body (e.g., Wrist = 15)
  };
  secondaryConstraints?: Array<{
    name: string;
    vertex: number;
    proximal: number;
    distal: number;
    allowedRange: [number, number]; // e.g. shoulder must stay stable
    violationMessage: {
      en: string;
      hi: string;
      kn: string;
    };
  }>;
  startAngle: number;       // Degree at rest / starting position
  targetAngle: number;      // Target degrees at full flexion/extension
  tolerance: number;        // Allowed deviation in degrees (e.g. ±12°)
  holdSeconds: number;      // Duration to sustain inflection angle
  defaultRepGoal: number;   // Default target reps
  tempoSeconds: {
    concentric: number;     // Moving toward target
    hold: number;
    eccentric: number;      // Returning to start
  };
  voiceCues: {
    en: VoiceCueDictionary;
    hi: VoiceCueDictionary;
    kn: VoiceCueDictionary;
  };
}

export interface VoiceCueDictionary {
  readyPrompt: string;
  startPrompt: string;
  movingToward: string;
  holdCounting: string;
  repCompleted: string;
  formCorrectionTooLow: string;
  formCorrectionTooHigh: string;
  postureBad: string;
  sessionDone: string;
}
```

---

## 3. MVP Exercise Definitions

### Exercise 1: Elbow Flexion & Extension
- **Target Recovery**: Distal humerus, radial head, olecranon fractures (forearm & elbow rehab).
- **Primary Joint Triplet**: `[SHOULDER (11/12), ELBOW (13/14), WRIST (15/16)]`
- **Biomechanical Angles**:
  - `startAngle`: $160^\circ$ (arm extended naturally downwards)
  - `targetAngle`: $55^\circ$ (hand brought up towards shoulder)
  - `tolerance`: $\pm 10^\circ$
  - `holdSeconds`: 2 seconds
  - `repGoal`: 10 reps
- **Secondary Constraint**: Torso posture must remain upright; upper arm should remain relatively vertical.

### Exercise 2: Shoulder Forward Flexion / Arm Raise
- **Target Recovery**: Clavicle, proximal humerus fractures, rotator cuff / shoulder stiffness.
- **Primary Joint Triplet**: `[HIP (23/24), SHOULDER (11/12), ELBOW (13/14)]`
- **Biomechanical Angles**:
  - `startAngle`: $25^\circ$ (arm hanging at side)
  - `targetAngle`: $90^\circ$ (arm raised horizontally to shoulder height) or $135^\circ$ depending on prescription
  - `tolerance`: $\pm 12^\circ$
  - `holdSeconds`: 3 seconds
  - `repGoal`: 8 reps
- **Secondary Constraint**: Elbow should remain extended ($160^\circ - 180^\circ$) without bending during the raise.

### Exercise 3: Seated Knee Extension (Quadriceps Rehab)
- **Target Recovery**: Patella, distal femur, tibial plateau fractures.
- **Primary Joint Triplet**: `[HIP (23/24), KNEE (25/26), ANKLE (27/28)]`
- **Biomechanical Angles**:
  - `startAngle`: $90^\circ$ (sitting upright on a chair, feet on ground)
  - `targetAngle`: $170^\circ$ (leg kicked out straight horizontally)
  - `tolerance`: $\pm 10^\circ$
  - `holdSeconds`: 3 seconds
  - `repGoal`: 10 reps
- **Secondary Constraint**: Hip should remain seated; trunk should not lean backward past $30^\circ$.

---

## 4. Multilingual Feedback Matrix

| Trigger / Event | English (`en-IN` / `en-US`) | Hindi (`hi-IN`) | Kannada (`kn-IN`) |
|:---|:---|:---|:---|
| **Alignment Ready** | "You are in position. Let us begin." | "आप सही स्थान पर हैं। चलिए शुरू करते हैं।" | "ನೀವು ಸರಿಯಾದ ಜಾಗದಲ್ಲಿದ್ದೀರಿ. ಪ್ರಾರಂಭಿಸೋಣ." |
| **Move Towards Target** | "Slowly bend your arm." | "धीरे-धीरे अपना हाथ मोड़ें।" | "ನಿಧಾನವಾಗಿ ನಿಮ್ಮ ಕೈಯನ್ನು ಮಡಚಿ." |
| **Target Reached (Hold)** | "Hold it right there. Three, two, one..." | "यहीं रुकें। तीन, दो, एक..." | "ಅಲ್ಲೇ ಹಿಡಿದುಕೊಳ್ಳಿ. ಮೂರು, ಎರಡು, ಒಂದು..." |
| **Form Error (Insufficient ROM)**| "Lift a little higher if you can." | "हो सके तो थोड़ा और ऊपर उठाएं।" | "ಸಾಧ್ಯವಾದರೆ ಸ್ವಲ್ಪ ಮೇಲಕ್ಕೆತ್ತಿ." |
| **Form Error (Too Far/Fast)** | "Slow down, do not force the movement."| "धीमे करें, ज़ोर न लगाएं।" | "ನಿಧಾನವಾಗಿ ಮಾಡಿ, ಬಲವಂತ ಮಾಡಬೇಡಿ." |
| **Rep Counted** | "Good! That is rep {n}." | "शाबाश! {n} बार पूरा हुआ।" | "ಉತ್ತಮ! {n} ನೇ ಬಾರಿ ಮುಗಿಯಿತು." |
| **Session Completed** | "Session complete! Great job today." | "सत्र पूरा हुआ! बहुत बढ़िया काम।" | "ಅಭ್ಯಾಸ ಮುಕ್ತಾಯವಾಯಿತು! ಧನ್ಯವಾದಗಳು." |
| **High Pain Warning** | "High pain detected. Please stop and rest." | "अधिक दर्द दर्ज हुआ। कृपया रुकें और आराम करें।" | "ಹೆಚ್ಚು ನೋವು ಕಂಡುಬಂದಿದೆ. ದಯವಿಟ್ಟು ನಿಲ್ಲಿಸಿ ವಿಶ್ರಾಂತಿ ಪಡೆಯಿರಿ." |

---

## 5. Angle Smoothing & Mirroring Rules

1. **Mirroring**: User-facing webcams must be mirrored (`transform: scaleX(-1)`) on the UI video element for natural proprioception. However, when mapping left vs. right landmarks, maintain consistent anatomical orientation.
2. **Camera Distance Check**:
   - For upper body exercises (elbow, shoulder): Distance between shoulders in normalized coordinates should be between $0.18$ and $0.45$.
   - For lower body exercises (knee, ankle): Full body including hip, knee, and ankle must be visible with confidence $> 0.65$.
