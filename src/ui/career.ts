import type { Horse } from '../sim/types.js';
import type { Division } from '../data/index.js';
import type { Silks } from '../render/palette.js';
import type { HorseLegacy, RetirementReason, StableLegacy } from '../data/legacy.js';
import type { StaffRoster } from '../data/staff.js';
import { DEFAULTS } from '../data/colors.js';
import { WORLD_POPULATION } from '../data/index.js';
import { createRng } from '../sim/index.js';
import { createNameGenerator } from '../data/names.js';
import { generateWorld } from '../sim/horse.js';
import { createStaffRoster } from '../data/staff.js';
import {
  buildBundle,
  clearSlot,
  parseBundle,
  readSlot,
  slotsFor,
  writeSlot,
} from '../save/durability.js';
import {
  createHorseLegacy,
  createStableLegacy,
  getRetirementValue,
  rescaleHorseLegacy,
  rescaleStableLegacy,
  seedLegacyFromRecord,
} from '../data/legacy.js';
import { fertility } from '../sim/breeding.js';

/** What a brand-new yard opens with. */
export const STARTING_CASH = 10000;

/**
 * Years the world moves on each time a horse's career ends.
 *
 * A horse races from two to five, so campaigning one advances the calendar
 * about four years — which is what turns §10's breeding lifespan into something
 * a player feels. A stallion retired at five breeds at 5, 9, 13, 17 and 21:
 * four foals at full strength and a fading fifth.
 */
export const YEARS_PER_CAREER = 4;

/**
 * Share of a Hall of Fame horse's banked legacy paid back as prestige each
 * career, for rival yards breeding to it.
 *
 * ROADMAP.md: stud influence pays **prestige, never cash**. Two income faucets
 * against a fixed set of sinks inflates the economy, and cash is already the
 * currency that runs out of things to buy — but what a yard genuinely earns
 * when its bloodline spreads through the league is *influence*, which is what
 * prestige measures.
 *
 * At 8%, a horse that banked 1,000 pays 80 a career and about 320 across its
 * stud life. Enough to matter against the prestige walls, not enough to become
 * the fastest route up them — and it fades with the age taper, so it ends.
 */
export const STUD_INFLUENCE_SHARE = 0.08;

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
  /**
   * Farm-wide prestige, and the yard's only gate: facility tiers, staff levels
   * and the supplies catalogue all read it. A separate `reputation` score used
   * to gate the last two — a second lifetime counter earned from race results,
   * which is what this already is.
   */
  legacy: StableLegacy;
  /** The yard's wallet. Carries between horses. */
  cash: number;
  staff: StaffRoster;
  /** item id -> quantity held */
  consumables: Record<string, number>;
  /** Horses campaigned to the end of their careers. */
  careersCompleted: number;
  /**
   * Every horse this yard has retired, newest last.
   *
   * DESIGN.md §1 and §10: a horse leaves the racetrack, it never leaves the
   * yard. This is what Phase 5 breeds from and what the pedigree archive draws,
   * and it is why taking on a new horse can never end a bloodline.
   */
  bloodstock: RetiredHorse[];
  /**
   * Foals produced per pairing, keyed by `pairingKey`.
   *
   * The first-cross bonus tapers with each repeat of the same pair, so the
   * count has to outlive the horse being campaigned — the pairing is a fact
   * about two animals in the yard, not about one career (ROADMAP.md, "What
   * Stage 1 must record even though it does not use it").
   */
  pairings: Record<string, number>;
}

/** A horse that has finished racing and is now part of the yard's stock. */
export interface RetiredHorse {
  horse: Horse;
  /** Legacy at its highest. What the Hall of Fame judged it on. */
  legacyPeak: number;
  /** Prestige it actually banked — lower than the peak if it was run on. */
  legacyBanked: number;
  retirementReason: RetirementReason;
  wins: number;
  starts: number;
  earnings: number;
  hallOfFame: boolean;
  /** §6: a career ended by injury still carries full breeding value. */
  retiredByInjury: boolean;
  retiredAt: number;
  /** Season of the yard's life, for the archive's generational rows. */
  careerNumber: number;
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
  /** Races remaining on an injury lay-off. The horse cannot run while above 0. */
  weeksInjured?: number;
  /** What it is recovering from, for the UI. */
  injuryName?: string;
  /**
   * Set when a career-ending injury forces retirement. The horse still retires
   * with full breeding value — §6 turns the worst outcome into the next run's
   * hook rather than a loss.
   */
  careerEndedByInjury?: boolean;
}

const STORAGE_KEY = 'bloodline_career';
const STABLE_STORAGE_KEY = 'bloodline_stable';
const STORAGE_VERSION = 1;

/**
 * Abstract storage layer for future migration to filesystem/IndexedDB.
 * Currently uses localStorage; can be swapped to fs.writeFileSync in Electron.
 *
 * Reads and writes go through `src/save/durability.ts`, which keeps a rolling
 * backup and quarantines anything unreadable rather than discarding it. The
 * stable is the record that outlives every horse, so losing it must take more
 * than a single bad write.
 */

/** Enough of a shape check to tell a real stable from junk in the slot. */
function looksLikeStable(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const s = value as Partial<Stable>;
  return (
    typeof s.cash === 'number' &&
    typeof s.facilities === 'object' &&
    s.facilities !== null
  );
}

function looksLikeCareer(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<Career>;
  return !!c.horse && typeof c.horse === 'object' && typeof c.week === 'number';
}

/** Set when a load had to fall back, so the UI can tell the player. */
let lastRecovery: string | null = null;

export function takeRecoveryNotice(): string | null {
  const notice = lastRecovery;
  lastRecovery = null;
  return notice;
}

/**
 * Prestige the yard's stallions earned while the last career was running.
 *
 * Reported the same way a save recovery is, rather than by changing what
 * `retireCurrentHorse` returns: every caller of that function wants the yard,
 * and only the retirement screen cares what the stud book paid.
 */
let lastStudInfluence = 0;

export function takeStudInfluence(): number {
  const earned = lastStudInfluence;
  lastStudInfluence = 0;
  return earned;
}

/**
 * `seed` defaults to `Date.now()` so every real new game gets a genuinely
 * different world — but that same default made every test that calls this
 * unseeded non-deterministic too, which is what let "always offers a poor
 * yard something it can afford" (`studLife.test.ts`) pass by luck for weeks
 * and then fail a real CI run the moment it drew an unlucky world. Tests pass
 * a fixed string here; nothing about ordinary play changes.
 */
export function createStable(seed: string = `stable-${Date.now()}`): Stable {
  const rng = createRng(seed);
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
    staff: createStaffRoster(),
    consumables: {},
    careersCompleted: 0,
    bloodstock: [],
    pairings: {},
  };
}

/** Fills in anything a stable from an older save is missing. */
function normaliseStable(stable: Stable): Stable {
  if (!stable.facilities) {
    stable.facilities = { barn: 0, training: 0, medical: 0, feed: 0, stud: 0, admin: 0, paddock: 0 };
  }
  if (!stable.legacy) stable.legacy = createStableLegacy();
  // Prestige banked before the exponential curve is lifted onto the new scale,
  // so a returning player's yard keeps the tier it earned.
  rescaleStableLegacy(stable.legacy);
  if (!stable.staff) stable.staff = createStaffRoster();
  if (!stable.consumables) stable.consumables = {};
  if (!stable.dossier) stable.dossier = {};
  if (!stable.settings) stable.settings = { autopilotEnabled: false };
  if (typeof stable.cash !== 'number') stable.cash = STARTING_CASH;
  // Prestige replaced it as the single gate; drop it so it cannot be read again.
  delete (stable as unknown as { reputation?: number }).reputation;
  if (typeof stable.careersCompleted !== 'number') stable.careersCompleted = 0;
  if (!Array.isArray(stable.bloodstock)) stable.bloodstock = [];
  // Yards saved before breeding existed have no pairing history, which is the
  // same thing as never having bred: every pairing reads as a first cross.
  if (!stable.pairings || typeof stable.pairings !== 'object') stable.pairings = {};
  if (!Array.isArray(stable.world)) stable.world = [];
  return stable;
}

export function saveStable(stable: Stable): void {
  writeSlot(STABLE_STORAGE_KEY, stable, STORAGE_VERSION, looksLikeStable);
}

/**
 * The yard as it stands, or null if this account has never had one.
 *
 * A yard that exists but cannot be read is never silently replaced with a new
 * one: the backup is tried first, and an unrecoverable copy is quarantined so
 * it can still be rescued by hand.
 */
export function loadStable(): Stable | null {
  const outcome = readSlot<Stable>(STABLE_STORAGE_KEY, looksLikeStable);

  if (outcome.status === 'ok') return normaliseStable(outcome.data);
  if (outcome.status === 'recovered') {
    lastRecovery = outcome.reason;
    console.warn('Stable recovered from backup:', outcome.reason);
    return normaliseStable(outcome.data);
  }
  if (outcome.status === 'unreadable') {
    lastRecovery = outcome.reason;
    console.error('Stable unreadable:', outcome.reason);
  }
  return null;
}

/** True when a stable exists in storage but could not be read at all. */
export function hasUnreadableStable(): boolean {
  try {
    return localStorage.getItem(slotsFor(STABLE_STORAGE_KEY).quarantine) !== null;
  } catch {
    return false;
  }
}

/**
 * Saves the career and, alongside it, the stable it belongs to. The two are
 * written together so the yard is never a step behind the horse.
 */
export function saveCareer(career: Career): void {
  writeSlot(
    STORAGE_KEY,
    { ...career, lastUpdated: Date.now() },
    STORAGE_VERSION,
    looksLikeCareer,
  );
  saveStable(career.stable);
}

/**
 * What the yard's stallions earned while you were racing.
 *
 * Only Hall of Fame horses pay, which is the point: §1 makes enshrining a horse
 * the most valuable thing a career can produce, and this is the part that keeps
 * paying long after the horse has stopped running.
 */
export function studInfluence(stable: Stable): number {
  return stable.bloodstock.reduce((total, entry) => {
    if (!entry.hallOfFame) return total;
    const share = entry.legacyBanked * STUD_INFLUENCE_SHARE * fertility(entry.horse.age);
    return total + Math.round(Math.max(0, share));
  }, 0);
}

/**
 * Ends the current horse's career and banks what it earned the yard.
 *
 * The horse's legacy converts into permanent stable prestige here — while it
 * was racing its score could still fall, but once the career is over what it
 * achieved is locked in and the next horse starts on top of it.
 *
 * The world also moves on: every horse already at stud ages by a career's worth
 * of years, and the ones your rivals have been breeding to pay their influence
 * back as prestige.
 */
export function retireCurrentHorse(career: Career): Stable {
  const stable = career.stable;

  // Paid before the new retiree joins, because it earned nothing at stud while
  // it was still racing — and aged before the payment, so a sire past its years
  // stops earning at the same moment it stops breeding.
  for (const entry of stable.bloodstock) {
    entry.horse.age += YEARS_PER_CAREER;
  }
  lastStudInfluence = studInfluence(stable);
  stable.legacy.archivedPoints += lastStudInfluence;

  // Banks what the horse is worth now, not what it was worth at its best —
  // §8's gamble only exists if running one into the ground actually costs
  // something. Retiring on top pays a bonus; a career ended by injury banks the
  // peak regardless, per §6.
  const value = getRetirementValue(career.horseLegacy, career.careerEndedByInjury === true);
  stable.legacy.archivedPoints += value.banked;
  stable.careersCompleted += 1;

  // The horse itself joins the yard's stock. Previously only the number
  // survived and the animal was discarded, which left no horse related to any
  // other — untenable in a game named after the opposite.
  stable.bloodstock.push({
    horse: JSON.parse(JSON.stringify(career.horse)) as Horse,
    legacyPeak: career.horseLegacy.peak,
    legacyBanked: value.banked,
    retirementReason: value.reason,
    wins: career.stats.wins,
    starts: career.stats.racesCompleted,
    earnings: career.stats.totalEarnings,
    hallOfFame: career.horseLegacy.hallOfFame,
    retiredByInjury: career.careerEndedByInjury === true,
    retiredAt: Date.now(),
    careerNumber: stable.careersCompleted,
  });

  saveStable(stable);
  deleteCareer();
  return stable;
}

export function loadCareer(): Career | null {
  try {
    const outcome = readSlot<Career>(STORAGE_KEY, looksLikeCareer);
    if (outcome.status === 'empty') return null;
    if (outcome.status === 'unreadable') {
      lastRecovery = outcome.reason;
      return null;
    }
    if (outcome.status === 'recovered') lastRecovery = outcome.reason;

    const career = outcome.data;

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
      // The single-blob build predates the exponential curve, so its total is
      // on the old scale even though the record is newly built.
      if (legacyBlob?.totalPoints !== undefined) career.horseLegacy.scale = 1;
    }
    delete (career as unknown as { legacy?: unknown }).legacy;
    rescaleHorseLegacy(career.horseLegacy);

    // Cash used to live on the career, which meant it died with the horse.
    // Move it onto the yard, where it belongs.
    const legacyStats = career.stats as unknown as { cash?: number; reputation?: number };
    normaliseStable(career.stable);
    if (typeof legacyStats.cash === 'number') {
      career.stable.cash = legacyStats.cash;
      delete legacyStats.cash;
    }
    delete legacyStats.reputation;

    // A stable saved separately is the newer record — prefer it, but keep the
    // career's own copy of the world so an in-flight race still finds its field.
    const persisted = loadStable();
    if (persisted) {
      persisted.world = career.stable.world?.length ? career.stable.world : persisted.world;
      career.stable = persisted;
    } else {
      // The yard's own slot is gone but the career carries a copy of it. Write
      // it straight back rather than waiting for the next save, so a player who
      // quits here does not lose the yard as well.
      saveStable(career.stable);
    }

    return career;
  } catch (error) {
    console.error('Failed to load career:', error);
    return null;
  }
}

/**
 * Ends the current horse's run. The yard is untouched.
 *
 * The career's backup goes too: retiring is deliberate, and a backup that
 * resurrected the retired horse on the next load would be a bug, not a rescue.
 */
export function deleteCareer(): void {
  clearSlot(STORAGE_KEY);
}

/**
 * Wipes everything — career, yard, backups and any quarantined copy.
 *
 * The one deliberately irreversible action in the game. Backups exist to
 * survive accidents, so leaving them behind here would make "start over" a lie;
 * the guard against a mistake is the confirmation in front of it, not a copy
 * the player does not know about.
 */
export function resetEverything(): void {
  for (const key of [STORAGE_KEY, STABLE_STORAGE_KEY]) {
    const slots = slotsFor(key);
    for (const slot of [slots.primary, slots.backup, slots.quarantine]) {
      try {
        localStorage.removeItem(slot);
      } catch (error) {
        console.error(`Failed to clear ${slot}:`, error);
      }
    }
  }
}

/* ---------------------------------------------------------------------------
   Export and import — the player's own copy
   ------------------------------------------------------------------------ */

/** The whole save as a JSON string, for the player to keep. */
export function exportSave(): string {
  const career = loadCareer();
  const stable = career?.stable ?? loadStable();
  return JSON.stringify(buildBundle(career, stable), null, 2);
}

export interface ImportResult {
  ok: boolean;
  error?: string;
  summary?: string;
}

/**
 * Replaces the current save with an exported one.
 *
 * The existing save is written to the backup slot first, so importing the
 * wrong file is recoverable rather than final.
 */
export function importSave(text: string): ImportResult {
  const parsed = parseBundle(text);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { career, stable } = parsed.bundle;

  if (stable && !looksLikeStable(stable)) {
    return { ok: false, error: 'The stable in that save is missing or damaged.' };
  }
  if (career && !looksLikeCareer(career)) {
    return { ok: false, error: 'The career in that save is missing or damaged.' };
  }

  if (stable) {
    writeSlot(STABLE_STORAGE_KEY, normaliseStable(stable as Stable), STORAGE_VERSION, looksLikeStable);
  }
  if (career) {
    writeSlot(STORAGE_KEY, career as Career, STORAGE_VERSION, looksLikeCareer);
  } else {
    clearSlot(STORAGE_KEY);
  }

  const yard = stable as Stable | null;
  const summary = yard
    ? `${(yard.careersCompleted ?? 0) + (career ? 1 : 0)} horse(s), $${(yard.cash ?? 0).toLocaleString()}, ${yard.legacy?.archivedPoints ?? 0} banked prestige.`
    : 'Career restored.';

  return { ok: true, summary };
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
