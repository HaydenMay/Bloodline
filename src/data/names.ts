/**
 * Procedural horse names (DESIGN.md §13).
 *
 * Real thoroughbreds are often named with wordplay on their sire and dam, so
 * foal names are derived from parents in Phase 5. This file provides the pools
 * and the safeguards: no nonsense combinations, no duplicates within a save,
 * and a length cap. Player horses always get a suggestion they can overwrite.
 */

const FIRST = [
  'Storm', 'Quiet', 'Iron', 'Midnight', 'Golden', 'Silent', 'Wild', 'Northern',
  'Crimson', 'Silver', 'Distant', 'Bold', 'Restless', 'Autumn', 'Hidden', 'Grand',
  'Copper', 'Velvet', 'Rapid', 'Solemn', 'Amber', 'Winter', 'Bright', 'Fearless',
  'Shadow', 'Marble', 'Gentle', 'Roman', 'Coastal', 'Highland', 'Lucky', 'Sable',
] as const;

const SECOND = [
  'Signal', 'Lantern', 'Compass', 'Harbour', 'Verdict', 'Cadence', 'Anchor', 'Ember',
  'Whisper', 'Thunder', 'Ledger', 'Beacon', 'Arrow', 'Chapter', 'Meridian', 'Falcon',
  'Promise', 'Rhythm', 'Sonnet', 'Trooper', 'Wager', 'Cavalier', 'Legacy', 'Sovereign',
  'Marauder', 'Lullaby', 'Comet', 'Bandit', 'Nomad', 'Chancer', 'Reckoning', 'Tempest',
] as const;

/** Single-word names, used occasionally so the field isn't uniformly two-word. */
const SOLO = [
  'Kingmaker', 'Understudy', 'Firebrand', 'Nightjar', 'Hearsay', 'Landslide',
  'Overture', 'Backdraft', 'Riptide', 'Freehand', 'Nobleman', 'Windfall',
] as const;

/** Combinations that read badly or unfortunately. Checked case-insensitively. */
const BLOCKLIST = ['wild wager', 'shadow bandit', 'lucky chancer'];

const MAX_LENGTH = 18;

export interface NameGenerator {
  next(): string;
  /** Register an externally chosen name so it is never re-issued. */
  reserve(name: string): void;
}

/**
 * A name generator scoped to one save. Holds a registry so no two horses in a
 * stable's history ever share a name.
 */
export function createNameGenerator(
  rng: { pick: <T>(items: readonly T[]) => T; chance: (p: number) => boolean },
  used: Iterable<string> = [],
): NameGenerator {
  const registry = new Set<string>(Array.from(used, (n) => n.toLowerCase()));

  const build = (): string | null => {
    const name = rng.chance(0.12)
      ? rng.pick(SOLO)
      : `${rng.pick(FIRST)} ${rng.pick(SECOND)}`;

    const key = name.toLowerCase();
    if (registry.has(key)) return null;
    if (BLOCKLIST.includes(key)) return null;
    if (name.length > MAX_LENGTH) return null;
    return name;
  };

  return {
    next(): string {
      for (let attempt = 0; attempt < 60; attempt++) {
        const name = build();
        if (name) {
          registry.add(name.toLowerCase());
          return name;
        }
      }
      // Pools exhausted — fall back to a numbered variant rather than repeat.
      let n = 2;
      for (;;) {
        const base = `${rng.pick(FIRST)} ${rng.pick(SECOND)} ${n}`;
        if (!registry.has(base.toLowerCase())) {
          registry.add(base.toLowerCase());
          return base;
        }
        n++;
      }
    },
    reserve(name: string): void {
      registry.add(name.toLowerCase());
    },
  };
}
