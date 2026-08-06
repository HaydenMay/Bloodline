import type { Horse } from '../sim/types.js';
import { TRAITS } from '../data/traits.js';
import type { TraitId } from '../data/traits.js';

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
  };
  traitPool: TraitId[];
}

export const TRAINING_SESSIONS: Record<string, TrainingSession> = {
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
  gatePractice: {
    id: 'gatePractice',
    name: 'Gate Practice',
    description: 'Refine your break technique.',
    statEffects: { speed: 2, grit: 1 },
    traitPool: ['alert', 'professional'],
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
  crossTraining: {
    id: 'crossTraining',
    name: 'Cross Training',
    description: 'Varied conditioning routines.',
    statEffects: { speed: 1, stamina: 1, burst: 1 },
    traitPool: ['versatile', 'professional'],
  },
  recovery: {
    id: 'recovery',
    name: 'Recovery Day',
    description: 'Focused restoration and balance.',
    statEffects: { stamina: 1, grit: 1, temper: 1 },
    traitPool: ['tractable', 'goodDoer'],
  },
  jumpingDrills: {
    id: 'jumpingDrills',
    name: 'Jumping Drills',
    description: 'Agility and coordination work.',
    statEffects: { burst: 2, temper: 1, speed: -1 },
    traitPool: ['alert', 'acrobat'],
  },
  gallopsWork: {
    id: 'gallopsWork',
    name: 'Gallops Work',
    description: 'Extended aerobic conditioning.',
    statEffects: { stamina: 2, grit: 1 },
    traitPool: ['cruiser', 'relentless'],
  },
  intervalTraining: {
    id: 'intervalTraining',
    name: 'Interval Training',
    description: 'High-intensity alternating pace.',
    statEffects: { speed: 3, stamina: 2, temper: -2 },
    traitPool: ['turnOfFoot', 'professional'],
  },
  restDay: {
    id: 'restDay',
    name: 'Rest Day',
    description: 'Complete recovery and adaptation.',
    statEffects: { stamina: 1, temper: 1 },
    traitPool: ['tractable', 'goodDoer'],
  },
};

export function mountTrainingScreen(
  container: HTMLElement,
  horse: Horse,
  onTrainingSelect: (horse: Horse, training: TrainingSession) => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'training-screen';

  root.innerHTML = `
    <div class="training-container">
      <div class="training-header">
        <h2>Training Plan — Week 1</h2>
        <div class="horse-card">
          <h3>${horse.name}</h3>
          <p class="horse-meta">Age 2 • Trainer Career</p>
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
              ${Object.entries(session.statEffects)
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
        <h3>Current Stats</h3>
        <div class="stats-row">
          <div class="stat-item">
            <span class="label">Speed</span>
            <span class="value">${Math.round(horse.stats.speed)}</span>
          </div>
          <div class="stat-item">
            <span class="label">Stamina</span>
            <span class="value">${Math.round(horse.stats.stamina)}</span>
          </div>
          <div class="stat-item">
            <span class="label">Grit</span>
            <span class="value">${Math.round(horse.stats.grit)}</span>
          </div>
          <div class="stat-item">
            <span class="label">Burst</span>
            <span class="value">${Math.round(horse.stats.burst)}</span>
          </div>
          <div class="stat-item">
            <span class="label">Temper</span>
            <span class="value">${Math.round(horse.stats.temper)}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  container.appendChild(root);

  const trainingCards = root.querySelectorAll<HTMLButtonElement>('.training-card');
  trainingCards.forEach((card) => {
    card.addEventListener('click', () => {
      const trainingId = card.dataset.training as string;
      const session = TRAINING_SESSIONS[trainingId]!;

      // Apply training effects to horse
      const updatedHorse: Horse = {
        ...horse,
        stats: {
          speed: Math.max(0, horse.stats.speed + (session.statEffects.speed || 0)),
          stamina: Math.max(0, horse.stats.stamina + (session.statEffects.stamina || 0)),
          grit: Math.max(0, horse.stats.grit + (session.statEffects.grit || 0)),
          burst: Math.max(0, horse.stats.burst + (session.statEffects.burst || 0)),
          temper: Math.max(0, horse.stats.temper + (session.statEffects.temper || 0)),
          consistency: horse.stats.consistency,
        },
      };

      // Rare trait instillment (5% chance)
      let newTrait: TraitId | null = null;
      if (Math.random() < 0.05 && session.traitPool.length > 0) {
        const trait = session.traitPool[Math.floor(Math.random() * session.traitPool.length)]!;
        if (!updatedHorse.traits.includes(trait)) {
          newTrait = trait;
          updatedHorse.traits = [...updatedHorse.traits, trait];
        }
      }

      showTrainingAnimation(root, session, horse.stats, updatedHorse.stats, newTrait, () => {
        onTrainingSelect(updatedHorse, session);
      });
    });
  });

  return () => {
    root.remove();
  };
}

function showTrainingAnimation(
  container: HTMLElement,
  session: TrainingSession,
  oldStats: Horse['stats'],
  newStats: Horse['stats'],
  newTrait: TraitId | null,
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
  };

  overlay.innerHTML = `
    <div class="training-animation">
      <h2>${session.name}</h2>
      <p class="training-anim-desc">${session.description}</p>

      <div class="stat-animations">
        ${Object.entries(statChanges)
          .filter(([_, change]) => change !== 0)
          .map(
            ([stat, change]) => `
          <div class="stat-anim">
            <span class="stat-anim-label">${stat}</span>
            <span class="stat-anim-change ${change > 0 ? 'positive' : 'negative'}">
              ${change > 0 ? '+' : ''}${change}
            </span>
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

  // Wait for animation to complete and transition
  setTimeout(() => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.remove();
      onComplete();
    }, 400);
  }, 1500);
}
