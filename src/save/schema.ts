/**
 * Save schema and versioning.
 *
 * Written before any real save data exists, deliberately. Multiple stable slots
 * (DESIGN.md §13) mean a botched migration costs a player several careers of
 * progress, so the migration path is built in from the first commit rather than
 * bolted on once it's dangerous to change.
 *
 * RULES
 *  - Never change the meaning of an existing field. Add a new one and migrate.
 *  - Every bump to CURRENT_VERSION needs a matching entry in migrations.ts.
 *  - Migrations run forwards only, one step at a time, and must be pure.
 */

import { DEFAULTS } from '../data/colors.js';

/** Bump this whenever the shape of StableSave changes. */
export const CURRENT_VERSION = 3;

export const SLOT_COUNT = 3;

/** localStorage key for a given slot. */
export const slotKey = (slot: number): string => `bloodline.save.${slot}`;

/** Wrapper stored on disk. The envelope is stable; `data` evolves. */
export interface SaveEnvelope {
  version: number;
  savedAt: string;
  data: unknown;
}

/**
 * The stable — the player's persistent progress. This is the save file.
 * Individual horses are runs; this outlives all of them (DESIGN.md §1).
 *
 * Phase 0 holds only the skeleton. Fields are added as the phases land.
 */
export interface StableSave {
  /** Seeds the world: AI horses, starter pools, everything generated. */
  seed: string;
  stableName: string;
  /** Hex, drives silks / tack / grooming tinting (DESIGN.md §11). */
  stableColours: { primary: string; secondary: string };
  createdAt: string;

  cash: number;

  settings: SaveSettings;

  // Added in later phases:
  // horses, hallOfFame, facilities, staff, world, dossier, activeCareer
}

export interface SaveSettings {
  /** DESIGN.md §2 — "Stallion / Mare" vs plain "Male / Female". */
  genderLabels: 'racing' | 'plain';
  /** DESIGN.md §2 — furlong countdown units. */
  distanceUnits: 'yards' | 'metres';
  difficulty: 'relaxed' | 'standard' | 'brutal';
  /** Off by default — never silently adjusts an earned win (DESIGN.md §13). */
  assists: boolean;
  reducedMotion: boolean;
  musicVolume: number;
  sfxVolume: number;
  textScale: number;
  autopilotEnabled: boolean;
}

export const defaultSettings = (): SaveSettings => ({
  genderLabels: 'racing',
  distanceUnits: 'yards',
  difficulty: 'standard',
  assists: false,
  reducedMotion: false,
  musicVolume: 0.7,
  sfxVolume: 0.9,
  textScale: 1,
  autopilotEnabled: false,
});

export const createStable = (stableName: string, seed: string): StableSave => ({
  seed,
  stableName,
  stableColours: DEFAULTS.stableColorsDefault,
  createdAt: new Date().toISOString(),
  cash: 0,
  settings: defaultSettings(),
});
