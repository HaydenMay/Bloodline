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
    description: 'Build cardiovascular fitness.',
    statEffects: { stamina: 2, speed: -1 },
    traitPool: ['ironLungs', 'quickRecovery'],
  },
  hillWork: {
    id: 'hillWork',
    name: 'Hill Work',
    description: 'Strengthen legs and resolve.',
    statEffects: { grit: 1, burst: 1 },
    traitPool: ['grinder', 'bulldozer'],
  },
  sprintWork: {
    id: 'sprintWork',
    name: 'Sprint Work',
    description: 'Explosive speed drills.',
    statEffects: { speed: 2, stamina: -1 },
    traitPool: ['turnOfFoot', 'fastGate'],
  },
  gatePractice: {
    id: 'gatePractice',
    name: 'Gate Practice',
    description: 'Master the break.',
    statEffects: { speed: 1, grit: 1 },
    traitPool: ['alert', 'professional'],
  },
  longGallops: {
    id: 'longGallops',
    name: 'Long Gallops',
    description: 'Steady-state distance work.',
    statEffects: { stamina: 1, speed: -1 },
    traitPool: ['cruiser', 'relentless'],
  },
  rest: {
    id: 'rest',
    name: 'Rest',
    description: 'Recover and adapt.',
    statEffects: { grit: 1 },
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
