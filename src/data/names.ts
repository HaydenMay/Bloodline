/**
 * Procedural horse names (DESIGN.md §13).
 *
 * Real thoroughbreds are often named with wordplay on their sire and dam.
 * That derivation was the original aim for Phase 5 but was never built — a
 * foal's name today is drawn from these flat pools with no reference to its
 * parents at all. What this file actually provides is the safeguards: no
 * nonsense combinations, no duplicates within a save, and a length cap.
 * Player horses always get a suggestion they can overwrite.
 *
 * The pools were doubled from their original ~56/56/24 (found in play: the
 * same handful of words kept resurfacing across a long save's worth of
 * horses). More words per pool directly cuts how often two horses echo each
 * other, since it's the count of each pool — not the combinations, which
 * were never actually the scarce resource — that a player notices.
 */

const FIRST = [
  'Storm', 'Quiet', 'Iron', 'Midnight', 'Golden', 'Silent', 'Wild', 'Northern',
  'Crimson', 'Silver', 'Distant', 'Bold', 'Restless', 'Autumn', 'Hidden', 'Grand',
  'Copper', 'Velvet', 'Rapid', 'Solemn', 'Amber', 'Winter', 'Bright', 'Fearless',
  'Shadow', 'Marble', 'Gentle', 'Roman', 'Coastal', 'Highland', 'Lucky', 'Sable',
  'Fierce', 'Keen', 'Swift', 'Proud', 'True', 'Noble', 'Wise', 'Dark',
  'Regal', 'Vital', 'Sacred', 'Royal', 'Loyal', 'Brash', 'Sleek', 'Mystic',
  'Vivid', 'Sharp', 'Daring', 'Graceful', 'Majestic', 'Savage', 'Serene', 'Zesty',
  'Ancient', 'Blazing', 'Brave', 'Burning', 'Calm', 'Crystal', 'Cunning', 'Deep',
  'Electric', 'Emerald', 'Eternal', 'Fabled', 'Feral', 'Flying', 'Forgotten', 'Free',
  'Frost', 'Gallant', 'Ghost', 'Gleaming', 'Hollow', 'Honest', 'Ivory', 'Jade',
  'Radiant', 'Rising', 'Rogue', 'Rustic', 'Scarlet', 'Solitary', 'Southern', 'Stark',
  'Steel', 'Sudden', 'Timeless', 'Ashen', 'Auburn', 'Bronze', 'Onyx', 'Pale',
] as const;

const SECOND = [
  'Signal', 'Lantern', 'Compass', 'Harbour', 'Verdict', 'Cadence', 'Anchor', 'Ember',
  'Whisper', 'Thunder', 'Ledger', 'Beacon', 'Arrow', 'Chapter', 'Meridian', 'Falcon',
  'Promise', 'Rhythm', 'Sonnet', 'Trooper', 'Wager', 'Cavalier', 'Legacy', 'Sovereign',
  'Marauder', 'Lullaby', 'Comet', 'Bandit', 'Nomad', 'Chancer', 'Reckoning', 'Tempest',
  'Vessel', 'Oracle', 'Prophet', 'Timber', 'Forge', 'Tide', 'Spark', 'Prism',
  'Rebel', 'Victor', 'Horizon', 'Phantom', 'Summit', 'Torch', 'Warden', 'Sentinel',
  'Crown', 'Mantle', 'Scepter', 'Throne', 'Justice', 'Valor', 'Glory', 'Honor',
  'Ballad', 'Baron', 'Blade', 'Bounty', 'Cascade', 'Citadel', 'Cove', 'Crest',
  'Current', 'Dagger', 'Echo', 'Frontier', 'Gambit', 'Garrison', 'Harvest', 'Haven',
  'Herald', 'Journey', 'Lance', 'Bastion', 'Outpost', 'Ranger', 'Reef', 'Ridge',
  'Saga', 'Scout', 'Sentry', 'Skyline', 'Stampede', 'Standard', 'Stronghold', 'Vanguard',
] as const;

/** Single-word names, used occasionally so the field isn't uniformly two-word. */
const SOLO = [
  'Kingmaker', 'Understudy', 'Firebrand', 'Nightjar', 'Hearsay', 'Landslide',
  'Overture', 'Backdraft', 'Riptide', 'Freehand', 'Nobleman', 'Windfall',
  'Maverick', 'Phantom', 'Tempest', 'Wildfire', 'Starlight', 'Thunder',
  'Blaze', 'Eclipse', 'Mirage', 'Vortex', 'Zenith', 'Dynamo',
  'Ironclad', 'Renegade', 'Whirlwind', 'Sundown', 'Daybreak', 'Nightfall',
  'Uprising', 'Cornerstone', 'Trailblazer', 'Firestorm', 'Stormfront', 'Lodestar',
] as const;

/** Combinations that read badly or unfortunately. Checked case-insensitively. */
const BLOCKLIST = ['wild wager', 'shadow bandit', 'lucky chancer'];

/** Exported so a player-editable name field can cap input to what the game can store/display. */
export const MAX_LENGTH = 18;

export interface NameGenerator {
  next(): string;
  /** Register an externally chosen name so it is never re-issued. */
  reserve(name: string): void;
  /**
   * A suggestion for a bred foal, echoing one of its parents (DESIGN.md §13:
   * "Procedural, derived from parents, always editable" — *Storm Signal* x
   * *Quiet Lantern* suggesting *Lantern Warning*). Not reserved on its own;
   * whichever name the player actually confirms gets recorded the ordinary
   * way once the foal joins the yard, so calling this repeatedly (a
   * "Randomize" button) never burns through the registry.
   */
  suggestFromParents(sireName: string, damName: string): string;
}

/**
 * A name generator scoped to one save. Holds a registry so no two horses in a
 * stable's history ever share a name.
 */
export function createNameGenerator(
  rng: {
    pick: <T>(items: readonly T[]) => T;
    chance: (p: number) => boolean;
    int: (min: number, max: number) => number;
  },
  used: Iterable<string> = [],
): NameGenerator {
  const registry = new Set<string>(Array.from(used, (n) => n.toLowerCase()));

  const isAvailable = (name: string): boolean => {
    const key = name.toLowerCase();
    return !registry.has(key) && !BLOCKLIST.includes(key) && name.length <= MAX_LENGTH;
  };

  const build = (): string | null => {
    const name = rng.chance(0.12)
      ? rng.pick(SOLO)
      : `${rng.pick(FIRST)} ${rng.pick(SECOND)}`;
    return isAvailable(name) ? name : null;
  };

  /** A two-word name split into its parts, or null for a solo name — nothing to echo from those. */
  const splitTwoWord = (name: string): [string, string] | null => {
    const parts = name.trim().split(/\s+/);
    return parts.length === 2 ? [parts[0]!, parts[1]!] : null;
  };

  const next = (): string => {
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
  };

  return {
    next,
    reserve(name: string): void {
      registry.add(name.toLowerCase());
    },
    suggestFromParents(sireName: string, damName: string): string {
      const parents = [splitTwoWord(sireName), splitTwoWord(damName)].filter(
        (parts): parts is [string, string] => parts !== null,
      );

      for (let attempt = 0; attempt < 30 && parents.length > 0; attempt++) {
        const parts = rng.pick(parents);
        const echoed = parts[rng.int(0, 1)];
        // The echoed word can land in either slot of the foal's name, not
        // just the one it came from — §13's own example does this (the
        // dam's second word becomes the foal's first).
        const name = rng.chance(0.5)
          ? `${echoed} ${rng.pick(SECOND)}`
          : `${rng.pick(FIRST)} ${echoed}`;
        if (isAvailable(name)) {
          registry.add(name.toLowerCase());
          return name;
        }
      }

      // Neither parent has two words to echo, or every echo tried collided —
      // still a real name, just not a derived one.
      return next();
    },
  };
}
