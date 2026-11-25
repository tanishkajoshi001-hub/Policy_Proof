/**
 * @fileoverview Canonical Patient Application Contracts (Provisional v0.1).
 * @version 0.1.0-provisional
 * @owner Person 4 (feature/patient-experience) — Authoritative for validation and finalization.
 *
 * Notes:
 * - Person 4 owns PatientDataPort as a domain port interface.
 * - Person 2 implements the production Supabase adapter behind PatientDataPort.
 */

import type { DoctorId, IsoTimestamp, PatientId, PlanId, SessionId } from './app';
import type { ExerciseId } from './motion';

/** Visual Analog Scale (VAS) pain rating from 0 (no pain) to 10 (worst pain). */
export type PainRating = number;

/** Prescribed exercise entry inside a patient's care plan. */
export interface PrescribedExerciseItem {
  exerciseId: ExerciseId;
  customRepGoal?: number;
  customHoldSeconds?: number;
}

/** Doctor-assigned exercise plan consumed by the patient experience. */
export interface PatientPlan {
  planId: PlanId;
  patientId: PatientId;
  doctorId: DoctorId | null;
  assignedAt: IsoTimestamp;
  exercises: PrescribedExerciseItem[];
}

/** Local or synced record of a completed/aborted rehabilitation session. */
export interface PatientSessionRecord {
  sessionId: SessionId;
  patientId: PatientId;
  exerciseId: ExerciseId;
  startedAt: IsoTimestamp;
  endedAt: IsoTimestamp;
  /** Pre-session pain rating (0–10), null if not yet captured. */
  prePainRating: PainRating | null;
  /** Post-session pain rating (0–10), null if session aborted before completion. */
  postPainRating: PainRating | null;
  repsCompleted: number;
  repsTarget: number;
  /** Posture accuracy percentage (0–100), or null if no valid reps were recorded. */
  accuracyPercent: number | null;
  abortedDueToPain: boolean;
  syncStatus: 'local-only' | 'pending' | 'synced';
}

/**
 * Domain data port owned by Person 4.
 * Person 4 may build an offline/mock local implementation; Person 2 provides the Supabase adapter.
 */
export interface PatientDataPort {
  getAssignedPlan(patientId: PatientId): Promise<PatientPlan | null>;
  saveSession(record: PatientSessionRecord): Promise<void>;
  listSessions(patientId: PatientId): Promise<PatientSessionRecord[]>;
}
