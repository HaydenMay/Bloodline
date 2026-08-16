import type { Career } from './career.js';
import { getStableLegacyPoints, getTier } from '../data/legacy.js';
import { getForm, getSpirit } from '../sim/upkeep.js';
import { getCareerStage, getRetirementAdvice } from '../sim/growth.js';

export interface StableHubCallbacks {
  onTraining: () => void;
  onRaceCalendar: () => void;
  onFacilities: () => void;
  onTrainerJockey: () => void;
  onConsumables: () => void;
  onDossier: () => void;
  onLegacy: () => void;
  /** Skip the week to recover — and the only way to work off an injury. */
  onRest: () => void;
  /** End this horse's career on the player's terms. */
  onRetire: () => void;
}

export function mountStableHub(
  container: HTMLElement,
  career: Career,
  callbacks: StableHubCallbacks,
): () => void {
  const root = document.createElement('div');
  root.className = 'stable-hub';

  const horse = career.horse;
  const form = getForm(horse.condition);
  const stage = getCareerStage(horse.age);
  const stageLabel =
    stage === 'developing' ? 'Improving' : stage === 'peak' ? 'At peak' : 'Declining';
  const layoff = career.weeksInjured ?? 0;
  const injured = layoff > 0;

  // DESIGN.md 8: the trainer hints once decline sets in, and retiring stays the
  // player's call. The advice appears only when there is something to say, so
  // it reads as counsel rather than a permanent nag.
  const retirementAdvice = getRetirementAdvice(
    horse,
    career.stats.racesCompleted,
    career.horseLegacy.points,
    career.horseLegacy.peak,
  );
  const stablePoints = getStableLegacyPoints(career.stable.legacy, career.horseLegacy);
  const stableTier = getTier(stablePoints);

  // Direction of the horse's last result, so the hub reads as a live arc.
  const history = career.horseLegacy.history;
  const previous = history.length > 1 ? history[history.length - 2]! : null;
  const trend =
    previous === null
      ? ''
      : career.horseLegacy.points > previous
        ? 'up'
        : career.horseLegacy.points < previous
          ? 'down'
          : 'flat';
  const trendArrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '';

  root.innerHTML = `
    <div class="hub-container">
      <!-- Top Status Bar -->
      <div class="hub-status-bar">
        <div class="status-item">
          <span class="status-label">Cash</span>
          <span class="status-value">$${career.stable.cash.toLocaleString()}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Reputation</span>
          <span class="status-value">${career.stable.reputation}</span>
        </div>
      </div>

      <!-- Horse Profile Section -->
      <div class="hub-horse-profile">
        <div class="profile-header">
          <h2>${horse.name}${horse.isChampion ? ' 🏆' : ''}</h2>
          <p class="profile-meta">
            ${horse.style.charAt(0).toUpperCase() + horse.style.slice(1)} •
            ${horse.division.charAt(0).toUpperCase() + horse.division.slice(1)} •
            ${horse.age}yo <span class="stage-tag stage-${stage}">${stageLabel}</span>
          </p>
        </div>
        ${
          injured
            ? `<div class="injury-banner">🩹 ${career.injuryName ?? 'Injured'} — ${layoff} week${layoff === 1 ? '' : 's'} of rest remaining</div>`
            : ''
        }
        ${
          // Once the trainer has something to say, the decision it is about
          // belongs next to the horse — not at the foot of a page the player
          // has to go looking down for.
          retirementAdvice
            ? `<div class="retire-advice">
                 <div class="retire-advice-text">
                   <span class="retire-advice-label">Your trainer</span>
                   <span>${retirementAdvice}</span>
                 </div>
                 <button class="btn btn-secondary retire-btn">Retire ${horse.name}</button>
               </div>`
            : ''
        }
        <div class="profile-condition">
          <div class="cond-item">
            <span class="cond-label">Form</span>
            <span class="cond-value form-${form.state}">${form.label}</span>
            <span class="cond-note">${form.note}</span>
          </div>
          <div class="cond-item">
            <span class="cond-label">Spirit</span>
            <span class="cond-value">${getSpirit(horse.morale)}</span>
            <span class="cond-note">${Math.round(horse.morale)} morale</span>
          </div>
        </div>
        <div class="profile-stats">
          <div class="stat">
            <span class="stat-label">Races</span>
            <span class="stat-value">${career.stats.racesCompleted}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Wins</span>
            <span class="stat-value">${career.stats.wins}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Earnings</span>
            <span class="stat-value">$${career.stats.totalEarnings.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <!-- Legacy Tier Display -->
      <div class="hub-legacy-banner">
        <div class="legacy-tier">
          <span class="tier-icon">${stableTier.icon}</span>
          <div class="tier-details">
            <div class="tier-name">${stableTier.name} Stable</div>
            <div class="tier-points">${stablePoints} prestige</div>
          </div>
        </div>
        <div class="legacy-horse-score ${trend}">
          <span class="horse-score-label">${horse.name}${career.horseLegacy.hallOfFame ? ' ⭐' : ''}</span>
          <span class="horse-score-value">${career.horseLegacy.points} ${trendArrow}</span>
        </div>
      </div>

      <!-- Navigation Grid -->
      <div class="hub-navigation">
        <h3>What's Next?</h3>
        <div class="nav-grid">
          <button class="nav-button" id="nav-training" data-action="training">
            <div class="nav-icon">🏋️</div>
            <div class="nav-label">Training</div>
            <div class="nav-desc">Build your horse</div>
          </button>
          <button class="nav-button ${injured ? 'nav-blocked' : ''}" id="nav-race-calendar" data-action="race-calendar">
            <div class="nav-icon">📅</div>
            <div class="nav-label">Race Calendar</div>
            <div class="nav-desc">${injured ? 'Sidelined' : 'Pick next race'}</div>
          </button>
          <button class="nav-button" id="nav-rest" data-action="rest">
            <div class="nav-icon">🌙</div>
            <div class="nav-label">Rest</div>
            <div class="nav-desc">${injured ? `${layoff} week${layoff === 1 ? '' : 's'} to go` : 'Freshen up'}</div>
          </button>
          <button class="nav-button" id="nav-facilities" data-action="facilities">
            <div class="nav-icon">🏗️</div>
            <div class="nav-label">Facilities</div>
            <div class="nav-desc">Build your stable</div>
          </button>
          <button class="nav-button" id="nav-trainer-jockey" data-action="trainer-jockey">
            <div class="nav-icon">👥</div>
            <div class="nav-label">Staff</div>
            <div class="nav-desc">Hire & level up</div>
          </button>
          <button class="nav-button" id="nav-consumables" data-action="consumables">
            <div class="nav-icon">💊</div>
            <div class="nav-label">Consumables</div>
            <div class="nav-desc">Supplements & items</div>
          </button>
          <button class="nav-button" id="nav-dossier" data-action="dossier">
            <div class="nav-icon">📋</div>
            <div class="nav-label">Dossier</div>
            <div class="nav-desc">Track rivals</div>
          </button>
          <button class="nav-button" id="nav-legacy" data-action="legacy">
            <div class="nav-icon">⭐</div>
            <div class="nav-label">Legacy</div>
            <div class="nav-desc">View achievements</div>
          </button>
        </div>
      </div>

      <!-- Always reachable, never shouting. The prompt that actually asks for a
           decision is up beside the horse, once the trainer has something to say. -->
      <div class="retire-quiet"><button class="menu-link retire-btn">Retire ${horse.name}</button></div>

      <!-- Week Info -->
      <div class="hub-week-info">
        <p>Week ${career.week} of Season ${career.season}</p>
      </div>
    </div>
  `;

  container.appendChild(root);

  // Attach event listeners
  const trainingBtn = root.querySelector('#nav-training');
  const raceCalendarBtn = root.querySelector('#nav-race-calendar');
  const facilitiesBtn = root.querySelector('#nav-facilities');
  const trainerJockeyBtn = root.querySelector('#nav-trainer-jockey');
  const consumablesBtn = root.querySelector('#nav-consumables');
  const dossierBtn = root.querySelector('#nav-dossier');
  const legacyBtn = root.querySelector('#nav-legacy');
  const restBtn = root.querySelector('#nav-rest');
  // Two of these when the trainer is prompting — the callout by the horse and
  // the quiet link at the foot. Both retire.
  const retireBtns = root.querySelectorAll('.retire-btn');

  trainingBtn?.addEventListener('click', callbacks.onTraining);
  raceCalendarBtn?.addEventListener('click', callbacks.onRaceCalendar);
  facilitiesBtn?.addEventListener('click', callbacks.onFacilities);
  trainerJockeyBtn?.addEventListener('click', callbacks.onTrainerJockey);
  consumablesBtn?.addEventListener('click', callbacks.onConsumables);
  dossierBtn?.addEventListener('click', callbacks.onDossier);
  legacyBtn?.addEventListener('click', callbacks.onLegacy);
  restBtn?.addEventListener('click', callbacks.onRest);
  retireBtns.forEach((btn) => btn.addEventListener('click', callbacks.onRetire));

  return () => {
    root.remove();
  };
}
