import type { Career } from './career.js';
import type { Horse } from '../sim/types.js';
import type { BetType, PlacedBet } from '../data/wagering.js';
import { getBetOptions, getStakeOptions } from '../data/wagering.js';
import { CONSUMABLES } from '../data/consumables.js';
import { saveCareer } from './career.js';

export interface RaceDayChoices {
  /** Race-day consumable ids to spend on this race. */
  items: string[];
  bet: PlacedBet | null;
}

/**
 * The last stop before a race: spend race-day items, and optionally back your
 * own horse. Both cost money now against a result you do not control yet.
 */
export function mountRaceDayScreen(
  container: HTMLElement,
  career: Career,
  field: Horse[],
  raceName: string,
  onConfirm: (choices: RaceDayChoices) => void,
  onBack: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'raceday-screen';

  const stable = career.stable;
  const horse = career.horse;

  // Only race-day items actually held are worth showing.
  const heldRaceDay = Object.entries(stable.consumables)
    .filter(([id, count]) => count > 0 && CONSUMABLES[id]?.kind === 'raceDay')
    .map(([id, count]) => ({ item: CONSUMABLES[id]!, count }));

  const betOptions = getBetOptions(horse, field);
  const stakes = getStakeOptions(stable.cash);

  const selectedItems = new Set<string>();
  let betType: BetType | null = null;
  let stake = 0;

  root.innerHTML = `
    <div class="raceday-container">
      <div class="raceday-top-bar">
        <button class="btn-back" id="back-btn">← Back</button>
        <h2>Race Day</h2>
        <div style="width: 80px;"></div>
      </div>

      <div class="raceday-race">
        <div class="raceday-name">${raceName}</div>
        <div class="raceday-meta">${field.length} runners · ${horse.name} · ${Math.round(horse.condition)} cond · ${Math.round(horse.morale)} mor</div>
      </div>

      <div class="raceday-section">
        <h3>Race-Day Preparation</h3>
        ${
          heldRaceDay.length === 0
            ? `<p class="raceday-empty">No race-day items in the store. Buy them from Supplies.</p>`
            : `<div class="raceday-items">
                ${heldRaceDay
                  .map(
                    ({ item, count }) => `
                  <button class="raceday-item" data-item="${item.id}">
                    <span class="raceday-item-icon">${item.icon}</span>
                    <span class="raceday-item-body">
                      <span class="raceday-item-name">${item.name} <span class="held-badge">${count} held</span></span>
                      <span class="raceday-item-effect">${item.effectLabel}</span>
                    </span>
                    <span class="raceday-item-check">✓</span>
                  </button>
                `,
                  )
                  .join('')}
              </div>
              <p class="raceday-note">Used items are consumed whatever the result.</p>`
        }
      </div>

      <div class="raceday-section">
        <h3>Back Your Horse</h3>
        ${
          stakes.length === 0
            ? `<p class="raceday-empty">Not enough cash to place a bet.</p>`
            : `
          <div class="bet-types">
            ${betOptions
              .map(
                (option) => `
              <button class="bet-type" data-bet="${option.type}">
                <span class="bet-type-label">${option.label}</span>
                <span class="bet-type-odds">${option.odds.toFixed(1)}×</span>
                <span class="bet-type-desc">${option.description}</span>
              </button>
            `,
              )
              .join('')}
          </div>
          <div class="bet-stakes" id="bet-stakes" hidden>
            <span class="bet-stakes-label">Stake</span>
            <div class="bet-stake-buttons">
              ${stakes.map((s) => `<button class="stake-btn" data-stake="${s}">$${s.toLocaleString()}</button>`).join('')}
            </div>
            <p class="bet-summary" id="bet-summary"></p>
          </div>
        `
        }
      </div>

      <div class="raceday-actions">
        <button class="btn btn-primary" id="go-btn">To the Start</button>
      </div>
    </div>
  `;

  container.appendChild(root);

  const stakesBox = root.querySelector<HTMLElement>('#bet-stakes');
  const summary = root.querySelector<HTMLElement>('#bet-summary');

  const updateSummary = (): void => {
    if (!summary) return;
    if (!betType || stake === 0) {
      summary.textContent = '';
      return;
    }
    const option = betOptions.find((o) => o.type === betType)!;
    const ret = Math.round(stake * option.odds);
    summary.textContent = `$${stake.toLocaleString()} to ${option.label.toLowerCase()} at ${option.odds.toFixed(1)}× returns $${ret.toLocaleString()} — taken from your cash now.`;
  };

  root.querySelectorAll<HTMLButtonElement>('.raceday-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.item!;
      if (selectedItems.has(id)) selectedItems.delete(id);
      else selectedItems.add(id);
      btn.classList.toggle('selected', selectedItems.has(id));
    });
  });

  root.querySelectorAll<HTMLButtonElement>('.bet-type').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.bet as BetType;
      // Tapping the chosen type again clears the bet entirely.
      if (betType === type) {
        betType = null;
        stake = 0;
        root.querySelectorAll('.bet-type').forEach((b) => b.classList.remove('selected'));
        root.querySelectorAll('.stake-btn').forEach((b) => b.classList.remove('selected'));
        if (stakesBox) stakesBox.hidden = true;
      } else {
        betType = type;
        root.querySelectorAll('.bet-type').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (stakesBox) stakesBox.hidden = false;
      }
      updateSummary();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('.stake-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      stake = Number(btn.dataset.stake);
      root.querySelectorAll('.stake-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      updateSummary();
    });
  });

  root.querySelector('#go-btn')?.addEventListener('click', () => {
    const items = [...selectedItems];

    // Consume the items and take the stake before the race is run, so a
    // refresh mid-race cannot hand them back.
    for (const id of items) {
      stable.consumables[id] = Math.max(0, (stable.consumables[id] ?? 0) - 1);
    }

    let bet: PlacedBet | null = null;
    if (betType && stake > 0 && stake <= stable.cash) {
      const option = betOptions.find((o) => o.type === betType)!;
      stable.cash -= stake;
      bet = { type: betType, stake, odds: option.odds };
    }

    saveCareer(career);
    onConfirm({ items, bet });
  });

  root.querySelector('#back-btn')?.addEventListener('click', onBack);

  return () => {
    root.remove();
  };
}
