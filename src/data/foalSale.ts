import { STAT_KEYS, type Horse } from '../sim/types.js';
import { potentialAverage } from './studFee.js';
import type { Division } from './index.js';

/**
 * Passing on a foal (DESIGN.md §10).
 *
 * "Rejected foals are **sold for cash, and they enter the world as rivals**
 * carrying your bloodline's name. Pass on a colt for mediocre stamina and you
 * may watch him win a Championship in three years."
 *
 * Both halves matter. The cash is a consolation for a pairing that did not come
 * off; the release is the point. A foal you turned down is the only horse in the
 * game with a genuine claim on you, and meeting it in a Championship field years
 * later is a story the pedigree tree can tell because the lineage went with it.
 */

/**
 * Share of a stud fee's quality premium that an unraced foal fetches.
 *
 * Priced off what the foal *is* rather than what it has done, because it has
 * done nothing — no starts, no legacy, only ceilings. Deliberately a fraction:
 * a buyer is taking on all the risk of a horse that has never seen a racecourse,
 * and, more practically, selling foals must never become an income stream. It is
 * money for a decision you regret, not a business.
 */
export const FOAL_SALE_SHARE = 0.2;

/** What a rejected foal fetches, in cash. */
export function foalSalePrice(foal: Horse): number {
  const quality = Math.max(0, potentialAverage(foal) - 50) ** 2 * 25;
  return Math.round((quality * FOAL_SALE_SHARE) / 100) * 100;
}

/**
 * What a covering season costs, in years off every horse at stud.
 *
 * §10: "Age is the only breeding limit. No arbitrary caps, no cooldowns — and it
 * means **rerolling burns your best sire's remaining years**, so the reroll grind
 * eats the thing it depends on."
 *
 * This is that sentence, implemented. Passing on a foal and trying again is not
 * free: it spends a year of every stallion and mare you own. Four rejections
 * cost about what a whole career does, so a player who rerolls hard arrives at
 * their next career with a stud book that has aged past its best.
 */
export const REJECTION_YEARS = 1;

/**
 * How much of its potential a released foal has realised by the time you meet it.
 *
 * The design's "in three years" is doing real work: the horse you passed on has
 * been campaigned by somebody else, so it should turn up as the animal it grew
 * into rather than the two-year-old you rejected. At 85% it is a serious rival
 * without being the finished article.
 *
 * The world has no clock of its own yet — rivals never age and never develop —
 * so the growth is applied once, at release. When the world does get a clock,
 * this becomes the starting point of a real career rather than a stand-in.
 */
export const RELEASE_DEVELOPMENT = 0.85;

/** Where a horse of this strength belongs. */
function divisionFor(average: number): { division: Division; level: number } {
  const ladder: [Division, number][] = [
    ['maiden', 45],
    ['novice', 58],
    ['open', 70],
    ['stakes', 82],
    ['championship', Infinity],
  ];
  for (let i = 0; i < ladder.length; i++) {
    if (average < ladder[i]![1]) return { division: ladder[i]![0], level: i };
  }
  return { division: 'championship', level: 4 };
}

/**
 * The foal as the world will meet it: grown, raced by someone else, and still
 * carrying every scrap of its ancestry.
 *
 * `sireId`, `damId`, `generation` and the coat genotype all travel with it. That
 * is what makes it findable by the pedigree tree in Stage 4 and by `relatedness`
 * today — you can breed to your own rejected foal years later, and the game will
 * know exactly how closely related you are.
 */
export function releaseAsRival(foal: Horse): Horse {
  const grown: Horse = {
    ...foal,
    stats: { ...foal.stats },
    potential: { ...foal.potential },
    age: 4,
    // Somebody else's yard did the work, so it arrives with a record.
    starts: 9,
    wins: 2,
    places: 2,
    shows: 1,
    condition: 74,
    morale: 62,
  };

  let total = 0;
  for (const key of STAT_KEYS) {
    grown.stats[key] = Math.min(100, Math.round(foal.potential[key] * RELEASE_DEVELOPMENT));
    total += grown.stats[key];
  }

  const { division, level } = divisionFor(total / STAT_KEYS.length);
  grown.division = division;
  grown.divisionLevel = level;
  grown.divisionPoints = 0;

  return grown;
}
