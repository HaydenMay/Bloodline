/**
 * data/ — static game data: traits, divisions, name pools, coat genetics tables.
 *
 * Held to the same purity rules as sim/ (enforced in eslint.config.js) because
 * the balance harness loads it headlessly.
 *
 * The trait catalogue defined in TRAITS.md is transcribed here in Phase 1.
 */

export const DIVISIONS = ['maiden', 'novice', 'open', 'stakes', 'championship'] as const;
export type Division = (typeof DIVISIONS)[number];

export const RUNNING_STYLES = ['frontRunner', 'stalker', 'midPack', 'closer'] as const;
export type RunningStyle = (typeof RUNNING_STYLES)[number];

export const DISTANCE_BANDS = ['sprint', 'mile', 'route'] as const;
export type DistanceBand = (typeof DISTANCE_BANDS)[number];

/** Field size for every race (DESIGN.md §4). */
export const FIELD_SIZE = 8;

/** Starting AI world population, pyramid-weighted (DESIGN.md §9). */
export const WORLD_POPULATION: Record<Division, number> = {
  maiden: 20,
  novice: 18,
  open: 14,
  stakes: 10,
  championship: 8,
};
