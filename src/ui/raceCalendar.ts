import { createRng } from '../sim/rng.js';

export interface RaceOption {
  id: string;
  name: string;
  distance: number;
  going: 'firm' | 'good' | 'soft' | 'heavy';
  hype: number;
}

export function generateRaceCalendar(seed: string): RaceOption[] {
  const rng = createRng(seed);

  const names = [
    'Morning Glory Stakes',
    'Midnight Cup',
    'Rising Star Handicap',
    'Golden Mile',
    'Silverwood Chase',
    'Thunder Ridge Stakes',
    'Twilight Cup',
    'Dawn Breaker Handicap',
  ];

  const distances = [800, 1000, 1200, 1400, 1600, 1800, 2000];
  const goingTypes: Array<'firm' | 'good' | 'soft' | 'heavy'> = ['firm', 'good', 'soft', 'heavy'];

  const races: RaceOption[] = [];
  for (let i = 0; i < 3; i++) {
    races.push({
      id: `race-${i}`,
      name: names[Math.floor(rng.next() * names.length)]!,
      distance: distances[Math.floor(rng.next() * distances.length)]!,
      going: goingTypes[Math.floor(rng.next() * goingTypes.length)]!,
      hype: 0.3 + rng.next() * 0.7, // Range from 0.3 to 1.0
    });
  }

  return races;
}

export function mountRaceCalendar(
  container: HTMLElement,
  onSelectRace: (race: RaceOption) => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'race-calendar';

  const races = generateRaceCalendar(`calendar-${Date.now()}`);

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
          <button class="race-card" data-race-id="${race.id}">
            <div class="race-card-main">
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
            </div>
          </button>
        `,
          )
          .join('')}
      </div>
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

  return () => {
    root.remove();
  };
}
