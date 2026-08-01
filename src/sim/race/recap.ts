import type { RaceOutcome, RaceResult } from './types.js';
import type { RunningStyle } from '../../data/index.js';

/**
 * The post-race recap.
 *
 * A result screen that lists times tells you that you lost. It does not tell you
 * WHY, and a race you cannot explain feels arbitrary — which is fatal for a game
 * whose whole proposition is that riding well matters (DESIGN.md §4).
 *
 * Everything here is derived from what the simulation already recorded. Nothing
 * is invented, and nothing is hidden: if the horse was off-colour, or was shut
 * in, or emptied its tank a furlong too soon, the recap says so in the same
 * words a person would use.
 *
 * Kept pure and headless so it can be unit-tested and so the balance harness can
 * read it, exactly like the rest of `sim/`.
 */

export type Pace = 'collapsed' | 'even' | 'crawl';

export interface Recap {
  /** "WINNER", or "3rd of 8". */
  headline: string;
  /** The margin, in racing language: "by a neck", "beaten 2½ lengths". */
  margin: string;
  pace: Pace;
  /** Why it finished this way. Most important first, at most three. */
  story: string[];
}

/**
 * Past this, racing stops counting. Official results say "distanced".
 *
 * "Beaten 53 lengths" is not a margin anyone recognises — it is a number where
 * a verdict should be.
 */
const DISTANCED = 30;

/**
 * A margin, said the way a racecourse commentator would.
 *
 * At both ends racing stops counting in lengths. Below one it counts in parts
 * of a horse, because "beaten 0.3 lengths" is nobody's idea of a photo finish.
 * Past thirty it stops counting at all.
 */
export function lengths(m: number): string {
  if (m < 0.03) return 'a dead heat';
  if (m < 0.08) return 'a nose';
  if (m < 0.18) return 'a head';
  if (m < 0.35) return 'a neck';
  if (m < 0.62) return 'half a length';
  if (m < 0.87) return 'three-quarters of a length';
  if (m >= DISTANCED) return 'a distance';

  const q = Math.round(m * 4) / 4;
  if (q <= 1) return 'a length';
  const whole = Math.floor(q);
  const frac = q - whole;
  const mark = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  return `${whole}${mark} lengths`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]!}`;
}

/**
 * How the race was run.
 *
 * `paceRating` is the late sectional over the early one, so above 1 means the
 * race SLOWED — leaders went off too fast and emptied, which is the collapse an
 * upset comes out of.
 */
export function paceOf(paceRating: number): Pace {
  if (paceRating > 1.05) return 'collapsed';
  if (paceRating < 0.95) return 'crawl';
  return 'even';
}

/** At most this many reasons. Beyond three it stops being an explanation. */
const MAX_STORY = 3;

export function buildRecap(
  outcome: RaceOutcome,
  playerId: string,
  style: RunningStyle,
): Recap {
  const results = outcome.results;
  const me = results.find((r) => r.horseId === playerId);
  const fieldSize = results.length;

  if (!me) {
    return { headline: '—', margin: '', pace: 'even', story: [] };
  }

  const won = me.finishPosition === 1;
  const pace = paceOf(outcome.paceRating);
  const runnerUp = results[1];

  const headline = won ? 'WINNER' : `${ordinal(me.finishPosition)} of ${fieldSize}`;
  const margin = won
    ? runnerUp
      ? `by ${lengths(runnerUp.margin)}`
      : ''
    : `beaten ${lengths(me.margin)}`;

  const usedKick = outcome.events.some((e) => e.kind === 'kick' && e.horseId === playerId);
  const story: string[] = [];
  const add = (line: string): void => {
    if (story.length < MAX_STORY) story.push(line);
  };

  // Ordered by how much each thing actually explains. Something that physically
  // stopped the horse outranks anything tactical.
  if (me.fumbledStart) {
    add(
      won
        ? 'You were slowly away and still got there — that one was won the hard way.'
        : 'You were slowly away, and gave the field a start you could not afford.',
    );
  }

  if (me.hadTrouble) {
    add(
      won
        ? 'You were shut in and still found room in time.'
        : 'You were shut in when it mattered, and had to wait for a gap that came too late.',
    );
  }

  if (me.offColour) {
    add(`${me.name} was below its best today. It happens, and it will not happen every time.`);
  }

  // Being tailed off is its own verdict. Explaining it in tactical terms — a
  // pace read, a reserve unspent — dignifies a beating that had no tactics in
  // it, so it is said plainly and it outranks all of that.
  if (!won && me.margin >= DISTANCED) {
    add('You were tailed off and beaten a distance. Nothing that happened in the race explains that.');
  }

  if (pace === 'collapsed') {
    add(
      style === 'frontRunner'
        ? 'You took them along too fast, and paid for every length of it inside the last furlong.'
        : 'They went far too quick in front. The pace collapsed and the race came back from behind.',
    );
  } else if (pace === 'crawl') {
    add(
      style === 'closer' || style === 'midPack'
        ? 'It was run at a crawl. Nothing was ever going to come from behind in that.'
        : 'A slow tempo up front, and the race turned into a sprint from the turn.',
    );
  }

  if (!won && me.energyLeft > 22) {
    add('You crossed the line with plenty still in the tank. You asked too late.');
  } else if (!won && me.energyLeft < 4) {
    add('You emptied the tank before the line, and there was nothing left when you needed it.');
  } else if (won && me.energyLeft < 5) {
    add('You got there with nothing to spare — perfectly timed.');
  }

  if (!won && !usedKick) {
    add('You never asked for the big one. The kick is only there if you use it.');
  }

  if (story.length === 0) {
    add(
      won
        ? 'A clean race, ridden the way the horse wanted to run.'
        : 'No excuses — you were beaten by a better horse on the day.',
    );
  }

  return { headline, margin, pace, story };
}

/** A placing line, ready to be drawn. */
export interface RecapRow {
  position: number;
  name: string;
  /** Blank for the winner. */
  margin: string;
  time: string;
  isPlayer: boolean;
}

export function recapRows(outcome: RaceOutcome, playerId: string): RecapRow[] {
  return outcome.results.map((r: RaceResult) => ({
    position: r.finishPosition,
    name: r.name,
    margin: r.finishPosition === 1 ? '' : lengths(r.margin),
    time: r.time > 0 ? `${r.time.toFixed(2)}s` : '—',
    isPlayer: r.horseId === playerId,
  }));
}
