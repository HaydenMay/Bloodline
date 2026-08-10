import type { Horse } from '../sim/types.js';
import type { Division, RunningStyle } from '../data/index.js';
import { RUNNING_STYLES } from '../data/index.js';
import { createRng } from '../sim/index.js';

export interface TestCareerConfig {
  horseName: string;
  style: string;
  division: Division;
  divisionPoints: number;
  speed: number;
  stamina: number;
  burst: number;
  grit: number;
  temper: number;
  consistency: number;
  age: number;
}

const DIVISIONS: Division[] = ['maiden', 'novice', 'open', 'stakes', 'championship'];

const PRESETS = {
  almostPromoted: {
    horseName: 'Test Horse',
    style: 'stalker',
    division: 'open',
    divisionPoints: 4,
    speed: 55,
    stamina: 52,
    burst: 50,
    grit: 58,
    temper: 61,
    consistency: 59,
    age: 3,
  },
  atRisk: {
    horseName: 'Risk Taker',
    style: 'closer',
    division: 'open',
    divisionPoints: -2,
    speed: 48,
    stamina: 50,
    burst: 45,
    grit: 52,
    temper: 55,
    consistency: 51,
    age: 4,
  },
  freshStart: {
    horseName: 'New Prospect',
    style: 'frontRunner',
    division: 'maiden',
    divisionPoints: 0,
    speed: 30,
    stamina: 28,
    burst: 26,
    grit: 32,
    temper: 35,
    consistency: 30,
    age: 2,
  },
  stakesMidfield: {
    horseName: 'Stakes Runner',
    style: 'midPack',
    division: 'stakes',
    divisionPoints: 2,
    speed: 62,
    stamina: 60,
    burst: 58,
    grit: 65,
    temper: 64,
    consistency: 63,
    age: 4,
  },
} as const;

export function mountTestCareerSetup(
  container: HTMLElement,
  onStartCareer: (horse: Horse, config: TestCareerConfig) => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'test-career-setup';

  let currentConfig: TestCareerConfig = { ...PRESETS.almostPromoted };

  root.innerHTML = `
    <div class="test-setup-container">
      <h1>Test Career Setup</h1>
      <p class="subtitle">Configure a custom starting horse and division state for testing</p>

      <div class="setup-presets">
        <h3>Quick Presets</h3>
        <div class="preset-buttons">
          ${Object.entries(PRESETS)
            .map(
              ([key, _preset]) => `
            <button class="preset-btn" data-preset="${key}">
              ${key
                .replace(/([A-Z])/g, ' $1')
                .trim()
                .split(' ')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ')}
            </button>
          `,
            )
            .join('')}
        </div>
      </div>

      <div class="setup-form">
        <h3>Custom Settings</h3>

        <div class="form-row">
          <div class="form-group">
            <label>Horse Name</label>
            <input type="text" id="horse-name" value="${currentConfig.horseName}" />
          </div>
          <div class="form-group">
            <label>Running Style</label>
            <select id="horse-style">
              ${RUNNING_STYLES.map((style) => `<option value="${style}" ${style === currentConfig.style ? 'selected' : ''}>${style}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Age</label>
            <input type="number" id="horse-age" min="2" max="5" value="${currentConfig.age}" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Division</label>
            <select id="division">
              ${DIVISIONS.map((div) => `<option value="${div}" ${div === currentConfig.division ? 'selected' : ''}>${div}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Division Points (-3 to +5)</label>
            <input type="number" id="division-points" min="-3" max="5" value="${currentConfig.divisionPoints}" />
          </div>
        </div>

        <h4>Stats (0-100)</h4>
        <div class="stats-grid">
          ${(['speed', 'stamina', 'burst', 'grit', 'temper', 'consistency'] as const)
            .map(
              (stat) => `
            <div class="form-group">
              <label>${stat.charAt(0).toUpperCase() + stat.slice(1)}</label>
              <input type="range" id="stat-${stat}" min="0" max="100" value="${currentConfig[stat]}" class="stat-slider" />
              <span class="stat-value" data-stat="${stat}">${currentConfig[stat]}</span>
            </div>
          `,
            )
            .join('')}
        </div>
      </div>

      <div class="setup-actions">
        <button class="btn btn-primary" id="start-btn">Start Test Career</button>
        <button class="btn btn-secondary" id="cancel-btn">Cancel</button>
      </div>
    </div>
  `;

  container.appendChild(root);

  // Preset buttons
  root.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const presetKey = (e.target as HTMLElement).dataset.preset as keyof typeof PRESETS;
      currentConfig = { ...PRESETS[presetKey] };
      updateFormFromConfig();
    });
  });

  // Stat sliders
  root.querySelectorAll('.stat-slider').forEach((slider) => {
    slider.addEventListener('input', (e) => {
      const statName = (e.target as HTMLInputElement).id.replace('stat-', '');
      const value = parseInt((e.target as HTMLInputElement).value);
      (currentConfig as unknown as Record<string, number>)[statName] = value;
      root.querySelector(`[data-stat="${statName}"]`)!.textContent = String(value);
    });
  });

  // Form inputs
  const updateConfig = () => {
    currentConfig.horseName = (root.querySelector('#horse-name') as HTMLInputElement).value;
    currentConfig.style = (root.querySelector('#horse-style') as HTMLSelectElement).value;
    currentConfig.age = parseInt((root.querySelector('#horse-age') as HTMLInputElement).value);
    currentConfig.division = (root.querySelector('#division') as HTMLSelectElement).value as Division;
    currentConfig.divisionPoints = parseInt(
      (root.querySelector('#division-points') as HTMLInputElement).value,
    );
  };

  function updateFormFromConfig() {
    (root.querySelector('#horse-name') as HTMLInputElement).value = currentConfig.horseName;
    (root.querySelector('#horse-style') as HTMLSelectElement).value = currentConfig.style;
    (root.querySelector('#horse-age') as HTMLInputElement).value = String(currentConfig.age);
    (root.querySelector('#division') as HTMLSelectElement).value = currentConfig.division;
    (root.querySelector('#division-points') as HTMLInputElement).value = String(
      currentConfig.divisionPoints,
    );

    (
      ['speed', 'stamina', 'burst', 'grit', 'temper', 'consistency'] as const
    ).forEach((stat) => {
      const slider = root.querySelector(`#stat-${stat}`) as HTMLInputElement;
      const value = root.querySelector(`[data-stat="${stat}"]`)!;
      slider.value = String(currentConfig[stat]);
      value.textContent = String(currentConfig[stat]);
    });
  }

  // Start button
  root.querySelector('#start-btn')!.addEventListener('click', () => {
    updateConfig();

    // Create a custom horse from the config
    const rng = createRng('test-career-' + Date.now());

    const horse: Horse = {
      id: `h${Math.floor(rng.next() * 0xffffffff).toString(36)}`,
      name: currentConfig.horseName,
      gender: rng.chance(0.5) ? 'stallion' : 'mare',
      age: currentConfig.age,
      stats: {
        speed: currentConfig.speed,
        stamina: currentConfig.stamina,
        burst: currentConfig.burst,
        grit: currentConfig.grit,
        temper: currentConfig.temper,
        consistency: currentConfig.consistency,
      },
      potential: {
        speed: Math.min(100, currentConfig.speed + 20),
        stamina: Math.min(100, currentConfig.stamina + 20),
        burst: Math.min(100, currentConfig.burst + 20),
        grit: Math.min(100, currentConfig.grit + 20),
        temper: Math.min(100, currentConfig.temper + 20),
        consistency: Math.min(100, currentConfig.consistency + 20),
      },
      style: currentConfig.style as RunningStyle,
      moment: 'late',
      preferredDistance: { min: 1200, max: 1800 },
      traits: [],
      condition: 75,
      morale: 65,
      division: currentConfig.division,
      divisionLevel: DIVISIONS.indexOf(currentConfig.division),
      divisionPoints: currentConfig.divisionPoints,
      starts: 0,
      wins: 0,
      places: 0,
      shows: 0,
      coat: 'bay',
      jockeySkill: 60,
    };

    onStartCareer(horse, currentConfig);
  });

  // Cancel button
  root.querySelector('#cancel-btn')!.addEventListener('click', () => {
    root.remove();
  });

  return () => {
    root.remove();
  };
}
