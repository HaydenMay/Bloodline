import type { Horse } from '../sim/types.js';
import { STAT_KEYS, applyTrainedStat, getAgeTrainingFactor } from '../sim/growth.js';
import { attachStatReveal, renderStatRows } from './statDisplay.js';
import { TRAITS } from '../data/traits.js';
import type { TraitId } from '../data/traits.js';
import { createSurface, startLoop } from '../render/canvas.js';
import { loadFrameSequence, drawFrame, type DrawFrameOptions } from '../render/frameAnimation.js';
import { coatForHorse, type Silks } from '../render/palette.js';

export interface TrainingSession {
  id: string;
  name: string;
  description: string;
  statEffects: {
    speed?: number;
    stamina?: number;
    grit?: number;
    burst?: number;
    temper?: number;
    consistency?: number;
  };
  traitPool: TraitId[];
}

export type StatEffects = TrainingSession['statEffects'];

/**
 * What a session is actually worth to this horse.
 *
 * The Training Grounds, the head trainer and the horse's own age all scale what
 * a session gives. Only gains scale — a session's downsides are never softened,
 * so an upgraded yard makes the trade-offs sharper rather than free.
 *
 * The training cards and the session itself both run through here, because they
 * used to compute this separately: the card showed the unscaled figure while the
 * session applied the scaled one, so a card promising +1 stamina handed back +3.
 */
export function scaleTrainingEffects(
  effects: StatEffects,
  multiplier: number,
  /** Training Grounds' downside relief, 0 (full cost) to 1 (no downside at all). */
  downsideRelief = 0,
): StatEffects {
  const scaled: StatEffects = { ...effects };

  for (const key of Object.keys(scaled) as Array<keyof StatEffects>) {
    const change = scaled[key];
    if (change === undefined) continue;
    if (change > 0) {
      if (multiplier !== 1) scaled[key] = Math.round(change * multiplier);
    } else if (change < 0 && downsideRelief > 0) {
      scaled[key] = Math.round(change * (1 - downsideRelief));
    }
  }
  return scaled;
}

export const TRAINING_SESSIONS: Record<string, TrainingSession> = {
  // Sessions rebuilt from an audit (ROADMAP.md): the original five here
  // predated every trade-off session below them and had fallen well behind —
  // net +2/+3 with no downside, against a +4 ceiling everywhere else, so an
  // experienced player had no reason to ever pick them. `restDay` was worse
  // than that: strictly dominated by `routineWork`, which gives everything it
  // gives plus Consistency for the same zero cost. Cut outright.
  //
  // Gate Practice, Gallops Work and Recovery are rebuilt to the same net +4,
  // real-trade-off shape as the rest of the roster. Two of them are rethemed
  // onto Consistency, which had only two sessions treating it as the main
  // event against three-to-five for every other stat — added late, per
  // DESIGN.md's own history, and never caught up.
  //
  // Cross Training keeps its old, gentle, zero-downside shape rather than
  // joining the trade-off tier — found in play: a trade-off session goes net
  // NEGATIVE the instant its gain stats hit their exact ceiling, because a
  // loss is never softened by `applyTrainedStat` the way a gain is. Cutting
  // four of the five old safe sessions down to one (`routineWork`) left a
  // horse nearing full development with no way to safely top off Speed,
  // Burst or Grit. Cross Training and `stableChores` (below) are what restore
  // that: every one of the six stats now has at least one genuinely
  // zero-downside path, smaller than the trade-off tier by design — safe and
  // modest is the trade against big and risky, not a trap.
  gatePractice: {
    id: 'gatePractice',
    name: 'Gate Practice',
    description: 'A clean break, drilled until it repeats itself without thinking.',
    statEffects: { consistency: 3, speed: 2, temper: -1 },
    traitPool: ['alert', 'professional'],
  },
  gallopsWork: {
    id: 'gallopsWork',
    name: 'Gallops Work',
    description: 'Long, steady miles — stamina built the unglamorous way.',
    statEffects: { stamina: 3, grit: 2, speed: -1 },
    traitPool: ['cruiser', 'relentless'],
  },
  recovery: {
    id: 'recovery',
    name: 'Recovery Day',
    description: 'The same disciplined downtime, every time — nothing left to chance.',
    statEffects: { consistency: 3, stamina: 2, temper: -1 },
    traitPool: ['tractable', 'goodDoer'],
  },
  crossTraining: {
    id: 'crossTraining',
    name: 'Cross Training',
    description: 'A gentle spread across the board. Small, safe, no cost.',
    statEffects: { speed: 1, stamina: 1, burst: 1 },
    traitPool: ['professional', 'tractable'],
  },
  stableChores: {
    id: 'stableChores',
    name: 'Stable Chores',
    description: 'Mucking out, leading, grooming. Unglamorous, and nothing risked.',
    statEffects: { grit: 2, temper: 1 },
    traitPool: ['grinder', 'bulldozer'],
  },
  swimming: {
    id: 'swimming',
    name: 'Swimming',
    description: 'Intensive cardiovascular conditioning.',
    statEffects: { stamina: 4, burst: 2, speed: -2 },
    traitPool: ['ironLungs', 'quickRecovery'],
  },
  sprintWork: {
    id: 'sprintWork',
    name: 'Sprint Work',
    description: 'Explosive speed development.',
    statEffects: { speed: 4, burst: 2, stamina: -2 },
    traitPool: ['turnOfFoot', 'fastGate'],
  },
  hillRepeats: {
    id: 'hillRepeats',
    name: 'Hill Repeats',
    description: 'Grueling uphill intervals.',
    statEffects: { grit: 3, stamina: 2, speed: -1 },
    traitPool: ['grinder', 'bulldozer'],
  },
  breezing: {
    id: 'breezing',
    name: 'Breezing',
    description: 'Half-speed gallop conditioning.',
    statEffects: { speed: 2, burst: 1, stamina: -1 },
    traitPool: ['turnOfFoot', 'relentless'],
  },
  tempoWork: {
    id: 'tempoWork',
    name: 'Tempo Work',
    description: 'Sustained effort training.',
    statEffects: { stamina: 2, burst: 1, grit: -1 },
    traitPool: ['cruiser', 'ironLungs'],
  },
  jumpingDrills: {
    id: 'jumpingDrills',
    name: 'Jumping Drills',
    description: 'Agility and coordination work.',
    statEffects: { burst: 2, temper: 1, speed: -1 },
    traitPool: ['alert', 'coiled'],
  },
  intervalTraining: {
    id: 'intervalTraining',
    name: 'Interval Training',
    description: 'High-intensity alternating pace.',
    statEffects: { speed: 3, stamina: 2, temper: -2 },
    traitPool: ['turnOfFoot', 'professional'],
  },
  schooling: {
    id: 'schooling',
    name: 'Racecourse Schooling',
    description: 'Parade ring, stalls and crowd, without the race.',
    statEffects: { consistency: 3, temper: 2, burst: -1 },
    traitPool: ['professional', 'alert'],
  },
  routineWork: {
    id: 'routineWork',
    name: 'Settled Routine',
    description: 'The same work, the same order, every morning.',
    statEffects: { consistency: 2, temper: 1, stamina: 1 },
    traitPool: ['professional', 'tractable'],
  },
  groundwork: {
    id: 'groundwork',
    name: 'Groundwork',
    description: 'Patient handling on the ground. Nothing is asked at pace.',
    statEffects: { temper: 4, consistency: 1, speed: -1 },
    traitPool: ['tractable', 'professional'],
  },
  deepSand: {
    id: 'deepSand',
    name: 'Deep Sand Gallops',
    description: 'Heavy going that punishes every stride.',
    statEffects: { grit: 4, stamina: 2, burst: -2 },
    traitPool: ['grinder', 'hardKnocker'],
  },
  bendWork: {
    id: 'bendWork',
    name: 'Work Off the Bend',
    description: 'Asked to quicken the moment the track straightens.',
    statEffects: { burst: 4, temper: 1, grit: -1 },
    traitPool: ['turnOfFoot', 'coiled'],
  },
  matchGallop: {
    id: 'matchGallop',
    name: 'Match Gallop',
    description: 'Upsides with a stablemate, both asked to win it.',
    statEffects: { grit: 3, consistency: 2, temper: -2 },
    traitPool: ['bigGame', 'relentless'],
  },
};

export function mountTrainingScreen(
  container: HTMLElement,
  horse: Horse,
  playerSilks: Silks,
  onTrainingSelect: (horse: Horse, training: TrainingSession) => void,
  /**
   * Multiplies every gain — the Training Grounds and the head trainer combined.
   * 1 is a bare yard with a novice trainer.
   */
  gainMultiplier = 1,
  /** Training Grounds' downside relief, 0 (full cost) to 1 (no downside at all). */
  downsideRelief = 0,
): () => void {
  const root = document.createElement('div');
  root.className = 'training-screen';

  // What this horse, in this yard, actually gets out of a session. The cards
  // below are drawn from this, so what is promised is what lands.
  const totalMultiplier = gainMultiplier * getAgeTrainingFactor(horse.age);

  root.innerHTML = `
    <div class="training-container">
      <div class="training-header">
        <h2>Training Plan — Week 1</h2>
        <div class="horse-preview-wrapper">
          <canvas class="horse-preview-canvas"></canvas>
        </div>
        <div class="horse-card">
          <h3>${horse.name}${horse.isChampion ? ' 🏆' : ''}</h3>
          <p class="horse-meta">Age 2 • Trainer Career</p>

          <div class="division-progress">
            <div class="division-label">
              <span class="division-name">${horse.division.charAt(0).toUpperCase() + horse.division.slice(1)}</span>
              <span class="points-text">${horse.divisionPoints >= 0 ? '+' : ''}${horse.divisionPoints}</span>
            </div>
            <div class="progress-bar-container">
              <div class="progress-segments">
                <!-- 8-segment centered bar: only show appropriate color -->
                ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                  if (horse.divisionPoints < 0) {
                    // Negative: show red segments right-aligned in positions 0-2
                    const absPoints = Math.abs(horse.divisionPoints);
                    const isFilled = i <= 2 && i > (2 - absPoints);
                    return `<div class="segment demotion ${isFilled ? 'filled' : ''}"></div>`;
                  } else {
                    // Positive: show green segments left-aligned in positions 3-7
                    const isFilled = i >= 3 && (i - 3) < horse.divisionPoints;
                    return `<div class="segment promotion ${isFilled ? 'filled' : ''}"></div>`;
                  }
                }).join('')}
              </div>
            </div>
            <div class="progress-label">
              ${horse.divisionPoints >= 5 ? 'Ready for Promotion' : (horse.divisionPoints >= 0 ? 'Promotion Progress' : 'Demotion Risk')}
            </div>
          </div>
        </div>
      </div>

      <div class="training-grid">
        ${Object.values(TRAINING_SESSIONS)
          .map(
            (session) => `
          <button class="training-card" data-training="${session.id}">
            <h4>${session.name}</h4>
            <p class="training-desc">${session.description}</p>
            <div class="training-stats">
              ${Object.entries(scaleTrainingEffects(session.statEffects, totalMultiplier, downsideRelief))
                .map(([stat, effect]) => {
                  const sign = effect > 0 ? '+' : '';
                  const color = effect > 0 ? 'positive' : 'negative';
                  return `<span class="stat-change ${color}">${sign}${effect} ${stat}</span>`;
                })
                .join('')}
            </div>
          </button>
        `,
          )
          .join('')}
      </div>

      <div class="current-stats">
        <div class="current-stats-head">
          <h3>Current Stats</h3>
          <span class="stats-hint">Tap for exact numbers</span>
        </div>
        <div class="stat-rows" id="training-stat-rows">
          ${renderStatRows(horse)}
        </div>
      </div>
    </div>
  `;

  container.appendChild(root);

  // Grades read first; tapping any row switches the whole block to numbers.
  const detachReveal = attachStatReveal(root);

  // Set up horse preview canvas
  const canvasWrapper = root.querySelector('.horse-preview-wrapper') as HTMLElement;
  const surface = createSurface(canvasWrapper);
  void loadFrameSequence('southwest-idle', 9).then(
    (sequence) => {
      let time = 0;
      const loop = startLoop(
        30,
        () => {
          time += 1 / 30;
        },
        () => {
          const { ctx, width, height } = surface;
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, width, height);

          const phase = (time * 0.1) % 1;

          const isSmallScreen = window.innerWidth < 600;
          const horseX = isSmallScreen ? width * 0.35 : width / 2;
          const horseY = height * 1.6;

          const opts: DrawFrameOptions = {
            phase,
            scale: 4,
            scheme: {
              coat: coatForHorse(horse),
              silks: playerSilks,
            },
          };

          drawFrame(ctx, horseX, horseY, sequence, opts);
        },
      );

      // Cleanup on unmount
      const cleanup = () => loop.stop();
      return cleanup;
    },
  );

  const trainingCards = root.querySelectorAll<HTMLButtonElement>('.training-card');
  trainingCards.forEach((card) => {
    card.addEventListener('click', () => {
      const trainingId = card.dataset.training as string;
      const session = TRAINING_SESSIONS[trainingId]!;

      // Breakthrough chance based on morale and temper
      const breakthroughChance = (horse.morale / 100) * (horse.stats.temper / 100) * 0.5; // 0-50% max
      const isBreakthrough = Math.random() < breakthroughChance;

      // Calculate stat changes
      let statChanges: StatEffects = { ...session.statEffects };

      if (isBreakthrough) {
        // Remove negative effects and add bonus gains
        const affectedStats = Object.keys(statChanges) as Array<keyof typeof session.statEffects>;
        const positiveStats = affectedStats.filter((stat) => statChanges[stat]! > 0);

        // Clear all effects
        statChanges = {};

        // Re-apply only positive effects with bonus
        for (const stat of positiveStats) {
          const originalGain = session.statEffects[stat]!;
          statChanges[stat] = originalGain + 2; // Bonus of +2
        }
      }

      statChanges = scaleTrainingEffects(statChanges, totalMultiplier, downsideRelief);

      // Apply the session against the horse's hidden ceilings. applyTrainedStat
      // mutates, so work on a copy. The result screen diffs old against new, so
      // it reports what a capped stat actually kept rather than what was asked
      // for.
      const updatedHorse: Horse = {
        ...horse,
        stats: { ...horse.stats },
        potential: { ...horse.potential },
      };
      for (const key of STAT_KEYS) {
        const raw = statChanges[key as keyof typeof statChanges];
        if (raw === undefined || raw === 0) continue;
        applyTrainedStat(updatedHorse, key, raw);
      }

      // Rare trait instillment (5% chance, or higher if breakthrough)
      let newTrait: TraitId | null = null;
      const traitChance = isBreakthrough ? 0.15 : 0.05;
      if (Math.random() < traitChance && session.traitPool.length > 0) {
        const trait = session.traitPool[Math.floor(Math.random() * session.traitPool.length)]!;
        if (!updatedHorse.traits.includes(trait)) {
          newTrait = trait;
          updatedHorse.traits = [...updatedHorse.traits, trait];
        }
      }

      showTrainingAnimation(
        root,
        session,
        horse.stats,
        updatedHorse.stats,
        newTrait,
        isBreakthrough,
        () => {
          onTrainingSelect(updatedHorse, session);
        },
      );
    });
  });

  return () => {
    detachReveal();
    root.remove();
  };
}

function showTrainingAnimation(
  container: HTMLElement,
  session: TrainingSession,
  oldStats: Horse['stats'],
  newStats: Horse['stats'],
  newTrait: TraitId | null,
  isBreakthrough: boolean,
  onComplete: () => void,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'training-animation-overlay';

  const statChanges = {
    speed: newStats.speed - oldStats.speed,
    stamina: newStats.stamina - oldStats.stamina,
    grit: newStats.grit - oldStats.grit,
    burst: newStats.burst - oldStats.burst,
    temper: newStats.temper - oldStats.temper,
    consistency: newStats.consistency - oldStats.consistency,
  };

  overlay.innerHTML = `
    <div class="training-animation ${isBreakthrough ? 'breakthrough' : ''}">
      ${
        isBreakthrough
          ? '<div class="breakthrough-banner">🌟 BREAKTHROUGH! 🌟</div>'
          : ''
      }
      <h2>${session.name}</h2>
      <p class="training-anim-desc">${session.description}</p>

      ${
        isBreakthrough
          ? '<p class="breakthrough-message">Your horse had a breakthrough while training,<br>resulting in exceptional growth!</p>'
          : ''
      }

      <div class="stat-animations">
        ${Object.entries(statChanges)
          .filter(([_, change]) => change !== 0)
          .map(
            ([stat, change], index) => `
          <div class="stat-anim" style="animation-delay: ${index * 0.1}s">
            <div class="stat-anim-row">
              <span class="stat-anim-label">${stat}</span>
              <div class="stat-value-container">
                <span class="stat-before">${Math.round(oldStats[stat as keyof typeof oldStats])}</span>
                <span class="stat-after">${Math.round(newStats[stat as keyof typeof newStats])}</span>
              </div>
            </div>
            <div class="stat-anim-middle">
              <span class="stat-anim-change ${change > 0 ? 'positive' : 'negative'}">
                ${change > 0 ? '↑' : '↓'} ${Math.abs(change)}
              </span>
            </div>
          </div>
        `,
          )
          .join('')}
      </div>

      ${
        newTrait
          ? `<div class="trait-learned">
        🎓 Learned: ${TRAITS[newTrait].name}
      </div>`
          : ''
      }
    </div>
  `;

  container.appendChild(overlay);

  // Animate the stats appearing
  setTimeout(() => {
    overlay.classList.add('show');
  }, 50);

  // Longer duration for breakthroughs (matches 4s animation)
  const duration = isBreakthrough ? 4500 : 4000;

  // Wait for animation to complete and transition
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.remove();
      onComplete();
    }, 400);
  }, duration);
}
