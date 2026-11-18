import '../style.css';
import './demo.css';
import { createDemoStarters, createDemoField, demoDistance, trainDemoHorse } from './scenario.js';
import { mountStarterSelection } from '../ui/starterSelection.js';
import { mountRaceScreen } from '../ui/raceScreen.js';
import { mountResultsScreen } from '../ui/resultsScreen.js';
import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';
import type { RunnerSnapshot } from '../sim/race/engine.js';

const STORE = 'https://haydenmay.itch.io/bloodline-horse-racing-breeding';
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing app');
const app: HTMLDivElement = root;
let cleanup: (() => void) | undefined;
let horse: Horse;
let silks: Silks;
let raceNumber = 1;

function clear(): void { cleanup?.(); cleanup = undefined; app.replaceChildren(); }
function intro(): void {
  clear();
  app.innerHTML = `<main class="demo-card demo-intro"><p class="demo-kicker">A BLOODLINE DEMO</p><h1>Every champion<br><em>starts somewhere.</em></h1><p>Choose your horse, take the reins for two races, and see where your story begins.</p><button class="demo-primary" id="start">Choose your horse <span>→</span></button><small>Two races · No account or save required</small></main>`;
  app.querySelector('#start')!.addEventListener('click', starters);
}
function starters(): void {
  clear(); raceNumber = 1;
  cleanup = mountStarterSelection(app, (selected, colors) => { horse = selected; silks = colors; raceIntro(); }, 0, [], createDemoStarters());
}
function raceIntro(): void {
  clear();
  app.innerHTML = `<main class="demo-card"><p class="demo-kicker">RACE ${raceNumber} OF 2</p><h1>${horse.name} is ready.</h1><p>Your horse has a natural running style. Spend bursts wisely and find the right moment to make your move.</p><div class="demo-tips"><p><strong>BURST</strong> Tap the track or press Space to push.</p><p><strong>SETTLE</strong> Hold the track or hold ↓ to conserve energy.</p><p><strong>WATCH</strong> Keep an eye on your position and burst charges.</p></div><button class="demo-primary" id="race">Head to the track <span>→</span></button></main>`;
  app.querySelector('#race')!.addEventListener('click', runRace);
}
function runRace(): void {
  clear();
  const field = createDemoField(horse);
  app.innerHTML = `<main class="demo-race"><div class="demo-race-header"><div><span>RACE ${raceNumber} / 2</span><strong>${horse.name}</strong></div><p>Tap track or Space: burst · Hold track or ↓: settle</p><button id="burst" class="demo-primary">Burst</button></div><div class="stage demo-stage"></div></main>`;
  const stage = app.querySelector<HTMLElement>('.demo-stage')!;
  const burst = app.querySelector<HTMLButtonElement>('#burst')!;
  cleanup = mountRaceScreen({host: stage, field, playerHorseId: horse.id, playerSilks: silks, config: { seed: `bloodline-demo-race-${raceNumber}`, metres: demoDistance(horse), going: 'good', hype: 0.5 }, burstButton: burst, autoStartCountdown: true, onFinish: (placings) => { setTimeout(() => results(placings, field), 1200); }});
}
function results(placings: RunnerSnapshot[], field: Horse[]): void {
  clear();
  cleanup = mountResultsScreen(app, placings, horse.id, () => raceNumber === 1 ? training() : showcase(), field);
  const button = app.querySelector<HTMLButtonElement>('#return-btn');
  if (button) button.textContent = raceNumber === 1 ? 'Choose training →' : 'Continue →';
}
function training(): void {
  clear();
  app.innerHTML = `<main class="demo-card demo-training"><p class="demo-kicker">BETWEEN RACES</p><h1>Make your next move.</h1><p>Choose a real training session. Each shapes ${horse.name}'s attributes differently; race results still depend on the horse, field and ride.</p><div class="demo-training-grid"><button data-session="sprintWork"><strong>Sprint Work</strong><span>Speed +4 · Burst +2</span><small>Stamina −2</small></button><button data-session="swimming"><strong>Swimming</strong><span>Stamina +4 · Burst +2</span><small>Grit −2</small></button><button data-session="crossTraining"><strong>Cross Training</strong><span>Speed +1 · Stamina +1 · Burst +1</span><small>A gentler, balanced session</small></button></div><p class="demo-note">Actual gains depend on age, potential and possible breakthroughs.</p></main>`;
  app.querySelectorAll<HTMLButtonElement>('[data-session]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.session as 'sprintWork' | 'swimming' | 'crossTraining';
    const before = horse.stats;
    const outcome = trainDemoHorse(horse, id); horse = outcome.horse; raceNumber = 2;
    const changes = Object.entries(horse.stats).map(([key, value]) => ({key, delta: value - before[key as keyof typeof before]})).filter(x => x.delta !== 0).map(x => `${x.key} ${x.delta > 0 ? '+' : ''}${Number(x.delta.toFixed(1))}`).join(' · ');
    clear(); app.innerHTML = `<main class="demo-card"><p class="demo-kicker">TRAINING COMPLETE</p><h1>${outcome.isBreakthrough ? 'A breakthrough!' : 'Work put in.'}</h1><p>${changes || 'No attribute changes this time.'}</p><p>${outcome.newTrait ? `New trait gained: ${outcome.newTrait}.` : 'Now put your horse to the test in race two.'}</p><button class="demo-primary" id="next">Prepare for race two →</button></main>`;
    app.querySelector('#next')!.addEventListener('click', raceIntro);
  }));
}
function showcase(): void {
  clear();
  app.innerHTML = `<main class="demo-card demo-showcase"><p class="demo-kicker">THE STORY CONTINUES</p><h1>Your Bloodline<br><em>Is Just Beginning</em></h1><p>Two races are only the start. In the full Early Access game, build a stable that lasts beyond a single horse.</p><div class="demo-features"><div><b>01</b><strong>Train & race</strong><span>Develop horses and compete across divisions.</span></div><div><b>02</b><strong>Breed a legacy</strong><span>Pair horses and pass traits and genetics to the next generation.</span></div><div><b>03</b><strong>Build your stable</strong><span>Manage your yard and trace your family tree.</span></div></div><a class="demo-primary" href="${STORE}" target="_blank" rel="noopener noreferrer">Explore the full game · $1.99 ↗</a><button class="demo-replay" id="replay">Replay the demo</button><small>Early Access · Windows download</small></main>`;
  app.querySelector('#replay')!.addEventListener('click', intro);
}
intro();
