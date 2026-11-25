/**
 * @fileoverview Shared Adapter Seams (Interfaces Only at Startup).
 *
 * Ownership:
 * - Domain port interfaces (PatientDataPort, DoctorDataPort) live in `src/shared/contracts/`.
 * - Production Supabase adapters and local storage implementations are wired here by Person 2
 *   (and local offline mock/storage during Person 4's middle 30% work).
 * - Startup owner MUST NOT implement Supabase schemas, auth, or production data adapters.
 */

export type { PatientDataPort, DoctorDataPort } from '../contracts';
