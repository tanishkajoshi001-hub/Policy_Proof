/**
 * @fileoverview Canonical Doctor & Backend Workspace Contracts (Provisional v0.1).
 * @version 0.1.0-provisional
 * @owner Person 2 (feature/backend-doctor-release) — Authoritative for validation and finalization.
 */

import type { DoctorId, IsoTimestamp, PatientId } from './app';
import type { PatientPlan, PatientSessionRecord } from './patient';

/** Provisional summary DTO for clinician patient roster views (owned by Person 2). */
export interface DoctorPatientSummaryDTO {
  patientId: PatientId;
  displayName: string;
  assignedPlanId: string | null;
  lastSessionAt: IsoTimestamp | null;
  adherencePercent: number | null;
  latestPainRating: number | null;
}

/** Provisional DTO for assigning or modifying a patient's exercise plan (owned by Person 2). */
export interface DoctorPlanUpdateDTO {
  patientId: PatientId;
  doctorId: DoctorId;
  plan: PatientPlan;
  updatedAt: IsoTimestamp;
}

/**
 * Clinician backend data port owned by Person 2.
 * Implemented using Supabase + Row-Level Security in the final 20% stage.
 */
export interface DoctorDataPort {
  listPatients(doctorId: DoctorId): Promise<DoctorPatientSummaryDTO[]>;
  getPatientSessions(patientId: PatientId): Promise<PatientSessionRecord[]>;
  savePatientPlan(update: DoctorPlanUpdateDTO): Promise<void>;
}
