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
import { mountBreedingScreen } from './ui/breedingScreen.js';
import { mountArchiveScreen } from './ui/archiveScreen.js';
import { mountYearlingScreen } from './ui/yearlingScreen.js';
import { yearlingPrice } from './data/yearling.js';
import { breedingStock, partnersFor, sellFoal } from './ui/studBook.js';
import { foalSalePrice } from './data/foalSale.js';
import { mountFoalDevelopment } from './ui/foalDevelopmentScreen.js';
import { mountResultsScreen } from './ui/resultsScreen.js';
import { mountTrainingScreen } from './ui/trainingScreen.js';
import { mountRaceCalendar, type RaceOption } from './ui/raceCalendar.js';
import { mountChampionshipVictory } from './ui/championshipVictory.js';
import { mountStableHub } from './ui/stableHub.js';
import { mountLegacyScreen } from './ui/legacyScreen.js';
import { mountStaffScreen } from './ui/staffScreen.js';
import { mountConsumablesScreen } from './ui/consumablesScreen.js';
import { mountRivalDossierScreen } from './ui/rivalDossierScreen.js';
import { mountRaceDayScreen, type RaceDayChoices } from './ui/raceDayScreen.js';
import { applyRaceDayItems } from './data/consumables.js';
import { rateHorse, settleBet, type PlacedBet } from './data/wagering.js';
import { getPrizeMoney, getPurse } from './data/purse.js';
import type { NoticeOptions } from './ui/noticeModal.js';
import { showNotice } from './ui/noticeModal.js';
import {
  applyRaceToHorseLegacy,
  createHorseLegacy,
  createStableLegacy,
  getRetirementValue,
} from './data/legacy.js';
import { mountFacilitiesScreen } from './ui/facilitiesScreen.js';
import { getPrizeMultiplier, getTrainingMultiplier } from './data/facilities.js';
import { applyRaceUpkeep, applyRestWeek } from './sim/upkeep.js';
import { runWorldMeeting } from './sim/worldRacing.js';
import { advanceSeasonIfDue, describeStatChanges } from './sim/growth.js';
import { applyInjury, isCareerEnding, rollForInjury } from './sim/injury.js';
import { getJockeySkill, getTrainerBonus } from './data/staff.js';
import {
  loadCareer,
  saveCareer,
  saveStable,
  createNewCareer,
  createStable,
  retireCurrentHorse,
  loadStable,
  resetEverything,
  exportSave,
  importSave,
  takeRecoveryNotice,
  takeStudInfluence,
  type Career,
  type Stable,
} from './ui/career.js';
import { saveFileName } from './save/durability.js';
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
 * What a race pays out. Prize shares live in data/purse.ts.
 *
 * Standing is not settled here: a result's effect on the yard's prestige comes
 * from the horse's own legacy, which already weights it by division.
 */
function calculateRaceRewards(
  division: string,
  finishingPosition: number,
  facilities: Record<string, number> = {},
  /** The calendar's 0-1 difficulty rating for this race. */
  difficulty = 0.5,
): { earnings: number } {
  // Administration takes a cut of the paperwork off your hands and a bigger
  // share of the purse home with it.
  const earnings = Math.round(
    getPrizeMoney(division, finishingPosition, difficulty) * getPrizeMultiplier(facilities),
  );

  return { earnings };
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

    attachInfoBox(bar.querySelector<HTMLElement>('.rb-horse')!, player, playerSilks, true);

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
      app.innerHTML = '';
      showNotice(app, {
        icon: '⚠️',
        title: 'Could not start the race',
        lines: [errorMsg],
        hint: 'Return to the menu and try again.',
        tone: 'setback',
      });
    }
  };

  const introConfig: RaceIntroConfig = {
    name: 'Test Race',
    distance: RACE_METRES,
    going: 'good',
    fieldSize: field.length,
    prize: getPurse('open', 0.65),
    toWinner: getPrizeMoney('open', 1, 0.65),
  };

  // The intro decides nothing now, in the harness as in the career: the
  // dossier lives on the Race Day screen, which this Phase 2 path never had.
  introTeardown = mountRaceIntro(stage, introConfig, showRaceScreen);
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
    },
    stable: {
      ...createStable(),
      world: [],
      cash: totalEarnings + 5000,
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
    // A test career always starts from a clean yard, so a previous run's
    // facilities and staff cannot skew what is being tested.
    const testCareer = createNewCareer(horse, DEFAULTS.playerSilksDefault, createStable());
    testCareer.stable.cash = config.startingCash;
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
    // Persist before showing the hub, matching the real startCareer path — a
    // test career that only lives in memory cannot be reloaded or inspected.
    saveCareer(testCareer);
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
        <button class="btn btn-primary" id="new-game-btn">Continue the Yard</button>
      </div>
    </div>
  `;

  app.appendChild(recap);

  const newGameBtn = recap.querySelector<HTMLButtonElement>('#new-game-btn')!;
  newGameBtn.addEventListener('click', () => {
    // Bank what this horse earned the yard before clearing the career. The
    // stable survives; only the horse's run ends.
    const value = getRetirementValue(career.horseLegacy, career.careerEndedByInjury === true);
    const stable = retireCurrentHorse(career);
    const banked = value.banked;
    // What the yard's stallions earned while this horse was racing. Paid in
    // prestige, never cash — a bloodline spreading through the league is
    // influence, not income.
    const influence = takeStudInfluence();

    showNotice(
      app,
      {
        icon: '🏛️',
        title: 'Career Complete',
        lines: [
          career.careerEndedByInjury
            ? `${career.horse.name} retires hurt, banking its full ${banked} prestige. The injury cost the racing career, not its breeding value.`
            : value.reason === 'sound'
              ? `${career.horse.name} retires on top, banking ${value.base} prestige plus a ${value.bonus} bonus.`
              : `${career.horse.name} retires having banked ${banked} prestige, down from a peak of ${career.horseLegacy.peak}.`,
          `It joins your bloodstock — ${stable.bloodstock.length} horse${stable.bloodstock.length === 1 ? '' : 's'} in the yard now.`,
          ...(influence > 0
            ? [
                `Rival yards bred to your Hall of Fame stallions while you were racing, earning ${influence} prestige.`,
              ]
            : []),
          `Facilities, staff, ${'$' + stable.cash.toLocaleString()} in cash and every point of prestige all carry over.`,
        ],
        hint: 'Your next horse starts from everything this one built.',
        tone: 'positive',
        buttonLabel: 'Continue',
      },
      () => {
        // Show unlock popup if this was a full 20-race career, then ask where
        // the next horse comes from. The silks stay with the yard rather than
        // the horse, so the next one runs in the same colours.
        const next = (): void => showNextHorse(stable, career.playerSilks);
        if (career.stats.racesCompleted >= 20) {
          showSkipRaceUnlock(next);
        } else {
          next();
        }
      },
    );
  });
}

function showSkipRaceUnlock(onDone: () => void = showMainMenu): void {
  unlockSkipRace();

  showNotice(
    app,
    {
      icon: '🏁',
      title: 'Feature Unlocked!',
      lines: [
        "You've completed a full career and unlocked Skip Race for future careers.",
        "Use it to jump through races you don't want to watch and focus on training and strategy.",
      ],
      tone: 'positive',
      buttonLabel: 'Got it',
    },
    onDone,
  );
}

/**
 * Where the next horse comes from (DESIGN.md §10, §13).
 *
 * Once a yard has bloodstock, breeding is the intended route and starter
 * selection stops being the default way to get a horse — §13 puts it behind
 * "start a brand-new line". All three routes stay open, because a line that has
 * gone bad needs a way out that is not starting the whole yard again.
 */
function showNextHorse(stable: Stable, playerSilks: Silks): void {
  const canBreed = breedingStock(stable).some(
    (entry) => partnersFor(stable, entry.horse).length > 0,
  );
  const price = yearlingPrice(stable.legacy.archivedPoints);

  const actions: NoticeOptions['actions'] = [];

  if (canBreed) {
    actions.push({
      label: 'Breed From Your Bloodstock',
      onSelect: () => showBreeding(stable, playerSilks),
    });
  }

  actions.push({
    label: `Buy a Yearling · $${price.toLocaleString()}`,
    variant: canBreed ? 'secondary' : 'primary',
    onSelect: () => showYearlings(stable, playerSilks),
  });

  actions.push({
    label: 'Start a Brand-New Line',
    variant: 'secondary',
    onSelect: () => showStarterSelection(),
  });

  showNotice(app, {
    icon: '🐴',
    title: 'The Next Horse',
    lines: [
      canBreed
        ? `Your yard holds ${stable.bloodstock.length} horse${stable.bloodstock.length === 1 ? '' : 's'} at stud. What it produces next is the point of everything the last one did.`
        : 'Nothing in your yard can be bred yet. Buy a yearling, or start a fresh line.',
    ],
    hint: 'A bred foal inherits its parents. A bought or fresh horse inherits nothing.',
    tone: 'neutral',
    actions,
  });
}

/**
 * Taking on a new horse, from wherever the player asked.
 *
 * A yard with bloodstock is offered the crossroads; a yard with none goes
 * straight to starter selection, because "breed, buy or start a line" is not a
 * choice when two of the three are empty. This is what stops a player who quit
 * after retiring from coming back to a menu that silently skips their
 * bloodline (§13: once bloodstock exists, starter selection is reached through
 * "start a brand-new line").
 */
function nextHorseRoute(stable: Stable | null, playerSilks: Silks): void {
  if (stable && stable.bloodstock.length > 0) {
    showNextHorse(stable, playerSilks);
    return;
  }
  showStarterSelection();
}

function showBreeding(
  stable: Stable,
  playerSilks: Silks,
  options: { onBack?: () => void; mode?: 'breed' | 'browse' } = {},
): void {
  teardown?.();
  app.innerHTML = '';
  teardown = mountBreedingScreen(app, {
    stable,
    mode: options.mode ?? 'breed',
    onBred: (foal, yard) => {
      // §10's keep-or-sell. The projected ranges were the decision; this is the
      // horse those ranges actually produced, and passing on it is a real
      // option rather than a consolation — a foal you turn down is sold and
      // turned loose in the world carrying your bloodline's name.
      const price = foalSalePrice(foal);
      showNotice(app, {
        icon: '🧬',
        title: `${foal.name} is born`,
        lines: [
          `A ${foal.gender === 'stallion' ? 'colt' : 'filly'} by ${
            stable.bloodstock.find((entry) => entry.horse.id === foal.sireId)?.horse.name ??
            'an outside sire'
          }, generation ${foal.generation ?? 2} of your line.`,
          'It debuts at two, well short of what it will become. What it carries is its parents.',
        ],
        hint: `Passing costs a covering season — every horse at stud ages a year.`,
        tone: 'positive',
        actions: [
          {
            label: 'Take It Into Training',
            onSelect: () => showFoalDevelopment(foal, yard, playerSilks),
          },
          {
            label: `Pass — sell for $${price.toLocaleString()}`,
            variant: 'secondary',
            onSelect: () => {
              const sale = sellFoal(yard, foal);
              saveStable(yard);
              showNotice(
                app,
                {
                  icon: '🐎',
                  title: `${foal.name} is sold`,
                  lines: [
                    `$${sale.price.toLocaleString()} for a foal you will not campaign.`,
                    `It joins the racing world carrying your bloodline. You may line up against it — and it can be bred back to, years from now.`,
                  ],
                  hint: 'Your horses at stud are a year older for the covering.',
                  tone: 'neutral',
                  buttonLabel: 'Back to the Stud Book',
                },
                () => showBreeding(stable, playerSilks, options),
              );
            },
          },
        ],
      });
    },
    onBack: options.onBack ?? (() => showNextHorse(stable, playerSilks)),
  });
}

/**
 * The year in the paddock, between a foal being kept and its first race.
 *
 * §10's one place for player agency in an otherwise random inheritance — and
 * skippable, which the screen offers as a first-class button rather than an
 * escape.
 */
function showFoalDevelopment(foal: Horse, stable: Stable, playerSilks: Silks): void {
  teardown?.();
  app.innerHTML = '';
  teardown = mountFoalDevelopment(app, {
    foal,
    stable,
    onDone: (developed) => startCareer(developed, playerSilks, stable),
  });
}

/**
 * The Archive, reached from the main menu's Bloodstock door or, mid-career,
 * from the stable hub's own nav grid.
 *
 * DESIGN.md 10: "first-class screen, not a submenu" — so this is what that
 * door opens onto now, rooted on the horse in training (or the newest
 * retiree, between careers), with the stud book reachable from inside it
 * rather than the other way round.
 *
 * `fromCareer` is the live `Career` when opened from the hub — read directly
 * rather than reloaded from storage, the same way `onLegacy`/`onDossier`
 * already do in `showStableHub`, so a result from seconds ago is never shown
 * stale. Opened from the main menu instead, there is no in-memory career to
 * hand it, and it falls back to whatever is on disk.
 */
function showArchive(fromCareer?: Career): void {
  const stable = fromCareer?.stable ?? loadStable();
  if (!stable) {
    showMainMenu();
    return;
  }
  const inTraining = fromCareer ?? loadCareer();
  const playerSilks = inTraining?.playerSilks ?? DEFAULTS.playerSilksDefault;
  const root = inTraining?.horse ?? stable.bloodstock[stable.bloodstock.length - 1]?.horse;
  const goBack = (): void => (fromCareer ? showStableHub(fromCareer) : showMainMenu());

  const openBreeding = (): void => {
    showBreeding(stable, playerSilks, {
      mode: inTraining ? 'browse' : 'breed',
      onBack: () => showArchive(fromCareer),
    });
  };

  if (!root) {
    // The door only appears once there is bloodstock, but guard anyway.
    openBreeding();
    return;
  }

  teardown?.();
  app.innerHTML = '';
  teardown = mountArchiveScreen(app, {
    stable,
    root,
    playerSilks: inTraining?.playerSilks,
    rootLegacyPoints: inTraining?.horseLegacy?.points,
    onBack: goBack,
    onBreed: openBreeding,
  });
}

function showYearlings(stable: Stable, playerSilks: Silks): void {
  teardown?.();
  app.innerHTML = '';
  teardown = mountYearlingScreen(app, {
    stable,
    onBuy: (horse, yard) => startCareer(horse, playerSilks, yard),
    onBack: () => showNextHorse(stable, playerSilks),
  });
}

function showMainMenu(): void {
  teardown?.();
  app.innerHTML = '';

  const savedCareer = loadCareer();

  const callbacks: MainMenuCallbacks = {
    onNewGame: () => {
      // Starting fresh while a horse is mid-career would drop everything that
      // horse has earned the yard, because its legacy only banks on retirement.
      if (savedCareer) {
        const peak = savedCareer.horseLegacy?.peak ?? 0;
        showNotice(app, {
          icon: '🐎',
          title: 'Retire the current horse?',
          lines: [
            `${savedCareer.horse.name} is still in training with ${peak} legacy to its name.`,
            'Taking on a new horse retires this one and banks that prestige to the yard.',
          ],
          hint: 'Your facilities, staff, cash and prestige carry over either way.',
          tone: 'warning',
          actions: [
            { label: 'Keep Racing', variant: 'secondary' },
            {
              label: 'Retire & Start New',
              onSelect: () => {
                const yard = retireCurrentHorse(savedCareer);
                teardownMenu();
                nextHorseRoute(yard, savedCareer.playerSilks);
              },
            },
          ],
        });
        return;
      }
      teardownMenu();
      nextHorseRoute(loadStable(), DEFAULTS.playerSilksDefault);
    },
    onBloodstock: () => {
      teardownMenu();
      showArchive();
    },
    onExport: () => {
      const blob = new Blob([exportSave()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = saveFileName();
      a.click();
      URL.revokeObjectURL(url);
      showNotice(app, {
        icon: '💾',
        title: 'Save Backed Up',
        lines: ['A copy of your stable has been downloaded.'],
        hint: 'Keep it somewhere safe — restoring it brings the whole yard back.',
        tone: 'positive',
      });
    },
    onResetStable: () => {
      const yard = savedCareer?.stable ?? loadStable();
      const prestige = yard ? yard.legacy.archivedPoints : 0;
      const built = yard
        ? Object.values(yard.facilities).filter((l) => l > 0).length
        : 0;

      showNotice(app, {
        icon: '🔥',
        title: 'Start a New Stable?',
        lines: [
          `This permanently deletes your yard: ${prestige} banked prestige, ${built} built facilit${built === 1 ? 'y' : 'ies'}, all staff, supplies and rival records.`,
          'It cannot be undone, and no backup is kept.',
        ],
        hint: 'Back Up Save first if there is any chance you want this yard again.',
        tone: 'setback',
        input: { label: 'Type DELETE to confirm', placeholder: 'DELETE', required: true },
        actions: [
          { label: 'Cancel', variant: 'secondary' },
          {
            label: 'Delete Everything',
            onSelect: ({ value }) => {
              // A required field only guarantees *something* was typed, so the
              // word itself still has to be checked here.
              if (value.trim().toUpperCase() !== 'DELETE') {
                showNotice(app, {
                  icon: '✋',
                  title: 'Not Deleted',
                  lines: ['You did not type DELETE, so nothing was changed.'],
                  tone: 'neutral',
                });
                return;
              }
              resetEverything();
              showNotice(
                app,
                {
                  icon: '🌱',
                  title: 'New Stable',
                  lines: ['Everything has been cleared. Your next horse starts from nothing.'],
                  tone: 'neutral',
                },
                showMainMenu,
              );
            },
          },
        ],
      });
    },
    onImport: (text) => {
      const result = importSave(text);
      if (!result.ok) {
        showNotice(app, {
          icon: '⚠️',
          title: 'Could Not Restore',
          lines: [result.error ?? 'That save could not be read.'],
          hint: 'Your existing save has not been touched.',
          tone: 'setback',
        });
        return;
      }
      showNotice(
        app,
        {
          icon: '📦',
          title: 'Save Restored',
          lines: [result.summary ?? 'Your stable is back.'],
          tone: 'positive',
        },
        showMainMenu,
      );
    },
    ...(savedCareer && {
      onContinue: () => {
        teardownMenu();
        resumeCareer(savedCareer);
      },
    }),
  };

  const yard = savedCareer?.stable ?? loadStable();
  callbacks.hasStable = !!yard;
  // The door only appears once there is something behind it — which is true
  // the moment a horse exists at all, not only once one has been retired. A
  // first-ever horse still in training has no bloodstock yet, but it is
  // itself a one-node tree worth opening.
  callbacks.hasBloodstock = (yard?.bloodstock?.length ?? 0) > 0 || !!savedCareer;

  const teardownMenu = mountMainMenu(app, callbacks);

  // If loading had to fall back to a backup, say so — a silent recovery leaves
  // the player unable to tell a restored save from a lost one.
  const recovery = takeRecoveryNotice();
  if (recovery) {
    showNotice(app, {
      icon: '🛟',
      title: 'Save Recovered',
      lines: [recovery],
      hint: 'Back up your save from this menu to keep a copy of your own.',
      tone: 'warning',
    });
  }
}

function showStarterSelection(): void {
  teardown?.();
  app.innerHTML = '';

  // A better-known yard is offered better horses. generateStarterSix has always
  // taken this, but the call site passed a hardcoded 0, so the pool never moved.
  const yard = loadStable();
  const prestige = yard ? yard.legacy.archivedPoints : 0;

  teardown = mountStarterSelection(
    app,
    (selectedHorse, selectedSilks) => {
      startCareer(selectedHorse, selectedSilks);
    },
    prestige,
  );
}

/**
 * Puts a horse into training, whether it was bred, bought or chosen.
 *
 * The yard is passed through when the caller already holds it — breeding and
 * buying both mutate it (a pairing recorded, cash spent) and that copy is the
 * current one. Starter selection has no yard in hand and lets `createNewCareer`
 * load it.
 */
function startCareer(horse: Horse, playerSilks: Silks, stable?: Stable): void {
  const career = createNewCareer(horse, playerSilks, stable);
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
        showNotice(app, {
          icon: '🏋️',
          title: 'Already Trained',
          lines: [`${career.horse.name} has done its work for the week.`],
          hint: "It's ready to run whenever you are — pick a race from the calendar.",
          tone: 'neutral',
        });
        return;
      }
      showTrainingScreen(career);
    },
    onRaceCalendar: () => {
      // If training not done yet, warn player
      if (!career.trainingDoneThisWeek && shouldShowNoTrainingWarning()) {
        showNotice(app, {
          icon: '⚠️',
          title: 'No Training Yet',
          lines: [
            `${career.horse.name} hasn't been worked this week, so it'll run on the form it already has.`,
          ],
          // The point of this warning is the improvement being left behind, not a
          // penalty and not a cost. Said in a trainer's language rather than the
          // game's — DESIGN.md §12 keeps the stable screens warm and tactile, and
          // naming the numbers outright would break that.
          hint: "Time on the training grounds is where a horse finds its edge — this one heads to the gate without it.",
          tone: 'warning',
          checkbox: { label: "Don't show again" },
          actions: [
            {
              label: 'Back to Hub',
              variant: 'secondary',
              onSelect: ({ checked }) => {
                if (checked) disableNoTrainingWarning();
              },
            },
            {
              label: 'Go to Calendar',
              onSelect: ({ checked }) => {
                if (checked) disableNoTrainingWarning();
                showRaceCalendar(career);
              },
            },
          ],
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
      teardown?.();
      app.innerHTML = '';
      teardown = mountStaffScreen(app, career, () => showStableHub(career));
    },
    onConsumables: () => {
      teardown?.();
      app.innerHTML = '';
      teardown = mountConsumablesScreen(app, career, () => showStableHub(career));
    },
    onDossier: () => {
      teardown?.();
      app.innerHTML = '';
      teardown = mountRivalDossierScreen(app, career, () => showStableHub(career));
    },
    onLegacy: () => {
      teardown?.();
      app.innerHTML = '';
      teardown = mountLegacyScreen(app, career, () => showStableHub(career));
    },
    onArchive: () => showArchive(career),
    onRetire: () => {
      const value = getRetirementValue(career.horseLegacy, career.careerEndedByInjury === true);
      const peak = career.horseLegacy.peak;
      showNotice(app, {
        icon: '🏛️',
        title: `Retire ${career.horse.name}?`,
        lines: [
          `${career.stats.wins} wins from ${career.stats.racesCompleted} starts, peaking at ${peak} legacy.`,
          value.reason === 'sound'
            ? `Retiring on top: banks ${value.base} prestige plus a ${value.bonus} bonus for stopping at its best.`
            : value.reason === 'injured'
              ? `Retiring hurt, so it banks its full peak of ${value.banked} regardless.`
              : `It has slipped to ${value.base} from a peak of ${peak}, and banks the ${value.base} it still holds.`,
        ],
        hint:
          value.reason === 'faded'
            ? 'Racing on can still lift its peak, but every beaten run costs what it banks.'
            : 'It joins your bloodstock at full worth.',
        tone: 'neutral',
        actions: [
          { label: 'Keep Racing', variant: 'secondary' },
          {
            label: 'Retire',
            onSelect: () => showCareerRecap(career),
          },
        ],
      });
    },
    onRest: () => {
      // A week off: recovers condition and morale, works down a lay-off, and
      // advances the calendar without a race. This is the lever that makes an
      // injury survivable and a jaded horse manageable.
      const change = applyRestWeek(career.horse, career.stable.facilities);
      const before = career.weeksInjured ?? 0;
      const after = Math.max(0, before - 1);

      const rested: Career = {
        ...career,
        week: career.week + 1,
        trainingDoneThisWeek: false,
        raceSelected: false,
        weeksInjured: after,
      };
      if (after === 0) delete rested.injuryName;
      saveCareer(rested);

      const parts: string[] = [];
      if (change.condition) parts.push(`${change.condition > 0 ? '+' : ''}${change.condition} condition`);
      if (change.morale) parts.push(`${change.morale > 0 ? '+' : ''}${change.morale} morale`);

      showStableHub(rested);
      showNotice(app, {
        icon: '🌙',
        title: 'A Week Off',
        lines: [
          parts.length
            ? `${rested.horse.name}: ${parts.join(', ')}.`
            : `${rested.horse.name} is already as fresh as this yard can get it.`,
          ...(before > 0
            ? [
                after > 0
                  ? `${after} week${after === 1 ? '' : 's'} of the lay-off still to go.`
                  : 'Passed sound — it can race again.',
              ]
            : []),
        ],
        tone: before > 0 && after === 0 ? 'positive' : 'neutral',
      });
    },
  });
}

function showTrainingScreen(career: Career): void {
  teardown?.();
  app.innerHTML = '';

  // The grounds and the head trainer stack: a well-built yard with a good
  // trainer gets substantially more out of the same week's work.
  const gainMultiplier =
    getTrainingMultiplier(career.stable.facilities) *
    (1 + getTrainerBonus(career.stable.staff.trainer.level));

  teardown = mountTrainingScreen(
    app,
    career.horse,
    career.playerSilks,
    (updatedHorse, _session) => {
      const updatedCareer = { ...career, horse: updatedHorse, trainingDoneThisWeek: true };
      saveCareer(updatedCareer);
      showStableHub(updatedCareer);
    },
    gainMultiplier,
  );
}

function showRaceCalendar(career: Career): void {
  teardown?.();
  app.innerHTML = '';

  // An injured horse cannot be entered. Resting is the only way through, and
  // it is what advances the lay-off, so the player is never stuck.
  const layoff = career.weeksInjured ?? 0;
  if (layoff > 0) {
    showStableHub(career);
    showNotice(app, {
      icon: '🩹',
      title: `${career.horse.name} is Sidelined`,
      lines: [
        `Recovering from ${career.injuryName ?? 'an injury'}.`,
        `${layoff} week${layoff === 1 ? '' : 's'} of rest still to go.`,
      ],
      hint: 'Rest the week from the hub to bring it back sooner.',
      tone: 'warning',
    });
    return;
  }

  // Check if player is ready for promotion or at demotion risk
  const isPromotionReady = career.horse.divisionPoints >= 5 && career.horse.divisionLevel < 4;
  const isDemotionRisk = career.horse.divisionPoints <= -3 && career.horse.divisionLevel > 0;

  // Show demotion warning if at risk
  if (isDemotionRisk) {
    showNotice(
      app,
      {
        icon: '⚠️',
        title: 'Demotion Risk',
        lines: [
          "This week's card is a Division Qualifier. Finish in the top 4 to hold your place.",
          'Finish 5th or worse and you drop to the division below.',
        ],
        hint: 'A session on the training grounds before this one counts for a lot.',
        tone: 'warning',
        buttonLabel: 'Understood',
      },
      mountCalendarUI,
    );
    return;
  }

  // Show promotion ready alert if applicable
  if (isPromotionReady) {
    showNotice(
      app,
      {
        icon: '🏆',
        title: 'Ready for Promotion!',
        lines: [
          "You've proven yourself in this division, so this week's card features a Promotion Test.",
          'Finish in the top 4 to advance.',
        ],
        hint: 'Fall short and you keep your division and 2 points — another shot comes around soon.',
        tone: 'positive',
        buttonLabel: "Let's Go",
      },
      mountCalendarUI,
    );
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
    }, `calendar-${career.horse.id}-${career.horse.starts}`, {
      division: career.horse.division,
      isPromotionReady,
      isDemotionRisk,
    });
  }
}

function startRaceWithHorse(
  career: Career,
  race?: RaceOption,
  choices?: RaceDayChoices,
): void {
  const player = career.horse;

  // Validate player horse exists and has required properties
  if (!player || !player.id) {
    console.error('Invalid player horse in career:', player);
    showMainMenu();
    return;
  }

  // Your stable jockey takes the mount. Rivals keep the skill they were
  // generated with, so hiring up is a real edge over the field.
  player.jockeySkill = getJockeySkill(career.stable.staff.jockey.level);

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

      // The calendar's difficulty rating decides *which* rivals turn up, not
      // just how loud the crowd is. Sorting the division by rating and sliding
      // the selection window with the rating is what makes a hard race
      // genuinely hard — and therefore what earns it the bigger purse and the
      // longer odds. Without this the difficulty bars were decoration.
      const rng = createRng('field-select-' + Date.now());
      const need = FIELD_SIZE - 1;
      const ranked = [...rivalCandidates].sort((a, b) => rateHorse(b) - rateHorse(a));
      const windowStart = Math.round((1 - raceHype) * Math.max(0, ranked.length - need));
      const selected = rng.shuffle(ranked.slice(windowStart, windowStart + need));

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

  // Race day comes first: items and a bet are committed before the field is
  // shown, so they are decided without knowing how the race unfolds.
  if (!choices) {
    const difficulty = race?.hype ?? 0.5;
    teardown = mountRaceDayScreen(
      app,
      career,
      field,
      {
        name: race?.name ?? 'Next Race',
        distance: race?.distance ?? 1400,
        going: race?.going ?? 'good',
        purse: getPurse(player.division, difficulty),
        toWinner: getPrizeMoney(player.division, 1, difficulty),
      },
      (made) => startRaceWithHorse(career, race, made),
      () => showRaceCalendar(career),
      (resume) => {
        // Race Day hides itself before calling, so the dossier mounts over a
        // screen that is still holding the items and bet already chosen.
        const dossierTeardown = mountDossierScreen(
          app,
          field,
          player,
          career.stable.dossier,
          () => {
            dossierTeardown();
            resume();
          },
        );
      },
    );
    return;
  }

  // Race-day items lift a copy of the horse, so the boost lasts one race only.
  const runner = applyRaceDayItems(player, choices.items);
  field = field.map((h) => (h.id === player.id ? runner : h));
  const placedBet: PlacedBet | null = choices.bet;

  let introTeardown: (() => void) | null = null;
  let raceScreenTeardown: (() => void) | null = null;

  const startRaceScreen = () => {
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
      // Your own horse: ceilings shown as bands. Rivals elsewhere show none.
      const infoBoxCleanup = attachInfoBox(playerHorseNameEl, player, career.playerSilks, true);

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

          // The dossier is permanent, so it keeps its own copy of the name and
          // the head-to-head rather than depending on the rival still existing.
          if (!updatedCareer.stable.dossier[placing.id]) {
            updatedCareer.stable.dossier[placing.id] = {
              name: rival?.name ?? placing.name,
              wins: 0,
              places: 0,
              shows: 0,
              starts: 0,
              division: rival?.division || 'maiden',
              lastSeen: updatedCareer.week,
              meetings: 0,
              beaten: 0,
            };
          }
          const entry = updatedCareer.stable.dossier[placing.id];
          if (entry) {
            entry.name = rival?.name ?? entry.name;
            entry.division = rival?.division ?? entry.division;
            entry.starts += 1;
            if (i === 0) entry.wins += 1;
            if (i === 1 || i === 2) entry.places += 1;
            if (i === 3) entry.shows += 1;
            entry.lastSeen = updatedCareer.week;
            entry.meetings += 1;
            // playerIndex is this race's finishing slot for the player.
            if (playerIndex !== -1 && playerIndex < i) entry.beaten += 1;
          }
        }

        // The rest of the world raced this week too. Without this, a rival only
        // ever has a record from meeting YOU — and since a good player wins
        // most of their own races, that left every horse in the world on zero
        // wins forever, which in turn left every outside stud priced on its
        // division alone (sim/worldRacing.ts).
        runWorldMeeting(
          createRng(`world-${player.id}-${updatedCareer.horse.starts}-${updatedCareer.week}`),
          updatedCareer.stable.world,
          new Set(placings.map((p) => p.id)),
        );

        // Update player horse records and division progression
        const playerFinishingPosition = playerIndex + 1;
        const { earnings } = calculateRaceRewards(
          player.division,
          playerFinishingPosition,
          updatedCareer.stable.facilities,
          raceHype,
        );

        if (playerIndex === 0) {
          updatedCareer.stats.wins += 1;
          updatedCareer.horse.wins += 1;
        } else {
          updatedCareer.stats.losses += 1;
        }
        // Every rival in the loop above gets places/shows recorded on the same
        // index; the player horse never did, so `horse.places`/`horse.shows`
        // sat frozen at 0 for the one horse a player could actually check —
        // invisible until the Archive's "Top 3" became the first place in the
        // game to read them back for your own horse.
        if (playerIndex === 1 || playerIndex === 2) updatedCareer.horse.places += 1;
        if (playerIndex === 3) updatedCareer.horse.shows += 1;

        updatedCareer.stats.totalEarnings += earnings;
        updatedCareer.stable.cash += earnings;

        // Settle any bet. The stake already left the wallet at race day, so
        // only the return comes back here.
        const settlement = placedBet
          ? settleBet(placedBet, playerFinishingPosition, placings.length)
          : null;
        if (settlement) updatedCareer.stable.cash += settlement.payout;
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

        // Shown over the results once they are up, rather than as a native alert.
        let divisionNotice: NoticeOptions | null = null;

        if (isPromotionRace) {
          const divBefore = updatedCareer.horse.divisionLevel;
          finalizePromotion(updatedCareer.horse, playerFinishingPosition);
          const divAfter = updatedCareer.horse.divisionLevel;

          if (divAfter > divBefore) {
            divisionNotice = {
              icon: '🎉',
              title: `Promoted to ${DIVISIONS[divAfter]}!`,
              lines: [
                `${updatedCareer.horse.name} has earned a place in the ${DIVISIONS[divAfter]} division.`,
              ],
              hint: 'The competition steps up from here — but so do the purses and the prestige.',
              tone: 'positive',
            };
          } else {
            // Falling short of a promotion is not a demotion. The horse holds its
            // division and keeps most of its points, so say so plainly.
            divisionNotice = {
              icon: '🎯',
              title: 'So Close!',
              lines: [
                `${updatedCareer.horse.name} stays in ${DIVISIONS[divBefore]} for now.`,
                'You held onto 2 division points, so another promotion race is not far off.',
              ],
              hint: 'Keep training and placing well to earn your next shot.',
              tone: 'neutral',
            };
          }
        } else if (isDemotionRace) {
          const divBefore = updatedCareer.horse.divisionLevel;
          finalizeDemotion(updatedCareer.horse, playerFinishingPosition);
          const divAfter = updatedCareer.horse.divisionLevel;

          if (divAfter < divBefore) {
            divisionNotice = {
              icon: '📉',
              title: `Dropped to ${DIVISIONS[divAfter]}`,
              lines: [
                `${updatedCareer.horse.name} moves back to the ${DIVISIONS[divAfter]} division.`,
                'Your division points reset to 0.',
              ],
              hint: 'An easier field is a chance to rebuild form and climb straight back.',
              tone: 'setback',
            };
          } else {
            divisionNotice = {
              icon: '✅',
              title: 'Safe!',
              lines: [
                `${updatedCareer.horse.name} holds its place in ${DIVISIONS[divBefore]}.`,
                'Your division points reset to 0.',
              ],
              hint: 'Fresh start in this division — build those points back up.',
              tone: 'positive',
            };
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
            newDivisionLevel: divisionLevelAfter,
            // A qualifier is a one-off against a division you are not in yet.
            qualifier: isPromotionRace || isDemotionRace,
          },
        );

        let hallOfFameNotice: NoticeOptions | null = null;
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
          hallOfFameNotice = {
            icon: '⭐',
            title: 'Hall of Fame',
            lines: [
              `${updatedCareer.horse.name} has been inducted with ${updatedCareer.horseLegacy.peak} legacy points.`,
            ],
            hint: 'This honour is permanent — no run of bad form can take it away.',
            tone: 'positive',
          };
        }

        // The race takes its toll on the horse, and the yard's facilities give
        // some of it back over the following week.
        applyRaceUpkeep(
          updatedCareer.horse,
          playerFinishingPosition,
          placings.length,
          updatedCareer.stable.facilities,
        );

        updatedCareer.stats.racesCompleted += 1;

        // A season may turn on this race. Past the peak that costs the horse
        // something, which is what makes retiring a judgement rather than a
        // race counter.
        const ageing = advanceSeasonIfDue(
          updatedCareer.horse,
          updatedCareer.stats.racesCompleted,
        );
        if (ageing.aged) updatedCareer.season = updatedCareer.horse.age - 1;

        // Did the horse come home sound? Risk rises with tiredness and age, and
        // the Medical Wing is what buys it down.
        const injury = rollForInjury(
          updatedCareer.horse,
          updatedCareer.stable.facilities,
          createRng(`injury-${updatedCareer.horse.id}-${updatedCareer.stats.racesCompleted}`),
        );
        if (injury) {
          applyInjury(updatedCareer.horse, injury);
          if (isCareerEnding(injury)) {
            updatedCareer.careerEndedByInjury = true;
          } else {
            updatedCareer.weeksInjured = injury.weeksOut;
            updatedCareer.injuryName = injury.name;
          }
        }

        const injuryNotice: NoticeOptions | null = injury
          ? {
              icon: isCareerEnding(injury) ? '🏛️' : '🩹',
              title: injury.name,
              lines: isCareerEnding(injury)
                ? [
                    `${updatedCareer.horse.name} will not race again.`,
                    injury.description,
                  ]
                : [injury.description, `Out for ${injury.weeksOut} week${injury.weeksOut === 1 ? '' : 's'}.`],
              ...(isCareerEnding(injury)
                ? {
                    hint: 'It retires with its full breeding value and a Legacy marker — its foals carry an edge.',
                  }
                : { hint: 'A better Medical Wing shortens and prevents these.' }),
              tone: 'setback' as const,
            }
          : null;

        const ageingNotice: NoticeOptions | null = ageing.aged
          ? {
              icon: ageing.stage === 'declining' ? '🍂' : '🎂',
              title: `${updatedCareer.horse.name} turns ${ageing.newAge}`,
              lines:
                ageing.stage === 'declining'
                  ? [
                      'Age is starting to tell. Speed and burst are going first.',
                      describeStatChanges(ageing.changes),
                    ].filter(Boolean)
                  : ageing.stage === 'peak'
                    ? ['This is the season a horse is at its best.']
                    : ['Still growing — training lands hardest at this age.'],
              ...(ageing.stage === 'declining' && {
                hint: 'Retiring on top protects what this horse passes on. Racing on is a gamble.',
              }),
              tone: ageing.stage === 'declining' ? ('setback' as const) : ('positive' as const),
            }
          : null;
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
            // A career-ending injury stops the horse whatever the player wants;
            // §6 compensates with full breeding value rather than a penalty.
            // Otherwise 20 starts is the hard ceiling of a 2-5 racing life, and
            // everything before it is the player's call from the hub.
            if (updatedCareer.careerEndedByInjury || updatedCareer.stats.racesCompleted >= 20) {
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

        // Stack any notices over the results, so the player reads the outcome
        // with the finishing order already behind it.
        const betNotice: NoticeOptions | null = settlement
          ? {
              icon: settlement.won ? '🎟️' : '🎫',
              title: settlement.won ? 'Bet Paid' : 'Bet Lost',
              lines: [
                settlement.won
                  ? `Your $${settlement.stake.toLocaleString()} returned $${settlement.payout.toLocaleString()}.`
                  : `Your $${settlement.stake.toLocaleString()} stake is gone.`,
              ],
              hint: settlement.won
                ? `A profit of $${settlement.net.toLocaleString()} on the day.`
                : 'The bookmaker holds an edge on every race — bet the ones you believe in.',
              tone: settlement.won ? 'positive' : 'setback',
            }
          : null;

        const notices = [
          divisionNotice,
          betNotice,
          injuryNotice,
          ageingNotice,
          hallOfFameNotice,
        ].filter(
          (n): n is NoticeOptions => n !== null,
        );
        const showNext = (): void => {
          const next = notices.shift();
          if (next) showNotice(app, next, showNext);
        };
        showNext();
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
      // The real purse for this division at this difficulty. It used to be a
      // hardcoded $1,000 on every race in the game.
      prize: getPurse(player.division, raceHype),
      toWinner: getPrizeMoney(player.division, 1, raceHype),
    };

    introTeardown = mountRaceIntro(introStage, introConfig, showActualRaceScreen);
  };

  // Start with race intro
  startRaceScreen();

  teardown = () => {
    introTeardown?.();
    raceScreenTeardown?.();
  };
}
