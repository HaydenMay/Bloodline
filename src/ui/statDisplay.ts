import { STAT_KEYS, toGrade, type Horse, type StatBand, type StatKey } from '../sim/types.js';

/**
 * The one way stats are shown.
 *
 * DESIGN.md §3 asks for "letter grades everywhere, tap for exact numbers — one
 * consistent pattern", and §2 for potential as "a range that narrows as you
 * train that stat". Neither held: the info box printed grade and number side by
 * side with a single potential band that only ever read `speed`, and the
 * training screen printed raw numbers with no grade, no potential, and only
 * five of the six stats.
 *
 * Both screens now render through here, so the pattern is one function rather
 * than two that drift.
 */

export const STAT_LABELS: Record<StatKey, string> = {
  speed: 'Speed',
  stamina: 'Stamina',
  burst: 'Burst',
  grit: 'Grit',
  temper: 'Temper',
  consistency: 'Consistency',
};

/** Three-letter codes for a grid tight on room — the stud-card's own abbreviations. */
export const SHORT_STAT_LABELS: Record<StatKey, string> = {
  speed: 'SPD',
  stamina: 'STA',
  burst: 'BRS',
  grit: 'GRT',
  temper: 'TMP',
  consistency: 'CNS',
};

/**
 * How much room a stat has left, in words.
 *
 * §2 keeps the exact ceiling masked for the whole career — this is the
 * "narrowing range". It narrows on its own as training eats the headroom, so
 * the signal comes free rather than needing a reveal.
 */
export interface PotentialBand {
  /** Machine-readable, for styling. */
  id: 'untapped' | 'plenty' | 'some' | 'close' | 'maxed';
  label: string;
  /**
   * Where the ceiling sits on the same 0-100 scale the stat bar uses.
   *
   * It must share the bar's scale, or the gap between the fill and the ghost
   * stops meaning headroom: a stat of 50 with a ceiling of 51 drew its ghost at
   * 98% and looked wide open while the label correctly read "at its ceiling".
   */
  ceilingAt: number;
}

export function getPotentialBand(current: number, potential: number): PotentialBand {
  const room = Math.max(0, potential - current);
  const ceilingAt = Math.max(0, Math.min(100, potential));

  if (room <= 1) return { id: 'maxed', label: 'at its ceiling', ceilingAt };
  if (room < 12) return { id: 'close', label: 'close to its ceiling', ceilingAt };
  if (room < 26) return { id: 'some', label: 'some room left', ceilingAt };
  if (room < 42) return { id: 'plenty', label: 'plenty of room', ceilingAt };
  return { id: 'untapped', label: 'barely scratched', ceilingAt };
}

export interface StatRowOptions {
  /**
   * Show the exact number outright instead of behind a tap. Off by default —
   * §3 makes the grade the primary reading.
   */
  revealNumbers?: boolean;
  /** Show the potential band, and lead with the potential grade rather than
   *  the current one. Off for rivals, whose ceilings you never see. */
  showPotential?: boolean;
}

/**
 * Renders the six stat rows. Pair with `attachStatReveal` to make them tappable.
 *
 * The grade and the number are two different questions, so they never show at
 * once: the grade is what the horse *could* become — its potential, where a
 * ceiling is known — and tapping swaps it for what it *is right now*, as an
 * exact figure. Picking a starter or a yearling is a bet on the grade; training
 * one day to day is watching the number climb toward it.
 *
 * The bar still carries both: the solid fill is the stat as it stands, the
 * ghost behind it is how far the ceiling is. Watching the gap close is the
 * narrowing range, without ever printing the ceiling itself.
 */
export function renderStatRows(horse: Horse, options: StatRowOptions = {}): string {
  const { revealNumbers = false, showPotential = true } = options;

  return STAT_KEYS.map((key) => {
    const value = Math.round(horse.stats[key]);
    const ceiling = horse.potential?.[key];
    const hasPotential = showPotential && ceiling !== undefined;
    const grade = toGrade(hasPotential ? ceiling : value);
    const band = hasPotential ? getPotentialBand(value, ceiling) : null;

    return `
      <button class="stat-row${revealNumbers ? ' revealed' : ''}" data-stat="${key}"
              aria-label="${STAT_LABELS[key]}, ${hasPotential ? 'potential grade' : 'grade'} ${grade}${band ? `, ${band.label}` : ''}, currently ${value}">
        <span class="stat-row-name">${STAT_LABELS[key]}</span>
        <span class="stat-row-bar">
          ${band ? `<i class="stat-row-ceiling" style="width:${band.ceilingAt.toFixed(0)}%"></i>` : ''}
          <i class="stat-row-fill" style="width:${value}%"></i>
        </span>
        <span class="stat-row-grade grade-${grade}">${grade}</span>
        <span class="stat-row-num">${value}</span>
        ${band ? `<span class="stat-row-room room-${band.id}">${band.label}</span>` : ''}
      </button>`;
  }).join('');
}

/**
 * The same six stats as a grid of boxes rather than a stack of bar rows —
 * Hayden's own sketch, for a screen tight on vertical room and not trying to
 * show headroom (no bar, no room label, just the letter). Same tap-to-reveal
 * pattern as `renderStatRows`: `.stat-row`/`.stat-row-grade`/`.stat-row-num`
 * are the same classes `attachStatReveal` already toggles, so it works here
 * unmodified — only the cell's own layout is different.
 */
export function renderStatGrid(horse: Horse, options: StatRowOptions = {}): string {
  const { revealNumbers = false, showPotential = true } = options;

  return STAT_KEYS.map((key) => {
    const value = Math.round(horse.stats[key]);
    const ceiling = horse.potential?.[key];
    const hasPotential = showPotential && ceiling !== undefined;
    const grade = toGrade(hasPotential ? ceiling : value);

    return `
      <button class="stat-row stat-cell${revealNumbers ? ' revealed' : ''}" data-stat="${key}"
              aria-label="${STAT_LABELS[key]}, ${hasPotential ? 'potential grade' : 'grade'} ${grade}, currently ${value}">
        <span class="stat-cell-label">${SHORT_STAT_LABELS[key]}</span>
        <span class="stat-cell-value">
          <span class="stat-row-grade grade-${grade}">${grade}</span>
          <span class="stat-row-num">${value}</span>
        </span>
      </button>`;
  }).join('');
}

/**
 * The same six rows, but showing a *range* rather than a value.
 *
 * §10's pairing screen shows "a preview of the foal's projected potential
 * ranges — and nothing else": no relatedness rating, no percentage, no concept
 * to learn. A wide outcross simply draws wider bands than a tight line, so the
 * mechanic is read off the picture.
 *
 * Deliberately the same markup as `renderStatRows`, so `attachStatReveal` makes
 * these tappable too and the grade-first, numbers-on-request pattern holds on
 * the one screen where a player is comparing possibilities rather than facts.
 */
export function renderRangeRows(
  ranges: Record<StatKey, StatBand>,
  options: { revealNumbers?: boolean } = {},
): string {
  const { revealNumbers = false } = options;

  return STAT_KEYS.map((key) => {
    const low = Math.round(ranges[key].low);
    const high = Math.round(ranges[key].high);
    const lowGrade = toGrade(low);
    const highGrade = toGrade(high);
    const settled = lowGrade === highGrade;

    return `
      <button class="stat-row${revealNumbers ? ' revealed' : ''}" data-stat="${key}"
              aria-label="${STAT_LABELS[key]} projected ${lowGrade} to ${highGrade}">
        <span class="stat-row-name">${STAT_LABELS[key]}</span>
        <span class="stat-row-bar">
          <i class="stat-row-span" style="left:${low}%;width:${Math.max(1, high - low)}%"></i>
        </span>
        <span class="stat-row-grade${settled ? ` grade-${lowGrade}` : ''}">${
          settled ? lowGrade : `${lowGrade}–${highGrade}`
        }</span>
        <span class="stat-row-num">${low}–${high}</span>
      </button>`;
  }).join('');
}

/**
 * Makes the rows tap-to-reveal, per §3.
 *
 * Tapping one row reveals every number rather than just that row's: the point
 * is switching the whole readout between grades and figures, not inspecting
 * stats one at a time.
 */
export function attachStatReveal(root: HTMLElement): () => void {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('.stat-row'));
  if (rows.length === 0) return () => {};

  const toggle = (): void => {
    const revealing = !rows[0]!.classList.contains('revealed');
    rows.forEach((row) => row.classList.toggle('revealed', revealing));
  };

  rows.forEach((row) => row.addEventListener('click', toggle));

  return () => rows.forEach((row) => row.removeEventListener('click', toggle));
}
