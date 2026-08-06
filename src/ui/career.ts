import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';

export interface CareerStats {
  wins: number;
  losses: number;
  totalEarnings: number;
  topWins: Array<{ raceName: string; margin: string }>;
}

export interface Career {
  horse: Horse;
  playerSilks: Silks;
  week: number;
  season: number;
  stats: CareerStats;
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
      career.playerSilks = { primary: '#1a1a2e', secondary: '#e94560' };
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
    },
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };
}
