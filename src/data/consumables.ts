import type { Horse } from '../sim/types.js';

/**
 * Consumables — bought from the yard, used on a horse before it races.
 *
 * Two kinds, deliberately: upkeep items that restore condition or morale and
 * persist, and race-day items that lift a stat for one race only. The race-day
 * ones are applied to a copy of the horse so the boost cannot be banked.
 */

export type ConsumableKind = 'upkeep' | 'raceDay';

export interface Consumable {
  id: string;
  name: string;
  icon: string;
  description: string;
  kind: ConsumableKind;
  cost: number;
  /** Stable prestige needed before a supplier will sell to you. */
  prestigeRequired: number;
  effectLabel: string;
  /** Mutates the horse it is given. Race-day items receive a throwaway copy. */
  apply: (horse: Horse) => void;
}

const clamp = (value: number): number => Math.max(0, Math.min(100, value));

export const CONSUMABLES: Record<string, Consumable> = {
  bran_mash: {
    id: 'bran_mash',
    name: 'Bran Mash',
    icon: '🥣',
    description: 'A warm feed after hard work. Settles a tired horse.',
    kind: 'upkeep',
    cost: 800,
    prestigeRequired: 0,
    effectLabel: '+15 condition',
    apply: (h) => {
      h.condition = clamp(h.condition + 15);
    },
  },
  electrolytes: {
    id: 'electrolytes',
    name: 'Electrolytes',
    icon: '💧',
    description: 'Replaces what a hard race takes out.',
    kind: 'upkeep',
    cost: 1400,
    prestigeRequired: 0,
    effectLabel: '+25 condition',
    apply: (h) => {
      h.condition = clamp(h.condition + 25);
    },
  },
  turnout_day: {
    id: 'turnout_day',
    name: 'Turnout Day',
    icon: '🌤️',
    description: 'A day in the field doing nothing at all.',
    kind: 'upkeep',
    cost: 600,
    prestigeRequired: 0,
    effectLabel: '+20 morale',
    apply: (h) => {
      h.morale = clamp(h.morale + 20);
    },
  },
  sports_massage: {
    id: 'sports_massage',
    name: 'Sports Massage',
    icon: '💆',
    description: 'A physio session between races.',
    kind: 'upkeep',
    cost: 2200,
    prestigeRequired: 150,
    effectLabel: '+20 condition and +10 morale',
    apply: (h) => {
      h.condition = clamp(h.condition + 20);
      h.morale = clamp(h.morale + 10);
    },
  },
  blinkers: {
    id: 'blinkers',
    name: 'Blinkers',
    icon: '🥽',
    description: 'Narrows the view. A distracted horse keeps its mind on the job.',
    kind: 'raceDay',
    cost: 1800,
    prestigeRequired: 0,
    effectLabel: '+6 temper for one race',
    apply: (h) => {
      h.stats.temper = clamp(h.stats.temper + 6);
    },
  },
  speed_work: {
    id: 'speed_work',
    name: 'Sharpening Gallop',
    icon: '⚡',
    description: 'A fast piece of work days before the race.',
    kind: 'raceDay',
    cost: 2600,
    prestigeRequired: 300,
    effectLabel: '+5 speed and +5 burst for one race',
    apply: (h) => {
      h.stats.speed = clamp(h.stats.speed + 5);
      h.stats.burst = clamp(h.stats.burst + 5);
    },
  },
  stamina_prep: {
    id: 'stamina_prep',
    name: 'Long Slow Distance',
    icon: '🫁',
    description: 'Weeks of aerobic base, cashed in on the day.',
    kind: 'raceDay',
    cost: 2600,
    prestigeRequired: 300,
    effectLabel: '+7 stamina for one race',
    apply: (h) => {
      h.stats.stamina = clamp(h.stats.stamina + 7);
    },
  },
  race_tactics: {
    id: 'race_tactics',
    name: 'Tactical Briefing',
    icon: '🗒️',
    description: 'The jockey walks the track and studies the field.',
    kind: 'raceDay',
    cost: 4000,
    prestigeRequired: 900,
    effectLabel: '+8 grit and +4 consistency for one race',
    apply: (h) => {
      h.stats.grit = clamp(h.stats.grit + 8);
      h.stats.consistency = clamp(h.stats.consistency + 4);
    },
  },
};

/** Items the yard's standing allows it to buy. */
export function availableConsumables(prestige: number): Consumable[] {
  return Object.values(CONSUMABLES).filter((c) => prestige >= c.prestigeRequired);
}

/** Everything, with a flag for whether it is purchasable yet. */
export function consumableCatalogue(
  prestige: number,
): Array<{ item: Consumable; unlocked: boolean }> {
  return Object.values(CONSUMABLES)
    .sort((a, b) => a.prestigeRequired - b.prestigeRequired || a.cost - b.cost)
    .map((item) => ({ item, unlocked: prestige >= item.prestigeRequired }));
}

/** Total held across every item, for the hub badge. */
export function totalHeld(inventory: Record<string, number>): number {
  return Object.values(inventory).reduce((sum, n) => sum + Math.max(0, n), 0);
}

/**
 * Applies every race-day item selected for this race to a copy of the horse.
 * The original is untouched, so the boost lasts exactly one race.
 */
export function applyRaceDayItems(horse: Horse, itemIds: string[]): Horse {
  if (itemIds.length === 0) return horse;
  const boosted: Horse = { ...horse, stats: { ...horse.stats } };
  for (const id of itemIds) {
    const item = CONSUMABLES[id];
    if (item?.kind === 'raceDay') item.apply(boosted);
  }
  return boosted;
}
