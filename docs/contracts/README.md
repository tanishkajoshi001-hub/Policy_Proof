# Shared Contracts Reference (`src/shared/contracts/`)

> **Current Status**: `v0.1.0-provisional`  
> **Canonical Barrel**: `src/shared/contracts/index.ts`

---

## 1. Contract Files & Authoritative Owners

| File | Primary Types | Authoritative Owner |
|:---|:---|:---|
| `src/shared/contracts/app.ts` | `APP_ROUTES`, `IsoTimestamp`, `AppEvent`, `SupportedLanguage`, ID aliases | Shared across all modules (Startup seeded) |
| `src/shared/contracts/motion.ts` | `TrackingStatus`, `FormStatus`, `MovementPhase`, `ExerciseId`, `ExerciseDefinition`, `TrackingSnapshot`, `TrackingSessionResult`, `RehabTrackingController` | **Person 3** (`feature/motion-engine`) |
| `src/shared/contracts/patient.ts` | `PainRating`, `PatientPlan`, `PatientSessionRecord`, `PatientDataPort` | **Person 4** (`feature/patient-experience`) |
| `src/shared/contracts/doctor.ts` | `DoctorPatientSummaryDTO`, `DoctorPlanUpdateDTO`, `DoctorDataPort` | **Person 2** (`feature/backend-doctor-release`) |

> **Port vs. Adapter Rule**: `PatientDataPort` is owned as an interface by **Person 4**. Production Supabase adapters implementing `PatientDataPort` and `DoctorDataPort` are owned by **Person 2** inside `src/shared/adapters/`.

---

## 2. Field, Unit & Nullability Conventions

- **Timestamps**: Always ISO-8601 UTC strings (`IsoTimestamp`, e.g. `"2026-11-26T00:50:00.000Z"`).
- **Joint Angles**: Degrees (`0–180`), suffixed with `Deg` (e.g. `startAngleDeg`, `targetAngleDeg`, `toleranceDeg`, `primaryAngleDeg`).
- **Durations**: Seconds (`holdSeconds`, `holdElapsedSeconds`).
- **Scores & Accuracy**:
  - `confidenceScore`: normalized `0–1`, or `null` when unavailable.
  - `accuracyPercent`: `0–100`, or `null` when no reps were evaluated.
  - `PainRating`: `0–10` VAS integer, or `null` when not yet captured.
- **No Duplicate Definitions**: Modules must import shared concepts from `src/shared/contracts` instead of redefining `TrackingSnapshot`, `ExerciseDefinition`, or `PatientSessionRecord`.

---

## 3. Provisional Status & Contract-Change Process

All `v0.1` contracts are **provisional** until **Person 3** and **Person 4** validate their module's interfaces during middle-stage implementation:

1. **Before modifying a contract**: Check who owns the file (table above).
2. **Non-breaking additive validation**: Owner updates their contract file in `src/shared/contracts/` and increments JSDoc version note.
3. **Breaking cross-module change**: Open a small contract-change note in the PR description tagging the consuming module owner (`Person 3`, `Person 4`, or `Person 2`) before merging.
4. **Contract Freeze**: **Person 2** freezes the final `v1.0` contracts during final integration (`feature/backend-doctor-release`).
