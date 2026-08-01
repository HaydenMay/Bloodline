import { toGrade, STAT_KEYS, type Horse, type StatKey } from '../sim/types.js';
import { TRAITS } from '../data/traits.js';
import { STYLE_PROFILES } from '../sim/race/constants.js';
import { coatFor } from '../render/palette.js';

/**
 * The horse card.
 *
 * Letter grades for scanning, exact numbers alongside for when you are actually
 * planning (DESIGN.md §3). Potential is deliberately shown as a RANGE, never a
 * number — it is the thing that unfolds over a career, and spoiling it removes
 * the reason to keep training.
 *
 * Used here as a hover card on the race bar; Phase 3 reuses it wherever a horse
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

const STYLE_LABELS: Record<string, { name: string; seat: string }> = {
  frontRunner: { name: 'Front-runner', seat: 'Likes to lead' },
  stalker: { name: 'Stalker', seat: 'Tracks the pace' },
  midPack: { name: 'Mid-pack', seat: 'Sits mid-pack' },
  closer: { name: 'Closer', seat: 'Comes from behind' },
};

function momentLabel(kickAt: number): string {
  if (kickAt < 0.35) return 'From the gate';
  if (kickAt < 0.62) return 'Down the back';
  if (kickAt < 0.81) return 'Round the turn';
  return 'In the straight';
}

/** Potential shown as a band, since the exact ceiling is never revealed. */
function potentialBand(current: number, potential: number): string {
  const room = potential - current;
  if (room < 12) return 'close to its ceiling';
  if (room < 26) return 'some room left';
  if (room < 42) return 'plenty of room';
  return 'barely scratched';
}

export function renderHorseCard(horse: Horse): string {
  const style = STYLE_LABELS[horse.style] ?? STYLE_LABELS['closer']!;
  const profile = STYLE_PROFILES[horse.style];
  const coat = coatFor(horse.coat);

  const stats = STAT_KEYS.map((key) => {
    const value = horse.stats[key];
    const grade = toGrade(value);
    return `
      <div class="hc-stat">
        <span class="hc-stat-name">${STAT_LABELS[key]}</span>
        <span class="hc-bar"><i style="width:${value}%"></i></span>
        <span class="hc-grade hc-g${grade}">${grade}</span>
        <span class="hc-num">${value}</span>
      </div>`;
  }).join('');

  const aptitudes = (['sprint', 'mile', 'route'] as const)
    .map(
      (band) => `
      <div class="hc-apt">
        <span>${band}</span>
        <b class="hc-g${toGrade(horse.aptitudes[band])}">${toGrade(horse.aptitudes[band])}</b>
      </div>`,
    )
    .join('');

  const traits = horse.traits.length
    ? horse.traits
        .map((id) => `<span class="hc-trait" title="${TRAITS[id].description}">${TRAITS[id].name}</span>`)
        .join('')
    : '<span class="hc-trait hc-none">None discovered</span>';

  const speedRoom = potentialBand(horse.stats.speed, horse.potential.speed);

  return `
    <div class="hc-head">
      <span class="hc-swatch" style="background:${coat.body};border-color:${coat.hair}"></span>
      <div>
        <p class="hc-name">${horse.name}</p>
        <p class="hc-sub">${coat.name} ${horse.gender === 'stallion' ? 'colt' : 'filly'} · ${horse.age}yo</p>
      </div>
    </div>

    <div class="hc-row">
      <div><span class="hc-k">Style</span><span class="hc-v">${style.name}</span></div>
      <div><span class="hc-k">Runs</span><span class="hc-v">${style.seat.toLowerCase()}</span></div>
      <div><span class="hc-k">Moment</span><span class="hc-v hc-accent">${momentLabel(profile.kickAt)}</span></div>
    </div>

    <p class="hc-section">Attributes</p>
    ${stats}
    <p class="hc-hint">Potential: ${speedRoom}</p>

    <p class="hc-section">Distance</p>
    <div class="hc-apts">${aptitudes}</div>

    <p class="hc-section">Traits</p>
    <div class="hc-traits">${traits}</div>
  `;
}

/** Attaches a hover/tap card to a trigger element. */
export function attachHorseCard(trigger: HTMLElement, horse: Horse): () => void {
  const card = document.createElement('div');
  card.className = 'horse-card';
  card.hidden = true;
  card.innerHTML = renderHorseCard(horse);
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
  // holding the cursor still. Pinned cards accept the mouse so links and
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
