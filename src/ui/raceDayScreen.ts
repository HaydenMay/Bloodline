import type { Career } from './career.js';
import type { Horse } from '../sim/types.js';
import type { BetType, PlacedBet } from '../data/wagering.js';
import { getBetOptions, getStakeOptions } from '../data/wagering.js';
import { CONSUMABLES } from '../data/consumables.js';
import { saveCareer } from './career.js';
import { supports3d } from '../render/raceView.js';

export interface RaceDayChoices {
  /** Race-day consumable ids to spend on this race. */
  items: string[];
  bet: PlacedBet | null;
}

export interface RaceDayRace {
  name: string;
  distance: number;
  going: string;
  purse: number;
  toWinner: number;
}

/**
 * The last stop before a race, and the only screen where anything is decided.
 *
 * Three choices sit side by side in a grid — study the opposition, spend
 * race-day items, back your own horse — because they are the same kind of
 * decision: money or information committed now against a result you do not
 * control yet. Studying the field first is the point of the layout. Betting
 * used to be offered before the player had seen a single rival, which made the
 * wager closer to a coin flip than a judgement.
 *
 * Everything after this screen is spectacle. The race intro is a cinematic with
 * nothing to press, because by then the horse is walking to the gate.
 */
export function mountRaceDayScreen(
  container: HTMLElement,
  career: Career,
  field: Horse[],
  race: RaceDayRace,
  onConfirm: (choices: RaceDayChoices) => void,
  onBack: () => void,
  /**
   * Opens the opponents dossier. Called with a function that brings this screen
   * back exactly as it was left — the screen hides rather than unmounts, so a
   * player can study the field, come back and place a bet without losing the
   * items they had already picked.
   */
  onShowOpponents?: (resume: () => void) => void,
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
  // Tied to the purse: a bet should be proportional to the race it rides on,
  // or a Maiden becomes the most profitable division in the game.
  const stakes = getStakeOptions(stable.cash, race.purse);

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
        <div class="raceday-name">${race.name}</div>
        <div class="raceday-meta">${race.distance}m · ${race.going} · ${field.length} runners</div>
        <div class="raceday-meta">Purse $${race.purse.toLocaleString()} · $${race.toWinner.toLocaleString()} to the winner</div>
        <div class="raceday-meta">${horse.name} · ${Math.round(horse.condition)} cond · ${Math.round(horse.morale)} mor</div>
      </div>

      <div class="raceday-grid">
        <button class="raceday-option" data-panel="opponents">
          <span class="raceday-option-icon">🔍</span>
          <span class="raceday-option-name">Opponents</span>
          <span class="raceday-option-state">${field.length - 1} rivals</span>
        </button>
        <button class="raceday-option" data-panel="prep">
          <span class="raceday-option-icon">💊</span>
          <span class="raceday-option-name">Preparation</span>
          <span class="raceday-option-state" id="prep-state">${
            heldRaceDay.length === 0 ? 'Nothing held' : 'None used'
          }</span>
        </button>
        <button class="raceday-option" data-panel="bet">
          <span class="raceday-option-icon">🎟️</span>
          <span class="raceday-option-name">Betting</span>
          <span class="raceday-option-state" id="bet-state">${
            stakes.length === 0 ? 'No cash' : 'No bet'
          }</span>
        </button>
      </div>

      <div class="raceday-section" id="panel-prep" hidden>
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

      <div class="raceday-section" id="panel-bet" hidden>
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
        <div class="raceday-view" role="group" aria-label="Race view">
          <span class="raceday-view-label">View</span>
          <button type="button" class="raceday-view-btn" data-view="2d">2D</button>
          <button type="button" class="raceday-view-btn" data-view="3d">3D</button>
        </div>
        <span class="raceday-view-note" hidden>3D needs a bigger screen</span>
        <button class="btn btn-primary" id="go-btn">Start Race</button>
      </div>
    </div>
  `;

  container.appendChild(root);

  /**
   * 2D or 3D, chosen here rather than buried in settings — it is a decision
   * about this race, taken at the moment you commit to running it. The choice
   * sticks, so a career of twenty starts is not twenty re-picks.
   */
  const applyViewButtons = (): void => {
    // A saved 3D preference survives moving to a phone, so what is ON is what
    // the race will actually run in — not what was picked on the desktop.
    const wanted = stable.settings.raceView ?? '2d';
    const current = wanted === '3d' && !supports3d() ? '2d' : wanted;
    for (const btn of root.querySelectorAll<HTMLButtonElement>('.raceday-view-btn')) {
      btn.classList.toggle('is-active', btn.dataset.view === current);
      btn.setAttribute('aria-pressed', String(btn.dataset.view === current));
      if (btn.dataset.view !== '3d') continue;
      btn.disabled = !supports3d();
      btn.title = supports3d() ? '' : 'Needs a larger window';
    }
    const note = root.querySelector<HTMLElement>('.raceday-view-note');
    if (note) note.hidden = supports3d();
  };
  for (const btn of root.querySelectorAll<HTMLButtonElement>('.raceday-view-btn')) {
    btn.addEventListener('click', () => {
      stable.settings.raceView = btn.dataset.view === '3d' ? '3d' : '2d';
      saveCareer(career);
      applyViewButtons();
    });
  }
  applyViewButtons();

  const stakesBox = root.querySelector<HTMLElement>('#bet-stakes');
  const summary = root.querySelector<HTMLElement>('#bet-summary');
  const prepState = root.querySelector<HTMLElement>('#prep-state');
  const betState = root.querySelector<HTMLElement>('#bet-state');

  /**
   * Keeps the grid readable once a panel is closed again. Without it the only
   * record of a bet or a selected item is inside a panel nobody has open.
   */
  const refreshGridState = (): void => {
    if (prepState && heldRaceDay.length > 0) {
      prepState.textContent =
        selectedItems.size === 0 ? 'None used' : `${selectedItems.size} selected`;
    }
    if (betState && stakes.length > 0) {
      betState.textContent =
        betType && stake > 0
          ? `$${stake.toLocaleString()} to ${betType}`
          : 'No bet';
    }
  };

  const updateSummary = (): void => {
    refreshGridState();
    if (!summary) return;
    if (!betType || stake === 0) {
      summary.textContent = '';
      return;
    }
    const option = betOptions.find((o) => o.type === betType)!;
    const ret = Math.round(stake * option.odds);
    summary.textContent = `$${stake.toLocaleString()} to ${option.label.toLowerCase()} at ${option.odds.toFixed(1)}× returns $${ret.toLocaleString()} — taken from your cash now.`;
  };

  // One panel open at a time, so the grid stays the thing you navigate from.
  const openPanel = (name: string | null): void => {
    for (const id of ['prep', 'bet']) {
      const panel = root.querySelector<HTMLElement>(`#panel-${id}`);
      if (panel) panel.hidden = id !== name;
    }
    root.querySelectorAll<HTMLButtonElement>('.raceday-option').forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.panel === name);
    });
  };

  let openedPanel: string | null = null;

  root.querySelectorAll<HTMLButtonElement>('.raceday-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const panel = btn.dataset.panel!;

      if (panel === 'opponents') {
        if (!onShowOpponents) return;
        // Hide rather than unmount, so the items and bet already chosen survive
        // a trip to the dossier and back.
        root.hidden = true;
        onShowOpponents(() => {
          root.hidden = false;
        });
        return;
      }

      openedPanel = openedPanel === panel ? null : panel;
      openPanel(openedPanel);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('.raceday-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.item!;
      if (selectedItems.has(id)) selectedItems.delete(id);
      else selectedItems.add(id);
      btn.classList.toggle('selected', selectedItems.has(id));
      refreshGridState();
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
