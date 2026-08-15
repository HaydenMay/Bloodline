import type { Horse } from '../sim/types.js';
import type { Division } from '../data/index.js';
import type { Silks } from '../render/palette.js';
import type { HorseLegacy, StableLegacy } from '../data/legacy.js';
import type { StaffRoster } from '../data/staff.js';
import { DEFAULTS } from '../data/colors.js';
import { WORLD_POPULATION } from '../data/index.js';
import { createRng } from '../sim/index.js';
import { createNameGenerator } from '../data/names.js';
import { generateWorld } from '../sim/horse.js';
import { createStaffRoster } from '../data/staff.js';
import {
  createHorseLegacy,
  createStableLegacy,
  seedLegacyFromRecord,
} from '../data/legacy.js';

/** What a brand-new yard opens with. */
export const STARTING_CASH = 10000;

/** This horse's record. Reset when a new horse is campaigned. */
export interface CareerStats {
  wins: number;
  losses: number;
  totalEarnings: number;
  topWins: Array<{ raceName: string; margin: string }>;
  racesCompleted: number;
}

export interface RivalRecord {
  /** Kept on the entry so the dossier survives a rival leaving the world. */
  name: string;
  wins: number;
  places: number;
  shows: number;
  starts: number;
  division: Division;
  lastSeen: number;
  /** Races you and this rival have both been in. */
  meetings: number;
  /** Of those, how many you finished ahead of them. */
  beaten: number;
}

export interface RivalDossier {
  [rivalId: string]: RivalRecord;
}

export interface SaveSettings {
  autopilotEnabled: boolean;
}

/**
 * The yard itself. Outlives any one horse: this is what makes run 2 open
 * stronger than run 1, so it is saved under its own key and is deliberately
 * *not* cleared when a career ends.
 */
export interface Stable {
  world: Horse[];
  dossier: RivalDossier;
  settings: SaveSettings;
  facilities: Record<string, number>; // facility id -> level (0-5)
  /** Farm-wide prestige. Gates facility upgrades. */
  legacy: StableLegacy;
  /** The yard's wallet. Carries between horses. */
  cash: number;
  /** Standing in the sport. Caps how good your staff can become. */
  reputation: number;
  staff: StaffRoster;
  /** item id -> quantity held */
  consumables: Record<string, number>;
  /** Horses campaigned to the end of their careers. */
  careersCompleted: number;
}

export interface Career {
  horse: Horse;
  playerSilks: Silks;
  week: number;
  season: number;
  stats: CareerStats;
  stable: Stable;
  /** The active horse's own legacy. Rises and falls with its results. */
  horseLegacy: HorseLegacy;
  createdAt: number;
  lastUpdated: number;
  /** Whether a race has been selected for this week (prevents multiple trainings). */
  raceSelected?: boolean;
  /** Whether training has been completed this week. */
  trainingDoneThisWeek?: boolean;
}

const STORAGE_KEY = 'bloodline_career';
const STABLE_STORAGE_KEY = 'bloodline_stable';
const STORAGE_VERSION = 1;

interface StoredCareer {
  version: number;
  data: Career;
}

interface StoredStable {
  version: number;
  data: Stable;
}

/**
 * Abstract storage layer for future migration to filesystem/IndexedDB.
 * Currently uses localStorage; can be swapped to fs.writeFileSync in Electron.
 */

export function createStable(): Stable {
  const rng = createRng(`stable-${Date.now()}`);
  const names = createNameGenerator(rng);

  return {
    world: generateWorld(rng, names, WORLD_POPULATION),
    dossier: {},
    settings: { autopilotEnabled: false },
    facilities: {
      barn: 0,
      training: 0,
      medical: 0,
      feed: 0,
      stud: 0,
      admin: 0,
      paddock: 0,
    },
    legacy: createStableLegacy(),
    cash: STARTING_CASH,
    reputation: 0,
    staff: createStaffRoster(),
    consumables: {},
    careersCompleted: 0,
  };
}

/** Fills in anything a stable from an older save is missing. */
function normaliseStable(stable: Stable): Stable {
  if (!stable.facilities) {
    stable.facilities = { barn: 0, training: 0, medical: 0, feed: 0, stud: 0, admin: 0, paddock: 0 };
  }
  if (!stable.legacy) stable.legacy = createStableLegacy();
  if (!stable.staff) stable.staff = createStaffRoster();
  if (!stable.consumables) stable.consumables = {};
  if (!stable.dossier) stable.dossier = {};
  if (!stable.settings) stable.settings = { autopilotEnabled: false };
  if (typeof stable.cash !== 'number') stable.cash = STARTING_CASH;
  if (typeof stable.reputation !== 'number') stable.reputation = 0;
  if (typeof stable.careersCompleted !== 'number') stable.careersCompleted = 0;
  if (!Array.isArray(stable.world)) stable.world = [];
  return stable;
}

export function saveStable(stable: Stable): void {
  const stored: StoredStable = { version: STORAGE_VERSION, data: stable };
  try {
    localStorage.setItem(STABLE_STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    console.error('Failed to save stable:', error);
  }
}

/** The yard as it stands, or null if this account has never had one. */
export function loadStable(): Stable | null {
  try {
    const item = localStorage.getItem(STABLE_STORAGE_KEY);
    if (!item) return null;
    const stored = JSON.parse(item) as StoredStable;
    return normaliseStable(stored.data);
  } catch (error) {
    console.error('Failed to load stable:', error);
    return null;
  }
}

/**
 * Saves the career and, alongside it, the stable it belongs to. The two are
 * written together so the yard is never a step behind the horse.
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
  saveStable(career.stable);
}

/**
 * Ends the current horse's career and banks what it earned the yard.
 *
 * The horse's legacy converts into permanent stable prestige here — while it
 * was racing its score could still fall, but once the career is over what it
 * achieved is locked in and the next horse starts on top of it.
 */
export function retireCurrentHorse(career: Career): Stable {
  const stable = career.stable;
  stable.legacy.archivedPoints += career.horseLegacy.peak;
  stable.careersCompleted += 1;
  saveStable(stable);
  deleteCareer();
  return stable;
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

    if (!career.stable) career.stable = createStable();

    // Legacy split into horse/stable scores. Saves from the first legacy build
    // carry a single `legacy` blob; fold its points into the horse's score.
    const legacyBlob = (career as unknown as { legacy?: { totalPoints?: number } }).legacy;
    if (!career.horseLegacy) {
      const seed =
        legacyBlob?.totalPoints ??
        seedLegacyFromRecord(
          career.stats.wins || 0,
          career.stats.totalEarnings || 0,
          career.horse.division,
        );
      career.horseLegacy = createHorseLegacy(seed);
    }
    delete (career as unknown as { legacy?: unknown }).legacy;

    // Cash and reputation used to live on the career, which meant they died
    // with the horse. Move them onto the yard, where they belong.
    const legacyStats = career.stats as unknown as { cash?: number; reputation?: number };
    normaliseStable(career.stable);
    if (typeof legacyStats.cash === 'number') {
      career.stable.cash = legacyStats.cash;
      delete legacyStats.cash;
    }
    if (typeof legacyStats.reputation === 'number') {
      career.stable.reputation = legacyStats.reputation;
      delete legacyStats.reputation;
    }

    // A stable saved separately is the newer record — prefer it, but keep the
    // career's own copy of the world so an in-flight race still finds its field.
    const persisted = loadStable();
    if (persisted) {
      persisted.world = career.stable.world?.length ? career.stable.world : persisted.world;
      career.stable = persisted;
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

/**
 * Starts a horse's career in an existing yard, or in a fresh one if this is the
 * first. Passing the current stable through is what carries facilities, staff,
 * cash and prestige from one horse to the next.
 */
export function createNewCareer(horse: Horse, playerSilks: Silks, stable?: Stable): Career {
  const yard = stable ?? loadStable() ?? createStable();

  // A horse with a record already carries some standing; a debutant starts at 0.
  const seededLegacy = seedLegacyFromRecord(horse.wins || 0, 0, horse.division);

  return {
    horse,
    playerSilks,
    week: 1,
    season: 1,
    stats: {
      wins: horse.wins || 0,
      losses: (horse.starts || 0) - (horse.wins || 0),
      totalEarnings: 0,
      topWins: [],
      racesCompleted: horse.starts || 0,
    },
    stable: yard,
    horseLegacy: createHorseLegacy(seededLegacy),
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  };
}
