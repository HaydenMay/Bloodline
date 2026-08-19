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
