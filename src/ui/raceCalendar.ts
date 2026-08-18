import { createRng } from '../sim/rng.js';
import type { Division } from '../data/index.js';
import { DIVISION_DISTANCES } from '../data/index.js';
import { getPurse } from '../data/purse.js';

export interface RaceOption {
  id: string;
  name: string;
  distance: number;
  going: 'firm' | 'good' | 'soft' | 'heavy';
  hype: number;
  isPromotion?: boolean;
  isDemotion?: boolean;
  /**
   * The Championship's own decider — Championship has no division above it to
   * be promoted into, so filling the ladder there earns this instead of an
   * ordinary promotion race. `isPromotion` is deliberately not reused for it:
   * they read the same field-population logic downstream (there is nowhere
   * higher to draw from either), but the label, the notice copy and the
   * Championship Victory trigger all need to tell the two apart.
   */
  isChampionshipRace?: boolean;
}

export interface RaceCalendarOptions {
  division?: Division;
  isPromotionReady?: boolean;
  isDemotionRisk?: boolean;
  /** Championship, ladder filled, title not yet won. See `isChampionshipRace`. */
  isChampionshipReady?: boolean;
}

export function generateRaceCalendar(seed: string, opts: RaceCalendarOptions = {}): RaceOption[] {
  const rng = createRng(seed);
  const { division, isPromotionReady, isDemotionRisk, isChampionshipReady } = opts;

  const regularNames = [
    'Morning Glory Stakes',
    'Midnight Cup',
    'Rising Star Handicap',
    'Golden Mile',
    'Silverwood Chase',
    'Thunder Ridge Stakes',
    'Twilight Cup',
    'Dawn Breaker Handicap',
  ];

  const promotionNames = [
    'Championship Qualifier',
    'Promotion Test',
    'Class Advancement',
    'Tier Challenge',
  ];

  const demotionNames = [
    'Division Qualifier',
    'Survival Race',
    'Hold Your Ground',
    'Last Chance Derby',
  ];

  const championshipNames = [
    'The Championship',
    'Championship Decider',
    'Title Race',
    'Grand Final',
  ];

  // Generate distance range based on division, or use default if not provided
  const distanceRange = division ? DIVISION_DISTANCES[division] : { min: 800, max: 2000 };
  const distanceStep = 100;
  const distances: number[] = [];
  for (let d = distanceRange.min; d <= distanceRange.max; d += distanceStep) {
    distances.push(d);
  }

  const goingTypes: Array<'firm' | 'good' | 'soft' | 'heavy'> = ['firm', 'good', 'soft', 'heavy'];

  const races: RaceOption[] = [];

  // Championship has nowhere higher to promote into, so a filled ladder there
  // earns the title decider instead — checked ahead of isPromotionReady, though
  // the two can never both be true (isPromotionReady is gated below level 4).
  if (isChampionshipReady) {
    races.push({
      id: 'race-championship',
      name: championshipNames[Math.floor(rng.next() * championshipNames.length)]!,
      distance: distances[Math.floor(rng.next() * distances.length)]!,
      going: goingTypes[Math.floor(rng.next() * goingTypes.length)]!,
      hype: 0.85 + rng.next() * 0.15,
      isChampionshipRace: true,
    });
    return races;
  }

  // If promotion ready, show only promotion race
  if (isPromotionReady) {
    races.push({
      id: 'race-promotion',
      name: promotionNames[Math.floor(rng.next() * promotionNames.length)]!,
      distance: distances[Math.floor(rng.next() * distances.length)]!,
      going: goingTypes[Math.floor(rng.next() * goingTypes.length)]!,
      hype: 0.7 + rng.next() * 0.3, // Higher hype for promotion race
      isPromotion: true,
    });
    return races;
  }

  // If demotion risk, show only demotion race
  if (isDemotionRisk) {
    races.push({
      id: 'race-demotion',
      name: demotionNames[Math.floor(rng.next() * demotionNames.length)]!,
      distance: distances[Math.floor(rng.next() * distances.length)]!,
      going: goingTypes[Math.floor(rng.next() * goingTypes.length)]!,
      hype: 0.6 + rng.next() * 0.4, // Medium-high hype for demotion race
      isDemotion: true,
    });
    return races;
  }

  // Normal week: generate 3 regular races
  for (let i = 0; i < 3; i++) {
    races.push({
      id: `race-${i}`,
      name: regularNames[Math.floor(rng.next() * regularNames.length)]!,
      distance: distances[Math.floor(rng.next() * distances.length)]!,
      going: goingTypes[Math.floor(rng.next() * goingTypes.length)]!,
      hype: 0.3 + rng.next() * 0.7, // Range from 0.3 to 1.0
    });
  }

  return races;
}

/**
 * `seed` is supplied by the caller and must stay **stable while the choice is
 * open**. This used to be `calendar-${Date.now()}`, which meant every mount
 * rolled a fresh set — so backing out of a race and coming back rerolled the
 * offers, and the calendar's whole point is committing to a distance and a date
 * rather than shopping until something suits.
 *
 * The career supplies a key built from the horse's start count and the
 * career's week, which holds across a round trip and moves on once a race —
 * or a rest week — has actually happened.
 *
 * `onBack`, when given, offers "Rest Instead" — but only on an ordinary week.
 * A promotion, demotion or championship decider is the one race that has to
 * stay put: resting to duck it would let the ladder's whole point be
 * indefinitely postponed, so those weeks render with no way out but picking
 * the single race shown.
 */
export function mountRaceCalendar(
  container: HTMLElement,
  onSelectRace: (race: RaceOption) => void,
  seed: string,
  opts: RaceCalendarOptions = {},
  onBack?: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'race-calendar';

  const races = generateRaceCalendar(seed, opts);
  const isSpecialWeek = Boolean(opts.isPromotionReady || opts.isDemotionRisk || opts.isChampionshipReady);
  const showBackButton = Boolean(onBack) && !isSpecialWeek;

  root.innerHTML = `
    <div class="calendar-container">
      <div class="calendar-header">
        <h2>Race Calendar</h2>
        <p class="calendar-subtitle">Select a race to enter</p>
      </div>

      <div class="races-list">
        ${races
          .map(
            (race) => `
          <button class="race-card ${race.isPromotion ? 'race-promotion' : ''} ${race.isDemotion ? 'race-demotion' : ''} ${race.isChampionshipRace ? 'race-championship' : ''}" data-race-id="${race.id}">
            <div class="race-card-main">
              ${race.isChampionshipRace ? '<div class="race-badge championship">🏆 Championship</div>' : ''}
              ${race.isPromotion ? '<div class="race-badge promotion">🏆 Promotion</div>' : ''}
              ${race.isDemotion ? '<div class="race-badge demotion">⚠️ Demotion Risk</div>' : ''}
              <h3>${race.name}</h3>
              <p class="race-distance">${race.distance}m</p>
            </div>
            <div class="race-card-details">
              <div class="race-detail">
                <span class="detail-label">Going</span>
                <span class="detail-value going-${race.going}">${race.going}</span>
              </div>
              <div class="race-detail">
                <span class="detail-label">Difficulty</span>
                <span class="difficulty-bars">
                  ${Array.from({ length: 5 })
                    .map((_, i) => `<span class="bar ${i < Math.round(race.hype * 5) ? 'filled' : ''}"></span>`)
                    .join('')}
                </span>
              </div>
              <div class="race-detail">
                <span class="detail-label">Purse</span>
                <span class="detail-value">$${getPurse(opts.division ?? 'maiden', race.hype).toLocaleString()}</span>
              </div>
            </div>
          </button>
        `,
          )
          .join('')}
      </div>

      ${showBackButton ? '<button type="button" class="calendar-back-btn" id="calendar-back-btn">None of these — rest instead</button>' : ''}
    </div>
  `;

  container.appendChild(root);

  const raceCards = root.querySelectorAll<HTMLButtonElement>('.race-card');
  raceCards.forEach((card) => {
    card.addEventListener('click', () => {
      const raceId = card.dataset.raceId as string;
      const race = races.find((r) => r.id === raceId)!;
      onSelectRace(race);
    });
  });

  if (showBackButton) {
    root.querySelector<HTMLButtonElement>('#calendar-back-btn')?.addEventListener('click', () => onBack!());
  }

  return () => {
    root.remove();
  };
}
