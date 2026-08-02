import { toGrade, STAT_KEYS, type Horse, type StatKey } from '../sim/types.js';
import { TRAITS } from '../data/traits.js';
import type { Moment } from '../data/index.js';
import { coatFor } from '../render/palette.js';

/**
 * The info box.
 *
 * Letter grades for scanning, exact numbers alongside for when you are actually
 * planning (DESIGN.md §3). Potential is deliberately shown as a RANGE, never a
 * number — it is the thing that unfolds over a career, and spoiling it removes
 * the reason to keep training.
 *
 * Used here as a hover box on the race bar; Phase 3 reuses it wherever a horse
 * needs describing.
 */

const STAT_LABELS: Record<StatKey, string> = {
  speed: 'Speed',
  stamina: 'Stamina',
  burst: 'Burst',
  grit: 'Grit',
  temper: 'Temper',
  consistency: 'Consistency',
};

// Field-position language only — Moment (labeled separately below) is what
// now controls WHEN a horse's kick window falls, so this must never describe
// timing or it reads as contradicting the Moment label.
const STYLE_LABELS: Record<string, { name: string; seat: string }> = {
  frontRunner: { name: 'Front-runner', seat: 'Runs up front' },
  stalker: { name: 'Stalker', seat: 'Sits just off the pace' },
  midPack: { name: 'Mid-pack', seat: 'Settles mid-field' },
  closer: { name: 'Closer', seat: 'Settles at the back' },
};

/** Named after the part of the track where this Moment's window falls. */
function momentLabel(moment: Moment): string {
  switch (moment) {
    case 'early':
      return 'From the gate';
    case 'earlyMid':
      return 'Down the back';
    case 'midLate':
      return 'Round the turn';
    case 'late':
      return 'In the straight';
  }
}

/** Potential shown as a band, since the exact ceiling is never revealed. */
function potentialBand(current: number, potential: number): string {
  const room = potential - current;
  if (room < 12) return 'close to its ceiling';
  if (room < 26) return 'some room left';
  if (room < 42) return 'plenty of room';
  return 'barely scratched';
}

export function renderInfoBox(horse: Horse): string {
  const style = STYLE_LABELS[horse.style] ?? STYLE_LABELS['closer']!;
  const coat = coatFor(horse.coat);

  const stats = STAT_KEYS.map((key) => {
    const value = horse.stats[key];
    const grade = toGrade(value);
    return `
      <div class="ib-stat">
        <span class="ib-stat-name">${STAT_LABELS[key]}</span>
        <span class="ib-bar"><i style="width:${value}%"></i></span>
        <span class="ib-grade ib-g${grade}">${grade}</span>
        <span class="ib-num">${value}</span>
      </div>`;
  }).join('');

  const aptitudes = (['sprint', 'mile', 'route'] as const)
    .map(
      (band) => `
      <div class="ib-apt">
        <span>${band}</span>
        <b class="ib-g${toGrade(horse.aptitudes[band])}">${toGrade(horse.aptitudes[band])}</b>
      </div>`,
    )
    .join('');

  const traits = horse.traits.length
    ? horse.traits
        .map(
          (id) =>
            `<span class="ib-trait">${TRAITS[id].name}` +
            `<span class="ib-tip">${TRAITS[id].description}</span></span>`,
        )
        .join('')
    : '<span class="ib-trait ib-none">None discovered</span>';

  const speedRoom = potentialBand(horse.stats.speed, horse.potential.speed);

  return `
    <div class="ib-head">
      <span class="ib-swatch" style="background:${coat.body};border-color:${coat.hair}"></span>
      <div>
        <p class="ib-name">${horse.name}</p>
        <p class="ib-sub">${coat.name} ${horse.gender === 'stallion' ? 'colt' : 'filly'} · ${horse.age}yo</p>
      </div>
    </div>

    <div class="ib-row">
      <div><span class="ib-k">Style</span><span class="ib-v">${style.name}</span></div>
      <div><span class="ib-k">Runs</span><span class="ib-v">${style.seat.toLowerCase()}</span></div>
      <div><span class="ib-k">Moment</span><span class="ib-v ib-accent">${momentLabel(horse.moment)}</span></div>
    </div>

    <p class="ib-section">Attributes</p>
    ${stats}
    <p class="ib-hint">Potential: ${speedRoom}</p>

    <p class="ib-section">Distance</p>
    <div class="ib-apts">${aptitudes}</div>

    <p class="ib-section">Traits</p>
    <div class="ib-traits">${traits}</div>
  `;
}

/** Attaches a hover/tap card to a trigger element. */
export function attachInfoBox(trigger: HTMLElement, horse: Horse): () => void {
  const card = document.createElement('div');
  card.className = 'info-box';
  card.hidden = true;
  card.innerHTML = renderInfoBox(horse);
  document.body.appendChild(card);

  const place = (): void => {
    const r = trigger.getBoundingClientRect();
    card.hidden = false;
    const cardRect = card.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, r.left),
      Math.max(8, window.innerWidth - cardRect.width - 8),
    );
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(8, r.top - cardRect.height - 10)}px`;
  };

  // Hovering peeks; clicking PINS it open so you can read it properly without
  // holding the cursor still. Pinned boxes accept the mouse so links and
  // tooltips inside them work.
  let pinned = false;

  const show = (): void => {
    if (!pinned) place();
  };
  const hide = (): void => {
    if (!pinned) card.hidden = true;
  };
  const setPinned = (value: boolean): void => {
    pinned = value;
    card.classList.toggle('is-pinned', value);
    card.style.pointerEvents = value ? 'auto' : 'none';
    if (value) place();
    else card.hidden = true;
  };

  const onTriggerClick = (e: Event): void => {
    e.stopPropagation();
    setPinned(!pinned);
  };
  const onDocClick = (e: Event): void => {
    if (pinned && !card.contains(e.target as Node)) setPinned(false);
  };

  trigger.addEventListener('pointerenter', show);
  trigger.addEventListener('pointerleave', hide);
  trigger.addEventListener('click', onTriggerClick);
  document.addEventListener('click', onDocClick);

  return (): void => {
    trigger.removeEventListener('pointerenter', show);
    trigger.removeEventListener('pointerleave', hide);
    trigger.removeEventListener('click', onTriggerClick);
    document.removeEventListener('click', onDocClick);
    card.remove();
  };
}
