import './style.css';
import { createRng } from './sim/index.js';
import { createNameGenerator } from './data/names.js';
import { generateHorse } from './sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from './data/index.js';
import type { RunnerSnapshot } from './sim/race/engine.js';
import { attachInfoBox } from './ui/infoBox.js';
import { mountRaceScreen } from './ui/raceScreen.js';
import { mountHorsePreview } from './ui/horsePreview.js';
import { mountSilksDemo } from './ui/silksDemo.js';
import { mountRoadmap } from './ui/roadmap.js';
import { mountMainMenu, type MainMenuCallbacks } from './ui/mainMenu.js';
import { mountStarterSelection } from './ui/starterSelection.js';
import { mountResultsScreen } from './ui/resultsScreen.js';
import { mountTrainingScreen } from './ui/trainingScreen.js';
import { mountRaceCalendar, type RaceOption } from './ui/raceCalendar.js';
import { loadCareer, saveCareer, createNewCareer, type Career } from './ui/career.js';
import type { Horse } from './sim/types.js';
import type { Silks } from './render/palette.js';

/**
 * Phase 2 harness screen.
 *
 * Builds a field and drops you straight into a race, so the renderer and the
 * DRIVE control can be judged on their own before careers exist to wrap them.
 * Replaced by the real career flow in Phase 3.
 */

/**
 * Demo distance. Most races in the game are 600-900 m; 1400 is a middle-
 * distance test that shows every style doing its job inside ~70 s.
 */
const RACE_METRES = 1400;

const appEl = document.querySelector<HTMLDivElement>('#app');
if (!appEl) throw new Error('#app not found');
const app: HTMLDivElement = appEl;

let teardown: (() => void) | null = null;
let autopilot = false;

function buildField(seed: string): { field: Horse[]; playerId: string } {
  const rng = createRng(seed);
  const names = createNameGenerator(rng);

  const field: Horse[] = Array.from({ length: FIELD_SIZE }, (_, i) => {
    const horse = generateHorse(rng, names, {
      division: 'open',
      style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
      age: 4,
    });
    return horse;
  });

  // Draw the player at random, otherwise field[0] always lands on the first
  // style in the list and you are a front-runner in every single race.
  const playerIndex = Math.floor(rng.next() * field.length);
  return { field, playerId: field[playerIndex]!.id };
}

function startRace(seed: string): void {
  teardown?.();
  app.innerHTML = '';

  const { field, playerId } = buildField(seed);
  const player = field.find((h) => h.id === playerId)!;

  const stage = document.createElement('div');
  stage.className = 'stage';
  app.appendChild(stage);

  const bar = document.createElement('div');
  bar.className = 'racebar';

  // No moment WINDOW is drawn any more: Moment selects a pace-curve shape, not
  // a window (REBUILD.md §6), so there is nothing to mark on a timeline. What
  // the player needs instead is what trip the horse wants.
  bar.innerHTML = `
    <div class="rb-horse">
      <span class="rb-name">${player.name}</span>
      <span class="rb-style">${styleLabel(player.style)} · ${momentLabel(player.moment)}</span>
    </div>
    <div class="rb-moment">
      <span class="rb-moment-label">Preferred length</span>
      <span class="rb-pref">${player.preferredDistance.min}–${player.preferredDistance.max} m</span>
    </div>
    <div class="rb-controls">
      <label class="rb-autopilot">
        <input type="checkbox" id="autopilot-toggle" ${autopilot ? 'checked' : ''}>
        <span>Autopilot</span>
      </label>
    </div>
    <div class="rb-hint" id="rb-hint-text">Tap to <b>KICK</b> · hold to <b>TAKE A PULL</b></div>
    <button class="rb-again">New race</button>
  `;
  app.appendChild(bar);

  // Check for color overrides from demo mode
  let playerSilks = { primary: '#A8DADC', secondary: '#12222B' };

  const colorOverride = sessionStorage.getItem('color-override');
  if (colorOverride) {
    try {
      const colors = JSON.parse(colorOverride);
      // The demo's silks pair: primary is the jockey and the shield, secondary
      // is the breeches and collar. Mane and points travel with the coat, not
      // with the silks, so they are not carried here.
      playerSilks = {
        primary: colors.silksColor || '#A8DADC',
        secondary: colors.trimColor || colors.maneColor || '#12222B',
      };
      sessionStorage.removeItem('color-override');
    } catch {
      // Ignore invalid JSON
    }
  }

  attachInfoBox(bar.querySelector<HTMLElement>('.rb-horse')!, player, playerSilks);

  const autopilotToggle = bar.querySelector<HTMLInputElement>('#autopilot-toggle')!;
  const hintText = bar.querySelector<HTMLElement>('#rb-hint-text')!;

  autopilotToggle.addEventListener('change', (e) => {
    autopilot = (e.target as HTMLInputElement).checked;
    hintText.innerHTML = autopilot
      ? 'Watch the race · autopilot is on'
      : 'Tap to <b>KICK</b> · hold to <b>TAKE A PULL</b>';
  });

  bar.querySelector('.rb-again')!.addEventListener('click', (e) => {
    e.stopPropagation();
    startRace(`race-${Math.floor(Math.random() * 1e9)}`);
  });

  teardown = mountRaceScreen({
    host: stage,
    field,
    playerHorseId: playerId,
    playerSilks,
    config: { metres: RACE_METRES, going: 'good', hype: 0.65, seed: `${seed}-run` },
    autopilotToggle,
    onRaceStart: () => {
      // Lock autopilot once race starts — can't change during race
      autopilotToggle.disabled = true;
    },
  });
}

function momentLabel(moment: string): string {
  switch (moment) {
    case 'early':
      return 'goes early';
    case 'earlyMid':
      return 'goes before halfway';
    case 'midLate':
      return 'goes off the turn';
    default:
      return 'goes late';
  }
}

function styleLabel(style: string): string {
  switch (style) {
    case 'frontRunner':
      return 'Front-runner';
    case 'stalker':
      return 'Stalker';
    case 'midPack':
      return 'Mid-pack';
    default:
      return 'Closer';
  }
}

// Development routes
const params = new URLSearchParams(location.search);
if (params.has('preview')) {
  // ?preview opens the horse preview
  const stage = document.createElement('div');
  stage.className = 'stage stage-full';
  app.appendChild(stage);
  mountHorsePreview(stage);
} else if (params.has('silks-demo')) {
  // ?silks-demo opens the silks color picker
  mountSilksDemo(app);
} else if (params.has('test-race')) {
  // ?test-race opens the test race (development harness)
  startRace('bloodline-demo');
} else if (params.has('roadmap')) {
  // ?roadmap opens the build-progress panel — kept off every real game
  // screen so it never collides with game chrome (the starter carousel's
  // header sat directly under its fixed top-right pill).
  mountRoadmap();
} else {
  // Default: main menu → starter selection → career
  showMainMenu();
}

function showMainMenu(): void {
  teardown?.();
  app.innerHTML = '';

  const savedCareer = loadCareer();

  const callbacks: MainMenuCallbacks = {
    onNewGame: () => {
      teardownMenu();
      showStarterSelection();
    },
    ...(savedCareer && {
      onContinue: () => {
        teardownMenu();
        resumeCareer(savedCareer);
      },
    }),
  };

  const teardownMenu = mountMainMenu(app, callbacks);
}

function showStarterSelection(): void {
  teardown?.();
  app.innerHTML = '';

  teardown = mountStarterSelection(app, (selectedHorse, selectedSilks) => {
    startCareer(selectedHorse, selectedSilks);
  });
}

function startCareer(starterHorse: Horse, playerSilks: Silks): void {
  // Create new career with selected starter
  const career = createNewCareer(starterHorse, playerSilks);
  saveCareer(career);
  showTrainingScreen(career);
}

function resumeCareer(career: Career): void {
  // Resume existing career
  showTrainingScreen(career);
}

function showTrainingScreen(career: Career): void {
  teardown?.();
  app.innerHTML = '';

  teardown = mountTrainingScreen(app, career.horse, (updatedHorse, _session) => {
    const updatedCareer = { ...career, horse: updatedHorse };
    saveCareer(updatedCareer);
    showRaceCalendar(updatedCareer);
  });
}

function showRaceCalendar(career: Career): void {
  teardown?.();
  app.innerHTML = '';

  teardown = mountRaceCalendar(app, (race) => {
    startRaceWithHorse(career, race);
  });
}

function startRaceWithHorse(career: Career, race?: RaceOption): void {
  const player = career.horse;
  const raceDistance = race?.distance || 1400;
  const raceGoing = race?.going || 'good';
  const raceHype = race?.hype || 0.5;
  const rng = createRng('career-seed-' + Date.now());
  const names = createNameGenerator(rng);

  // Build a field around the player
  const field: Horse[] = [player];
  for (let i = 1; i < FIELD_SIZE; i++) {
    const rival = generateHorse(rng, names, {
      division: 'maiden',
      style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
      age: 2,
    });
    field.push(rival);
  }

  teardown?.();
  app.innerHTML = '';

  const stage = document.createElement('div');
  stage.className = 'stage';
  app.appendChild(stage);

  const bar = document.createElement('div');
  bar.className = 'racebar';

  bar.innerHTML = `
    <div class="rb-horse">
      <span class="rb-name">${player.name}</span>
      <span class="rb-style">${styleLabel(player.style)} · ${momentLabel(player.moment)}</span>
    </div>
    <div class="rb-moment">
      <span class="rb-moment-label">Preferred length</span>
      <span class="rb-pref">${player.preferredDistance.min}–${player.preferredDistance.max} m</span>
    </div>
    <div class="rb-controls">
      <label class="rb-autopilot">
        <input type="checkbox" id="autopilot-toggle">
        Autopilot
      </label>
    </div>
    <div class="rb-callout" id="callout"></div>
  `;
  app.appendChild(bar);

  const autopilotToggle = bar.querySelector<HTMLInputElement>('#autopilot-toggle')!;
  const hintText = bar.querySelector<HTMLDivElement>('.rb-callout')!;

  hintText.innerHTML = 'Tap or hold spacebar to kick · hold tap to take a pull';

  autopilotToggle.addEventListener('change', (e) => {
    hintText.innerHTML = (e.target as HTMLInputElement).checked
      ? 'Watch the race · autopilot is on'
      : 'Tap or hold spacebar to kick · hold tap to take a pull';
  });

  const onFinish = (placings: RunnerSnapshot[]): void => {
    teardown?.();
    app.innerHTML = '';

    // Update career stats based on race result
    const playerIndex = placings.findIndex((p) => p.id === player.id);
    const updatedCareer = { ...career };

    if (playerIndex === 0) {
      updatedCareer.stats.wins += 1;
      updatedCareer.stats.totalEarnings += 1000; // TODO: Dynamic earnings
    } else {
      updatedCareer.stats.losses += 1;
    }

    updatedCareer.week += 1;
    saveCareer(updatedCareer);

    const teardownResults = mountResultsScreen(app, placings, player.id, () => {
      teardownResults();
      // Loop back to training instead of main menu
      showTrainingScreen(updatedCareer);
    });
  };

  teardown = mountRaceScreen({
    host: stage,
    field,
    playerHorseId: player.id,
    playerSilks: career.playerSilks,
    config: {
      seed: 'race-' + Date.now(),
      metres: raceDistance,
      going: raceGoing,
      hype: raceHype,
    },
    autopilotToggle,
    onRaceStart: () => {
      autopilotToggle.disabled = true;
    },
    onFinish,
  });
}
