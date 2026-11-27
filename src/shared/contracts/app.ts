/**
 * @fileoverview Canonical Application-Wide Conventions & Cross-Module Contracts.
 * @version 0.1.0-provisional
 * @owner Foundation / Startup (shared across Person 2, Person 3, Person 4)
 */

/**
 * ISO-8601 UTC timestamp string (e.g. "2026-11-26T00:50:00.000Z").
 * All cross-module timestamps MUST use ISO-8601 strings.
 */
export type IsoTimestamp = string;

/** Shared canonical identifier types. */
export type PatientId = string;
export type DoctorId = string;
export type PlanId = string;
export type SessionId = string;

/** Supported UI/voice language codes (initial hackathon scope: English & Hindi). */
export type SupportedLanguage = 'en' | 'hi';

/**
 * Canonical route paths for the application shell.
 * Subtrees under /patient and /doctor are owned by Person 4 and Person 2 respectively.
 */
export const APP_ROUTES = {
  HOME: '/',
  TRACKING: '/tracking',
  WORKBENCH: '/workbench',
  PATIENT: '/patient',
  DOCTOR: '/doctor',
} as const;

export type AppRoutePath = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];

/**
 * Minimal cross-module application events.
 * Modules communicate state transitions through contracts rather than internal imports.
 */
export type AppEvent =
  | {
      type: 'app:language-changed';
      language: SupportedLanguage;
      timestamp: IsoTimestamp;
    }
  | {
      type: 'tracking:session-completed';
      exerciseId: string;
      repsCompleted: number;
      accuracyPercent: number | null;
      timestamp: IsoTimestamp;
    }
  | {
      type: 'safety:pain-threshold-exceeded';
      patientId: PatientId;
      painRating: number;
      timestamp: IsoTimestamp;
    };
