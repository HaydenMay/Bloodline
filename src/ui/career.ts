import type { Horse } from '../sim/types.js';
import type { Division } from '../data/index.js';
import type { Silks } from '../render/palette.js';
import { DEFAULTS } from '../data/colors.js';
import { WORLD_POPULATION } from '../data/index.js';
import { createRng } from '../sim/index.js';
import { createNameGenerator } from '../data/names.js';
import { generateWorld } from '../sim/horse.js';

export interface CareerStats {
  wins: number;
  losses: number;
  totalEarnings: number;
  topWins: Array<{ raceName: string; margin: string }>;
  racesCompleted: number;
}

export interface RivalDossier {
  [rivalId: string]: {
    wins: number;
    places: number;
    shows: number;
    starts: number;
    division: Division;
    lastSeen: number;
  };
}

export interface SaveSettings {
  autopilotEnabled: boolean;
}

export interface Stable {
  world: Horse[];
  dossier: RivalDossier;
  settings: SaveSettings;
}

export interface Career {
  horse: Horse;
  playerSilks: Silks;
  week: number;
  season: number;
  stats: CareerStats;
  stable: Stable;
  createdAt: number;
  lastUpdated: number;
  /** Whether a race has been selected for this week (prevents multiple trainings). */
  raceSelected?: boolean;
}

const STORAGE_KEY = 'bloodline_career';
const STORAGE_VERSION = 1;

interface StoredCareer {
  version: number;
  data: Career;
}

/**
 * Abstract storage layer for future migration to filesystem/IndexedDB.
 * Currently uses localStorage; can be swapped to fs.writeFileSync in Electron.
 */

export function saveCareer(career: Career): void {
  const stored: StoredCareer = {
    version: STORAGE_VERSION,
    data: {
      ...career,
      lastUpdated: Date.now(),
    },
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    console.error('Failed to save career:', error);
  }
}

export function loadCareer(): Career | null {
  try {
    const item = localStorage.getItem(STORAGE_KEY);
    if (!item) return null;

    const stored = JSON.parse(item) as StoredCareer;

    // Check version for future schema migrations
    if (stored.version !== STORAGE_VERSION) {
      console.warn(`Save version mismatch: ${stored.version} vs ${STORAGE_VERSION}`);
      // TODO: Add migration logic here
    }

    const career = stored.data;

    // Ensure playerSilks exists (for saves before playerSilks was added)
    if (!career.playerSilks) {
      career.playerSilks = DEFAULTS.playerSilksDefault;
    }

    // Ensure racesCompleted exists (for saves before racesCompleted was added)
    if (career.stats.racesCompleted === undefined) {
      career.stats.racesCompleted = (career.stats.wins || 0) + (career.stats.losses || 0);
    }

    return career;
  } catch (error) {
    console.error('Failed to load career:', error);
    return null;
  }
}

export function deleteCareer(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to delete career:', error);
  }
}

export function createNewCareer(horse: Horse, playerSilks: Silks): Career {
  // Generate the living world of ~70 AI rivals
  const rng = createRng(`career-${Date.now()}`);
  const names = createNameGenerator(rng);
  const world = generateWorld(rng, names, WORLD_POPULATION);

  return {
    horse,
    playerSilks,
    week: 1,
    season: 1,
    stats: {
      wins: 0,
      losses: 0,
      totalEarnings: 0,
      topWins: [],
      racesCompleted: 0,
    },
    stable: {
      world,
      dossier: {},
      settings: {
        autopilotEnabled: false,
      },
    },
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };
}
