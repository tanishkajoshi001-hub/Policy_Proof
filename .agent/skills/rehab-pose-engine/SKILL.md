---
name: rehab-pose-engine
description: >-
  Core biomechanics and computer vision engineering skill for RehabBuddy. Governs MediaPipe landmark
  indices (0–32), 3-point joint angle calculations, landmark confidence thresholds, EMA jitter smoothing,
  rep/hold finite state machines, audio queue throttling, and on-device privacy guarantees.
---

# Rehab Pose & Biomechanics Engine Skill

This skill provides the domain-specific engineering rules, algorithms, and safety constraints for RehabBuddy's on-device computer vision and exercise tracking engine.

---

## 1. MediaPipe Landmark Map (33 Keypoints)

Always use official MediaPipe Pose landmark indices. Do not guess joint index numbers:

```
Upper Extremity:
  11: LEFT_SHOULDER       12: RIGHT_SHOULDER
  13: LEFT_ELBOW          14: RIGHT_ELBOW
  15: LEFT_WRIST          16: RIGHT_WRIST

Lower Extremity & Torso:
  23: LEFT_HIP            24: RIGHT_HIP
  25: LEFT_KNEE           26: RIGHT_KNEE
  27: LEFT_ANKLE          28: RIGHT_ANKLE
```

### Landmark Validation Rule
Before computing angles, check landmark visibility:
```typescript
if (proximal.visibility < 0.65 || vertex.visibility < 0.65 || distal.visibility < 0.65) {
  // Confidence too low (occluded, bad lighting, or out of frame)
  // PAUSE rep counter and prompt user to reposition into camera view
  return null;
}
```

---

## 2. 3-Point Angle Calculation

Compute planar angles using 2D coordinates normalized to screen space:
$$\theta = \left| \operatorname{atan2}(y_{\text{distal}} - y_{\text{vertex}}, x_{\text{distal}} - x_{\text{vertex}}) - \operatorname{atan2}(y_{\text{proximal}} - y_{\text{vertex}}, x_{\text{proximal}} - x_{\text{vertex}}) \right| \times \frac{180}{\pi}$$
$$\text{If } \theta > 180^\circ \implies \theta = 360^\circ - \theta$$

### Jitter Smoothing (EMA Filter)
Raw camera landmarks jitter by $2^\circ - 6^\circ$ frame-to-frame. Apply Exponential Moving Average (EMA):
$$\theta_{\text{smoothed}}^{(t)} = 0.35 \cdot \theta^{(t)} + 0.65 \cdot \theta_{\text{smoothed}}^{(t-1)}$$

---

## 3. Repetition & Hold State Machine Rules

Never increment reps on a single frame threshold. A valid repetition requires transitioning through five deterministic states:

```
[START] -> [IN_MOTION] -> [HOLDING (if holdSeconds > 0)] -> [RETURNING] -> [COMPLETED]
```

1. **START**: User is in rest/starting angle range ($startAngle \pm tolerance$).
2. **IN_MOTION**: Joint angle leaves start range and moves monotonically toward $targetAngle$.
3. **HOLDING**: Joint angle is within $[targetAngle - tolerance, targetAngle + tolerance]$. Hold countdown timer runs. If user breaks hold before timer completes, reset timer.
4. **RETURNING**: Moving back towards $startAngle$.
5. **COMPLETED**: Joint angle returns to $startAngle \pm tolerance$. Increment `repsCompleted`, calculate rep accuracy score, and play confirmation chime.

---

## 4. Voice Coach Throttling Rules

- Use native browser `window.speechSynthesis`.
- **Hard Cooldown**: Minimum 2.5 seconds between spoken utterances.
- Never interrupt an active rep hold countdown with non-critical advice.
- When an error occurs (e.g. angle too low), play the correction once, wait for cooldown, and only repeat if form remains incorrect after 3 seconds.

---

## 5. Security & Privacy Guardrails

- **Zero Network Ingestion**: The video element is connected only to the local MediaPipe canvas/worker.
- **Mock Simulator for CI/Tests**: Provide synthetic landmark fixtures (e.g. `mockElbowFlexionFrames`) so unit tests can run headless without physical cameras.
