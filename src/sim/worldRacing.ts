/**
 * The world races when you do.
 *
 * Rivals used to accumulate a record only in races the **player was in**, and
 * only for the one horse that beat everyone: `main.ts` incremented a rival's
 * wins when it finished first in your race and nothing else, ever. Two
 * consequences, both found in play.
 *
 * The first is that the world has no form. Seventy horses race for a whole
 * career and finish with `wins: 0`, because a player who wins most of their own
 * races never leaves a win for anyone else to take. Every rival is a blank.
 *
 * The second is what that does to breeding. An outside stud's contribution to
 * the inheritance budget is `seedLegacyFromRecord(wins, earnings, division)`,
 * and with wins pinned at zero and earnings never recorded at all, **two of its
 * three terms were dead** — so an outside partner was worth exactly what its
 * class said, and two horses of the same division were interchangeable however
 * differently their careers had gone. The breeding screen showed a row of studs
 * reading "0 wins from 12 starts · Legacy 60", which is what prompted this.
 *
 * So the rest of the field races too. Not through the race engine — resolving
 * sixty-odd horses at full fidelity every week to produce a number nobody
 * watches would be absurd — but off-screen, off the same `rateHorse` the market
 * and race-day field selection already use, with enough noise that the best
 * horse does not simply win every time. What comes out is a record: starts,
 * wins, placings and prize money, on the same scale the player's own career
 * uses, feeding the same legacy conversion.
 */

import type { Rng } from './rng.js';
import type { Horse } from './types.js';
import { rateHorse } from '../data/wagering.js';
import { getPurse, PRIZE_SHARES } from '../data/purse.js';
import { FIELD_SIZE } from '../data/index.js';
import { updateAIDivisionProgression } from './division.js';

/**
 * Spread of the rating noise, as a share of a horse's own rating.
 *
 * The point of this number is that it is **not** the race engine's answer. The
 * engine is steeply deterministic — a 13-point stat edge wins 97% of the time —
 * and reproducing that here would give every division one horse that wins
 * everything and a field of permanent losers, which is a worse world than the
 * blank one it replaces. At 0.12 the best horse in a division wins often
 * without winning always, and a good one occasionally beats it.
 */
export const OFF_SCREEN_UPSET = 0.12;

/** Difficulty passed to `getPurse`. An ordinary card, not a feature race. */
const ORDINARY_CARD = 0.5;

export interface WorldMeetingReport {
  /** Races resolved. */
  races: number;
  /** Horses that got a run. */
  runners: number;
}

/**
 * Runs one round of off-screen racing for every horse in the world.
 *
 * Horses meet **within their own division**, which is what makes the record
 * mean something: a Championship win and a Maiden win are different
 * achievements, and the purse each pays says so.
 *
 * `exclude` is the field that just raced against the player — they have already
 * had their run this week and must not get a second one, or a rival who meets
 * you often would build a record twice as fast as one who never does.
 */
export function runWorldMeeting(
  rng: Rng,
  world: Horse[],
  exclude: ReadonlySet<string> = new Set(),
): WorldMeetingReport {
  const byDivision = new Map<string, Horse[]>();
  for (const horse of world) {
    if (exclude.has(horse.id)) continue;
    const group = byDivision.get(horse.division);
    if (group) group.push(horse);
    else byDivision.set(horse.division, [horse]);
  }

  let races = 0;
  let runners = 0;

  for (const [division, group] of byDivision) {
    const shuffled = rng.shuffle(group);
    for (let start = 0; start < shuffled.length; start += FIELD_SIZE) {
      const field = shuffled.slice(start, start + FIELD_SIZE);
      // A walkover is not a race, and giving one horse a free win every week
      // would be the fastest way to a division of one unbeatable animal.
      if (field.length < 2) continue;

      const purse = getPurse(division, ORDINARY_CARD);
      const order = field
        .map((horse) => ({
          horse,
          score: rateHorse(horse) * (1 + rng.normal(0, OFF_SCREEN_UPSET)),
        }))
        .sort((a, b) => b.score - a.score);

      for (let i = 0; i < order.length; i++) {
        const horse = order[i]!.horse;
        const position = i + 1;

        horse.starts += 1;
        // The same placing convention the player's own race uses: a win, then
        // second and third are places, fourth is a show.
        if (i === 0) horse.wins += 1;
        else if (i === 1 || i === 2) horse.places += 1;
        else if (i === 3) horse.shows += 1;

        const share = PRIZE_SHARES[i] ?? 0;
        if (share > 0) horse.earnings = (horse.earnings ?? 0) + Math.round(purse * share);

        // The world climbs and falls on the same ladder the player does, so a
        // rival met in Novice two careers ago can turn up in Stakes.
        updateAIDivisionProgression(horse, position);
      }

      races += 1;
      runners += order.length;
    }
  }

  return { races, runners };
}
