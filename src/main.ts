import './style.css';
import { createRng } from './sim/index.js';
import { createNameGenerator } from './data/names.js';
import { generateHorse, generateWorld } from './sim/horse.js';
import { FIELD_SIZE, RUNNING_STYLES } from './data/index.js';
import type { RunnerSnapshot } from './sim/race/engine.js';
import { attachInfoBox } from './ui/infoBox.js';
import { mountRaceScreen } from './ui/raceScreen.js';
import { mountRaceIntro, type RaceIntroConfig } from './ui/raceIntro.js';
import { mountHorsePreview } from './ui/horsePreview.js';
import { mountSilksDemo } from './ui/silksDemo.js';
import { mountRoadmap } from './ui/roadmap.js';
import { mountMainMenu, type MainMenuCallbacks } from './ui/mainMenu.js';
import { mountStarterSelection } from './ui/starterSelection.js';
import { mountResultsScreen } from './ui/resultsScreen.js';
import { mountTrainingScreen } from './ui/trainingScreen.js';
import { mountRaceCalendar, type RaceOption } from './ui/raceCalendar.js';
import { mountChampionshipVictory } from './ui/championshipVictory.js';
import { mountStableHub } from './ui/stableHub.js';
import { mountLegacyScreen } from './ui/legacyScreen.js';
import {
  applyRaceToHorseLegacy,
  createHorseLegacy,
  createStableLegacy,
} from './data/legacy.js';
import { mountFacilitiesScreen } from './ui/facilitiesScreen.js';
import { loadCareer, saveCareer, createNewCareer, deleteCareer, type Career } from './ui/career.js';
import { mountDossierScreen } from './ui/dossierScreen.js';
import { mountTestCareerSetup } from './ui/testCareerSetup.js';
import type { Horse } from './sim/types.js';
import type { Silks } from './render/palette.js';
import { RIVAL_SILKS, hashId } from './render/palette.js';
import { DEFAULTS } from './data/colors.js';
import { updateDivisionProgression, updateAIDivisionProgression, populatePromotionRaceField, populateDemotionRaceField, finalizePromotion, finalizeDemotion } from './sim/division.js';

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

// Track skip race unlock status
function isSkipRaceUnlocked(): boolean {
  return localStorage.getItem('skipRaceUnlocked') === 'true';
}

function unlockSkipRace(): void {
  localStorage.setItem('skipRaceUnlocked', 'true');
}

function buildField(seed: string): { field: Horse[]; playerId: string } {
  const rng = createRng(seed);
  const names = createNameGenerator(rng);

  // Draw player index first so we know which horse to generate as player
  const playerIndex = Math.floor(rng.next() * FIELD_SIZE);

  const field: Horse[] = Array.from({ length: FIELD_SIZE }, (_, i) => {
    const horse = generateHorse(rng, names, {
      division: 'open',
      style: RUNNING_STYLES[i % RUNNING_STYLES.length]!,
      age: 4,
    });

    // Reserve player's name so no rival gets it
    if (i === playerIndex) {
      names.reserve(horse.name);
    }

    return horse;
  });

  return { field, playerId: field[playerIndex]!.id };
}

/**
 * Calculate race earnings and reputation gain based on division and finishing position.
 * Prize distribution: 1st=50%, 2nd=25%, 3rd=15%, 4th+=10%
 */
function calculateRaceRewards(division: string, finishingPosition: number, fieldSize: number): { earnings: number; reputation: number } {
  const basePrizes: Record<string, number> = {
    maiden: 5000,
    novice: 10000,
    open: 20000,
    stakes: 50000,
    championship: 100000,
  };

  const basePrize = basePrizes[division] || 5000;

  // Determine prize percentage based on position
  let prizePercentage = 0.1; // 4th+ gets 10%
  let reputationGain = 1;

  if (finishingPosition === 1) {
    prizePercentage = 0.5;
    reputationGain = 5;
  } else if (finishingPosition === 2) {
    prizePercentage = 0.25;
    reputationGain = 3;
  } else if (finishingPosition === 3) {
    prizePercentage = 0.15;
    reputationGain = 2;
  }

  const earnings = Math.round(basePrize * prizePercentage);

  // Scale reputation by field size (tighter races = more competitive)
  const competitionMultiplier = Math.max(1, fieldSize / 12);
  const scaledReputation = Math.round(reputationGain * competitionMultiplier);

  return { earnings, reputation: scaledReputation };
}

function startRace(seed: string): void {
  teardown?.();
  app.innerHTML = '';

  const { field, playerId } = buildField(seed);
  const player = field.find((h) => h.id === playerId)!;

  const stage = document.createElement('div');
  stage.className = 'stage';
  app.appendChild(stage);

  // Determine player silks before showing intro
  let playerSilks = DEFAULTS.demoSilksDefault;
  const colorOverride = sessionStorage.getItem('color-override');
  if (colorOverride) {
    try {
      const colors = JSON.parse(colorOverride);
      playerSilks = {
        primary: colors.silksColor || DEFAULTS.demoSilksDefault.primary,
        secondary: colors.trimColor || colors.maneColor || DEFAULTS.demoSilksDefault.secondary,
      };
      sessionStorage.removeItem('color-override');
    } catch {
      // Ignore invalid JSON
    }
  }

  // Show race intro first
  let introTeardown: (() => void) | null = null;
  let raceScreenTeardown: (() => void) | null = null;

  const showRaceScreen = (opts?: { autoStartCountdown?: boolean }): void => {
    try {
      alert('showRaceScreen started');
      console.log('[showRaceScreen] Starting race screen', { autoStartCountdown: opts?.autoStartCountdown });
      introTeardown?.();
      app.innerHTML = '';

      const newStage = document.createElement('div');
      newStage.className = 'stage';
      app.appendChild(newStage);

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
        <button class="rb-skip" id="skip-race-btn" disabled>Skip Race</button>
        <button class="rb-auto" id="auto-race-btn" disabled>Auto-race</button>
      </div>
      <div class="rb-hint" id="rb-hint-text">Tap to <b>KICK</b> · hold to <b>TAKE A PULL</b></div>
      <button class="rb-again">New race</button>
    `;
    app.appendChild(bar);

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

    const skipBtn = bar.querySelector<HTMLButtonElement>('#skip-race-btn')!;
    const autoBtn = bar.querySelector<HTMLButtonElement>('#auto-race-btn')!;

    // Demo mode: hide skip and auto-race, only autopilot for testing
    skipBtn.style.display = 'none';
    autoBtn.style.display = 'none';

    raceScreenTeardown = mountRaceScreen({
      host: newStage,
      field,
      playerHorseId: playerId,
      playerSilks,
      config: { metres: RACE_METRES, going: 'good', hype: 0.65, seed: `${seed}-run` },
      autopilotToggle,
      autoStartCountdown: opts?.autoStartCountdown ?? false,
      onRaceStart: () => {
        // Lock autopilot once race starts — can't change during race
        autopilotToggle.disabled = true;
      },
    });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[showRaceScreen] Error:', error);
      alert(`Error starting race: ${errorMsg}`);
      app.innerHTML = `<div style="color: red; padding: 20px; font-family: monospace;">Error starting race: ${errorMsg}</div>`;
    }
  };

  const introConfig: RaceIntroConfig = {
    name: 'Test Race',
    distance: RACE_METRES,
    going: 'good',
    fieldSize: field.length,
    prize: 1000,
  };

  const showDossier = (_returnToIntro: () => void): void => {
    // FIXME: Dossier "Start Race" callback is not working on mobile
    // Investigation shows the wrong callback is being passed to mountDossierScreen.
    // The minified callback looks like: ()=>{c?.(),t.innerHTML='',l?.(),n()}
    // which appears to be the career-mode callback, not the race-demo callback.
    // This is blocking Phase 2 completion. Debug on desktop with full dev tools.
    // See: https://github.com/HaydenMay/Bloodline/issues/[TODO]

    // Hide the race intro while showing dossier
    const raceIntro = stage.querySelector<HTMLElement>('.race-intro');
    if (raceIntro) raceIntro.style.display = 'none';

    const dossierTeardown = mountDossierScreen(stage, field, player, {}, () => {
      try {
        alert('Start Race clicked');
        console.log('[dossier] Start Race clicked');
        dossierTeardown();
        if (raceIntro) raceIntro.style.display = '';
        alert('Calling showRaceScreen');
        console.log('[dossier] About to call showRaceScreen');
        showRaceScreen();
        alert('showRaceScreen completed');
        console.log('[dossier] showRaceScreen completed');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[dossier] Error in Start Race:', error);
        alert(`Error in Start Race: ${errorMsg}`);
      }
    });
  };

  introTeardown = mountRaceIntro(stage, introConfig, showRaceScreen, {
    field,
    playerHorse: player,
    onShowOpponents: showDossier,
  });
  teardown = () => {
    introTeardown?.();
    raceScreenTeardown?.();
  };
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

function generateRandomCareer(): Career {
  const rng = createRng(Math.random());
  const names = createNameGenerator(rng);
  const horse = generateHorse(rng, names, {
    division: 'open',
    style: RUNNING_STYLES[Math.floor(Math.random() * RUNNING_STYLES.length)]!,
    age: 2,
  });
  const racesCompleted = Math.floor(Math.random() * 20) + 5;
  const wins = Math.floor(racesCompleted * Math.random() * 0.6);
  const losses = racesCompleted - wins;
  const totalEarnings = wins * 50000 + Math.floor(Math.random() * 100000);

  const raceNames = [
    'Derby Classic', 'Royal Ascot', 'The Oaks', 'King George VI',
    'Breeders Cup', 'St Leger', '2000 Guineas', 'Gold Cup',
  ];

  const topWins = Array.from({ length: Math.min(3, wins) }, (_, i) => ({
    raceName: raceNames[i % raceNames.length]!,
    margin: `${Math.floor(Math.random() * 3) + 1}L`,
  }));

  return {
    horse,
    playerSilks: RIVAL_SILKS[Math.floor(Math.random() * RIVAL_SILKS.length)]!,
    week: Math.floor(Math.random() * 52) + 1,
    season: Math.floor(Math.random() * 5) + 1,
    stats: {
      wins,
      losses,
      racesCompleted,
      totalEarnings,
      topWins,
      cash: totalEarnings + 5000,
      reputation: wins * 2,
    },
    stable: {
      world: [],
      dossier: {},
      settings: {
        autopilotEnabled: false,
      },
      facilities: {
        barn: 0,
        training: 0,
        medical: 0,
        feed: 0,
        stud: 0,
        admin: 0,
        paddock: 0,
      },
      legacy: createStableLegacy(),
    },
    horseLegacy: createHorseLegacy(wins * 12),
    createdAt: Date.now() - Math.random() * 100000000,
    lastUpdated: Date.now(),
  };
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
} else if (params.has('test-career')) {
  // ?test-career opens the test career setup
  const rng = createRng(`test-career-${Date.now()}`);
  const names = createNameGenerator(rng);

  mountTestCareerSetup(app, (horse, config) => {
    // Create career with test horse
    const testCareer = createNewCareer(horse, DEFAULTS.playerSilksDefault);
    // Override starting cash from config
    testCareer.stats.cash = config.startingCash;
    // Seed both legacy scores: the horse's own, and prestige banked from past horses
    testCareer.horseLegacy = createHorseLegacy(config.horseLegacyPoints);
    testCareer.stable.legacy = createStableLegacy(config.stableLegacyPoints);
    // Generate a full world for testing
    testCareer.stable.world = generateWorld(rng, names, {
      maiden: 15,
      novice: 12,
      open: 10,
      stakes: 8,
      championship: 5,
    });
    // Start stable hub (not training directly)
    showStableHub(testCareer);
  });
} else if (params.has('roadmap')) {
  // ?roadmap opens the build-progress panel — kept off every real game
  // screen so it never collides with game chrome (the starter carousel's
  // header sat directly under its fixed top-right pill).
  mountRoadmap();
} else if (params.has('random-retire')) {
  // ?random-retire shows a simulated retirement screen with random stats
  const randomCareer = generateRandomCareer();
  showCareerRecap(randomCareer);
} else {
  // Default: main menu → starter selection → career
  showMainMenu();
}

function showCareerRecap(career: Career): void {
  teardown?.();
  app.innerHTML = '';

  const winRate = career.stats.racesCompleted > 0
    ? Math.round((career.stats.wins / career.stats.racesCompleted) * 100)
    : 0;

  const recap = document.createElement('div');
  recap.className = 'career-recap';

  const rivalCount = Object.keys(career.stable.dossier).length;

  recap.innerHTML = `
    <div class="recap-container">
      <h1>Career Summary</h1>
      <div class="horse-info stat-box" style="animation-delay: 0s">
        <h2>${career.horse.name}</h2>
        <p>${styleLabel(career.horse.style)} • ${momentLabel(career.horse.moment)}</p>
      </div>

      <div class="stats-grid">
        <div class="stat-block stat-box" style="animation-delay: 0.2s">
          <span class="stat-label">Races Completed</span>
          <span class="stat-number">${career.stats.racesCompleted}</span>
        </div>
        <div class="stat-block stat-box" style="animation-delay: 0.4s">
          <span class="stat-label">Wins</span>
          <span class="stat-number">${career.stats.wins}</span>
        </div>
        <div class="stat-block stat-box" style="animation-delay: 0.6s">
          <span class="stat-label">Losses</span>
          <span class="stat-number">${career.stats.losses}</span>
        </div>
        <div class="stat-block stat-box" style="animation-delay: 0.8s">
          <span class="stat-label">Win Rate</span>
          <span class="stat-number">${winRate}%</span>
        </div>
        <div class="stat-block stat-box" style="animation-delay: 1s">
          <span class="stat-label">Total Earnings</span>
          <span class="stat-number">$${career.stats.totalEarnings.toLocaleString()}</span>
        </div>
        <div class="stat-block stat-box" style="animation-delay: 1.2s">
          <span class="stat-label">Rivals Encountered</span>
          <span class="stat-number">${rivalCount}</span>
        </div>
      </div>

      ${career.stats.topWins.length > 0 ? `
        <div class="top-wins-box stat-box" style="animation-delay: 1.4s">
          <h3>Top Wins</h3>
          <div class="top-wins-list">
            ${career.stats.topWins.map((win, i) => `
              <div class="top-win-item">
                <span class="rank">#${i + 1}</span>
                <span class="race-name">${win.raceName}</span>
                <span class="margin">${win.margin}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="horse-stats stat-box" style="animation-delay: 1.6s">
        <h3>Final Stats</h3>
        <div class="stats-row">
          <div class="stat-item">
            <span class="label">Speed</span>
            <span class="value">${Math.round(career.horse.stats.speed)}</span>
          </div>
          <div class="stat-item">
            <span class="label">Stamina</span>
            <span class="value">${Math.round(career.horse.stats.stamina)}</span>
          </div>
          <div class="stat-item">
            <span class="label">Grit</span>
            <span class="value">${Math.round(career.horse.stats.grit)}</span>
          </div>
          <div class="stat-item">
            <span class="label">Burst</span>
            <span class="value">${Math.round(career.horse.stats.burst)}</span>
          </div>
          <div class="stat-item">
            <span class="label">Temper</span>
            <span class="value">${Math.round(career.horse.stats.temper)}</span>
          </div>
          <div class="stat-item">
            <span class="label">Consistency</span>
            <span class="value">${Math.round(career.horse.stats.consistency)}</span>
          </div>
        </div>
      </div>

      <div class="recap-actions">
        <button class="btn btn-primary" id="new-game-btn">Start New Game</button>
      </div>
    </div>
  `;

  app.appendChild(recap);

  const newGameBtn = recap.querySelector<HTMLButtonElement>('#new-game-btn')!;
  newGameBtn.addEventListener('click', () => {
    deleteCareer();

    // Show unlock popup if this was a full 20-race career
    if (career.stats.racesCompleted >= 20) {
      showSkipRaceUnlock();
    } else {
      showMainMenu();
    }
  });
}

function showSkipRaceUnlock(): void {
  unlockSkipRace();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content unlock-popup">
      <h2>🏁 Feature Unlocked!</h2>
      <p>You've completed a full career! You've unlocked <strong>Skip Race</strong> for future careers.</p>
      <p>Use it to quickly jump through races you don't want to watch, and focus on training and strategy.</p>
      <button class="btn btn-primary" id="unlock-ok">Got it</button>
    </div>
  `;
  app.appendChild(modal);

  modal.querySelector('#unlock-ok')!.addEventListener('click', () => {
    modal.remove();
    showMainMenu();
  });
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
  showStableHub(career);
}

/**
 * Check if user has disabled the "no training" warning for this week.
 */
function shouldShowNoTrainingWarning(): boolean {
  const stored = localStorage.getItem('bloodline_no_training_warning_disabled');
  return stored !== 'true';
}

/**
 * Mark the "no training" warning as permanently disabled by the user.
 */
function disableNoTrainingWarning(): void {
  localStorage.setItem('bloodline_no_training_warning_disabled', 'true');
}

function resumeCareer(career: Career): void {
  // Resume existing career
  showStableHub(career);
}

function showStableHub(career: Career): void {
  teardown?.();
  app.innerHTML = '';

  teardown = mountStableHub(app, career, {
    onTraining: () => {
      // Check if training already done this week
      if (career.trainingDoneThisWeek) {
        alert('You already trained this week! Pick a race from the Race Calendar.');
        return;
      }
      showTrainingScreen(career);
    },
    onRaceCalendar: () => {
      // If training not done yet, warn player
      if (!career.trainingDoneThisWeek && shouldShowNoTrainingWarning()) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
          <div class="modal-content">
            <h2>⚠️ No Training Yet</h2>
            <p>You haven't trained this week. Racing without training may hurt your horse's performance.</p>
            <p>Are you sure you want to go to the Race Calendar?</p>
            <div style="display: flex; gap: 12px; margin: 20px 0;">
              <label style="display: flex; align-items: center; gap: 8px; flex: 1;">
                <input type="checkbox" id="dont-show-again" />
                <span style="font-size: 0.9rem;">Don't show again</span>
              </label>
            </div>
            <div style="display: flex; gap: 12px;">
              <button class="btn btn-secondary" id="modal-no">Go Back to Hub</button>
              <button class="btn btn-primary" id="modal-yes">Go to Calendar</button>
            </div>
          </div>
        `;
        app.appendChild(modal);

        const noBtn = modal.querySelector('#modal-no') as HTMLButtonElement;
        const yesBtn = modal.querySelector('#modal-yes') as HTMLButtonElement;
        const checkbox = modal.querySelector('#dont-show-again') as HTMLInputElement;

        noBtn.addEventListener('click', () => {
          if (checkbox.checked) {
            disableNoTrainingWarning();
          }
          modal.remove();
        });

        yesBtn.addEventListener('click', () => {
          if (checkbox.checked) {
            disableNoTrainingWarning();
          }
          modal.remove();
          showRaceCalendar(career);
        });
      } else {
        showRaceCalendar(career);
      }
    },
    onFacilities: () => {
      teardown?.();
      app.innerHTML = '';
      teardown = mountFacilitiesScreen(app, career, () => showStableHub(career));
    },
    onTrainerJockey: () => {
      // TODO: Implement trainer/jockey screen
      alert('Trainer & Jockey management coming in next phase!');
      showStableHub(career);
    },
    onConsumables: () => {
      // TODO: Implement consumables screen
      alert('Consumables shop coming in next phase!');
      showStableHub(career);
    },
    onDossier: () => {
      // TODO: Fix dossier screen and integrate properly
      alert('Rival Dossier screen - coming soon!');
      showStableHub(career);
    },
    onLegacy: () => {
      teardown?.();
      app.innerHTML = '';
      teardown = mountLegacyScreen(app, career, () => showStableHub(career));
    },
  });
}

function showTrainingScreen(career: Career): void {
  teardown?.();
  app.innerHTML = '';

  teardown = mountTrainingScreen(app, career.horse, career.playerSilks, (updatedHorse, _session) => {
    const updatedCareer = { ...career, horse: updatedHorse, trainingDoneThisWeek: true };
    saveCareer(updatedCareer);
    showStableHub(updatedCareer);
  });
}

function showRaceCalendar(career: Career): void {
  teardown?.();
  app.innerHTML = '';

  // Check if player is ready for promotion or at demotion risk
  const isPromotionReady = career.horse.divisionPoints >= 5 && career.horse.divisionLevel < 4;
  const isDemotionRisk = career.horse.divisionPoints <= -3 && career.horse.divisionLevel > 0;

  // Show demotion warning if at risk
  if (isDemotionRisk) {
    const warningModal = document.createElement('div');
    warningModal.className = 'modal-overlay';
    warningModal.innerHTML = `
      <div class="modal-content demotion-warning">
        <h2>⚠️ Demotion Risk</h2>
        <p>You are at risk of demotion. You must finish in the top 4 of the Division Qualifier race to avoid being demoted to the previous division.</p>
        <p>If you finish 5th-8th, you will be demoted and start fresh in the division below.</p>
        <button class="btn btn-primary" id="demotion-warning-ok">Understood</button>
      </div>
    `;
    app.appendChild(warningModal);

    warningModal.querySelector('#demotion-warning-ok')!.addEventListener('click', () => {
      warningModal.remove();
      // Now show the race calendar
      mountCalendarUI();
    });

    return;
  }

  // Show promotion ready alert if applicable
  if (isPromotionReady) {
    const promotionAlert = document.createElement('div');
    promotionAlert.className = 'modal-overlay';
    promotionAlert.innerHTML = `
      <div class="modal-content promotion-alert">
        <h2>🏆 Ready for Promotion!</h2>
        <p>You've proven yourself in this division! This week's race calendar features a Promotion Test.</p>
        <p>Finish in the top 4 to advance to the next division.</p>
        <button class="btn btn-primary" id="promotion-alert-ok">Let's Go</button>
      </div>
    `;
    app.appendChild(promotionAlert);

    promotionAlert.querySelector('#promotion-alert-ok')!.addEventListener('click', () => {
      promotionAlert.remove();
      // Now show the race calendar
      mountCalendarUI();
    });

    return;
  }

  // Show normal race calendar
  mountCalendarUI();

  function mountCalendarUI() {
    teardown = mountRaceCalendar(app, (race) => {
      // Mark that a race has been selected for this week
      const careerWithRaceSelected = { ...career, raceSelected: true };
      saveCareer(careerWithRaceSelected);
      startRaceWithHorse(careerWithRaceSelected, race);
    }, {
      division: career.horse.division,
      isPromotionReady,
      isDemotionRisk,
    });
  }
}

function startRaceWithHorse(career: Career, race?: RaceOption): void {
  const player = career.horse;

  // Validate player horse exists and has required properties
  if (!player || !player.id) {
    console.error('Invalid player horse in career:', player);
    showMainMenu();
    return;
  }

  const raceDistance = race?.distance || 1400;
  const raceGoing = race?.going || 'good';
  const raceHype = race?.hype || 0.5;

  let field: Horse[];
  try {
    // Check if this is a promotion or demotion race
    const isPromotionRace = race?.isPromotion === true;
    const isDemotionRace = race?.isDemotion === true;

    let opponents: Horse[];

    if (isPromotionRace) {
      // Promotion race field uses special population logic
      opponents = populatePromotionRaceField(player.division, career.stable.world, FIELD_SIZE - 1);
    } else if (isDemotionRace) {
      // Demotion race field uses special population logic
      opponents = populateDemotionRaceField(player.division, career.stable.world, FIELD_SIZE - 1);
    } else {
      // Normal race: build field from stable world, filtered by player's current division
      const rivalCandidates = career.stable.world.filter((h) => h.division === player.division);

      // Select rivals for this race (next FIELD_SIZE-1 from candidates)
      // Shuffle to avoid always seeing the same rivals first
      const rng = createRng('field-select-' + Date.now());
      const shuffled = rng.shuffle([...rivalCandidates]);
      const selected = shuffled.slice(0, Math.min(FIELD_SIZE - 1, shuffled.length));

      // If not enough rivals in this division, top up with adjacent division
      if (selected.length < FIELD_SIZE - 1) {
        const adjacent = career.stable.world.filter(
          (h) =>
            (h.division === 'maiden' && player.division === 'novice') ||
            (h.division === 'novice' && player.division === 'open') ||
            (h.division === 'novice' && player.division === 'maiden') ||
            (h.division === 'open' && player.division === 'novice') ||
            (h.division === 'open' && player.division === 'stakes') ||
            (h.division === 'stakes' && player.division === 'open') ||
            (h.division === 'stakes' && player.division === 'championship') ||
            (h.division === 'championship' && player.division === 'stakes'),
        );
        const shuffledAdj = rng.shuffle([...adjacent]);
        selected.push(...shuffledAdj.slice(0, FIELD_SIZE - 1 - selected.length));
      }

      opponents = selected;
    }

    field = [player, ...opponents];

    if (field.length < 2) {
      console.error('Field generation failed, not enough horses:', field.length);
      showMainMenu();
      return;
    }
  } catch (error) {
    console.error('Error during field generation:', error);
    showMainMenu();
    return;
  }

  teardown?.();
  app.innerHTML = '';

  let dossierTeardown: (() => void) | null = null;
  let introTeardown: (() => void) | null = null;
  let raceScreenTeardown: (() => void) | null = null;

  const startRaceScreen = () => {
    dossierTeardown?.();
    app.innerHTML = '';

    // Show race intro first
    const introStage = document.createElement('div');
    introStage.className = 'stage';
    app.appendChild(introStage);

    const showActualRaceScreen = () => {
      introTeardown?.();
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
          <button class="rb-skip" id="skip-race-btn" disabled>Skip Race</button>
          <button class="rb-auto" id="auto-race-btn" disabled>Auto-race</button>
        </div>
        <div class="rb-callout" id="callout"></div>
      `;
      app.appendChild(bar);

      // Attach infobox to player horse name
      const playerHorseNameEl = bar.querySelector<HTMLElement>('.rb-horse')!;
      const infoBoxCleanup = attachInfoBox(playerHorseNameEl, player, career.playerSilks);

      const autopilotToggle = bar.querySelector<HTMLInputElement>('#autopilot-toggle')!;
      const hintText = bar.querySelector<HTMLDivElement>('.rb-callout')!;

      hintText.innerHTML = 'Tap or hold spacebar to kick · hold tap to take a pull';

      // Load saved autopilot preference
      autopilotToggle.checked = career.stable.settings.autopilotEnabled;
      if (autopilotToggle.checked) {
        hintText.innerHTML = 'Watch the race · autopilot is on';
      }

      autopilotToggle.addEventListener('change', (e) => {
        const isChecked = (e.target as HTMLInputElement).checked;
        hintText.innerHTML = isChecked
          ? 'Watch the race · autopilot is on'
          : 'Tap or hold spacebar to kick · hold tap to take a pull';
        // Save autopilot preference
        career.stable.settings.autopilotEnabled = isChecked;
        saveCareer(career);
      });

      // Generate silks for all horses in the field
      const silksMap = new Map<string, Silks>();
      const taken = new Set<number>();

      silksMap.set(player.id, career.playerSilks);

      // Reserve player's silks slot so rivals can't use it
      const playerSilksSlot = RIVAL_SILKS.findIndex(
        (s) => s.primary === career.playerSilks.primary && s.secondary === career.playerSilks.secondary,
      );
      if (playerSilksSlot !== -1) {
        taken.add(playerSilksSlot);
      }

      for (const horse of field) {
        if (horse.id === player.id) continue;
        let slot = hashId(horse.id) % RIVAL_SILKS.length;
        while (taken.has(slot)) slot = (slot + 1) % RIVAL_SILKS.length;
        taken.add(slot);
        silksMap.set(horse.id, RIVAL_SILKS[slot]!);
      }

      const onFinish = (placings: RunnerSnapshot[]): void => {
        raceScreenTeardown?.();
        app.innerHTML = '';

        // Update career stats based on race result
        const playerIndex = placings.findIndex((p) => p.id === player.id);
        const updatedCareer = { ...career };

        // Update rival records in stable
        for (let i = 0; i < placings.length; i++) {
          const placing = placings[i];
          if (!placing || placing.id === player.id) continue;

          const rival = updatedCareer.stable.world.find((h) => h.id === placing.id);
          if (rival) {
            rival.starts += 1;
            if (i === 0) rival.wins += 1;
            if (i === 1 || i === 2) rival.places += 1;
            if (i === 3) rival.shows += 1;
          }

          // Also track in dossier
          if (!updatedCareer.stable.dossier[placing.id]) {
            updatedCareer.stable.dossier[placing.id] = {
              wins: 0,
              places: 0,
              shows: 0,
              starts: 0,
              division: rival?.division || 'maiden',
              lastSeen: updatedCareer.week,
            };
          }
          const entry = updatedCareer.stable.dossier[placing.id];
          if (entry) {
            entry.starts += 1;
            if (i === 0) entry.wins += 1;
            if (i === 1 || i === 2) entry.places += 1;
            if (i === 3) entry.shows += 1;
            entry.lastSeen = updatedCareer.week;
          }
        }

        // Update player horse records and division progression
        const playerFinishingPosition = playerIndex + 1;
        const { earnings, reputation } = calculateRaceRewards(player.division, playerFinishingPosition, placings.length);

        if (playerIndex === 0) {
          updatedCareer.stats.wins += 1;
          updatedCareer.horse.wins += 1;
        } else {
          updatedCareer.stats.losses += 1;
        }

        updatedCareer.stats.totalEarnings += earnings;
        updatedCareer.stats.cash += earnings;
        updatedCareer.stats.reputation += reputation;
        updatedCareer.horse.starts += 1;

        // Update division points for player horse
        const isPromotionRace = race?.isPromotion === true;
        const isDemotionRace = race?.isDemotion === true;
        console.log('Race type check:', { isPromotionRace, isDemotionRace, race });

        const DIVISIONS = ['Maiden', 'Novice', 'Open', 'Stakes', 'Championship'];

        // Division the race was actually run in — legacy swings are scaled by it,
        // so it must be read before a promotion moves the horse up.
        const racedDivision = updatedCareer.horse.division;
        const divisionLevelBefore = updatedCareer.horse.divisionLevel;

        if (isPromotionRace) {
          // Finalize promotion result
          console.log('Promotion race detected. Before:', {
            divisionLevel: updatedCareer.horse.divisionLevel,
            divisionPoints: updatedCareer.horse.divisionPoints,
            position: playerFinishingPosition,
          });
          const divBefore = updatedCareer.horse.divisionLevel;
          finalizePromotion(updatedCareer.horse, playerFinishingPosition);
          const divAfter = updatedCareer.horse.divisionLevel;
          console.log('After promotion:', {
            divisionLevel: updatedCareer.horse.divisionLevel,
            divisionPoints: updatedCareer.horse.divisionPoints,
          });

          // Show promotion/demotion result alert
          if (divAfter > divBefore) {
            alert(`🎉 PROMOTION! 🎉\n\nYou've been promoted to ${DIVISIONS[divAfter]}!\nYour division points reset to 0.`);
          } else {
            alert(`\u{1F50B} DEMOTION \u{1F50B}\n\nYou were not promoted this race.\nYour division points reset to 2.`);
          }
        } else if (isDemotionRace) {
          // Finalize demotion result
          const divBefore = updatedCareer.horse.divisionLevel;
          finalizeDemotion(updatedCareer.horse, playerFinishingPosition);
          const divAfter = updatedCareer.horse.divisionLevel;

          if (divAfter < divBefore) {
            alert(`📉 DEMOTION 📉\n\nYou've been demoted to ${DIVISIONS[divAfter]}.`);
          } else {
            alert(`✅ Safe!\n\nYou stayed in ${DIVISIONS[divBefore]}.\nYour division points reset to 0.`);
          }
        } else {
          // Normal race - just update division points
          updateDivisionProgression(updatedCareer.horse, playerFinishingPosition);
        }

        // Update division points for all AI horses
        for (let i = 0; i < placings.length; i++) {
          const placing = placings[i];
          if (!placing || placing.id === player.id) continue; // Skip player

          const rival = updatedCareer.stable.world.find((h) => h.id === placing.id);
          if (rival) {
            updateAIDivisionProgression(rival, i + 1);
          }
        }

        // Fold the result into the horse's legacy. Good days lift it, bad days
        // shave a little off, and moving divisions dwarfs either.
        const divisionLevelAfter = updatedCareer.horse.divisionLevel;
        const legacySwing = applyRaceToHorseLegacy(
          updatedCareer.horseLegacy,
          playerFinishingPosition,
          racedDivision,
          {
            promoted: divisionLevelAfter > divisionLevelBefore,
            demoted: divisionLevelAfter < divisionLevelBefore,
          },
        );

        if (legacySwing.inducted) {
          updatedCareer.stable.legacy.hallOfFame.push({
            horseName: updatedCareer.horse.name,
            wins: updatedCareer.horse.wins,
            starts: updatedCareer.horse.starts,
            earnings: updatedCareer.stats.totalEarnings,
            legacyPoints: updatedCareer.horseLegacy.peak,
            division: updatedCareer.horse.division,
            season: updatedCareer.season,
            timestamp: Date.now(),
          });
          alert(
            `⭐ HALL OF FAME ⭐\n\n${updatedCareer.horse.name} has been inducted into the Hall of Fame with ${updatedCareer.horseLegacy.peak} legacy points.`,
          );
        }

        updatedCareer.stats.racesCompleted += 1;
        updatedCareer.week += 1;
        updatedCareer.raceSelected = false; // Clear race selection for next week
        updatedCareer.trainingDoneThisWeek = false; // Reset training flag for next week
        saveCareer(updatedCareer);

        const teardownResults = mountResultsScreen(app, placings, player.id, () => {
          infoBoxCleanup();
          teardownResults();

          // Check for championship victory
          const playerWon = playerIndex === 0;
          const isChampionship = player.division === 'championship';
          const notYetChampion = !updatedCareer.horse.isChampion;

          if (playerWon && isChampionship && notYetChampion) {
            // Show championship victory scene with top 3
            let victoryTeardown: (() => void) | null = null;

            // Build top 3 placings from race results
            const topThree: Array<{ horse: Horse; position: 1 | 2 | 3 }> = [];
            for (let i = 0; i < Math.min(3, placings.length); i++) {
              const placing = placings[i];
              if (!placing) continue;

              let horse: Horse | undefined = updatedCareer.horse; // 1st place is player's horse
              if (i > 0) {
                // 2nd and 3rd place: look up from stable
                horse = updatedCareer.stable.world.find((h) => h.id === placing.id);
              }

              if (horse) {
                topThree.push({
                  horse,
                  position: (i + 1) as 1 | 2 | 3,
                });
              }
            }

            victoryTeardown = mountChampionshipVictory(
              app,
              updatedCareer.horse,
              career.playerSilks,
              () => {
                // Retire champion
                victoryTeardown?.();
                updatedCareer.horse.isChampion = true;
                saveCareer(updatedCareer);
                showCareerRecap(updatedCareer);
              },
              () => {
                // Keep racing
                victoryTeardown?.();
                updatedCareer.horse.isChampion = true;
                saveCareer(updatedCareer);
                // Loop back to stable hub (career only ends at 18-20 starts or by retiring)
                showStableHub(updatedCareer);
              },
              topThree.length >= 3 ? topThree : undefined
            );
          } else {
            // Normal race completion
            // Check if career should end (18-20 races completed)
            if (updatedCareer.stats.racesCompleted >= 20) {
              showCareerRecap(updatedCareer);
            } else {
              // Loop back to stable hub instead of main menu
              showStableHub(updatedCareer);
            }
          }
        }, field, silksMap, {
          raceDelta: legacySwing.raceDelta,
          bonus: legacySwing.bonus,
          total: legacySwing.total,
        });
      };

      const skipBtn = bar.querySelector<HTMLButtonElement>('#skip-race-btn')!;
      const autoBtn = bar.querySelector<HTMLButtonElement>('#auto-race-btn')!;

      // Hide skip/auto-race if not yet unlocked
      const skipUnlocked = isSkipRaceUnlocked();
      if (!skipUnlocked) {
        skipBtn.style.display = 'none';
        autoBtn.style.display = 'none';
      }

      raceScreenTeardown = mountRaceScreen({
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
        ...(skipUnlocked && { skipToggle: skipBtn }),
        ...(skipUnlocked && { autoRaceToggle: autoBtn }),
        onRaceStart: () => {
          autopilotToggle.disabled = true;
          if (skipUnlocked) {
            skipBtn.disabled = false;
            autoBtn.disabled = false;
          }
        },
        onFinish,
      });
    };

    // Mount intro before race screen
    const raceName = race?.name || 'Unnamed Race';
    const introConfig: RaceIntroConfig = {
      name: raceName,
      distance: raceDistance,
      going: raceGoing,
      fieldSize: field.length,
      prize: 1000,
    };

    introTeardown = mountRaceIntro(
      introStage,
      introConfig,
      showActualRaceScreen,
      {
        field,
        playerHorse: player,
        dossier: career.stable.dossier,
        onShowOpponents: (returnCallback) => {
          // Clear intro and show dossier
          introStage.innerHTML = '';

          dossierTeardown = mountDossierScreen(
            introStage,
            field,
            player,
            career.stable.dossier,
            () => {
              // Return to intro
              dossierTeardown?.();
              introStage.innerHTML = '';
              introTeardown?.();
              returnCallback();
            }
          );
        },
      }
    );
  };

  // Start with race intro
  startRaceScreen();

  teardown = () => {
    dossierTeardown?.();
    introTeardown?.();
    raceScreenTeardown?.();
  };
}
