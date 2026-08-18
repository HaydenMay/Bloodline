import type { RunnerSnapshot } from '../sim/race/engine.js';
import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';
import { attachInfoBox } from './infoBox.js';

/** The legacy swing this result produced, shown alongside the finishing order. */
export interface LegacySwing {
  raceDelta: number;
  bonus: number;
  total: number;
}

/**
 * How far the calendar just moved. Surfaced here — found in play, the
 * player assumed the week count already drove ageing and was surprised it
 * didn't; RACE_RECOVERY_WEEKS (main.ts) makes it actually true, and a race
 * is the one moment worth saying so, rather than a notice on every result.
 */
export interface CalendarAdvance {
  weekBefore: number;
  weekAfter: number;
}

export function mountResultsScreen(
  container: HTMLElement,
  placings: RunnerSnapshot[],
  playerHorseId: string,
  onReturn: () => void,
  field?: Horse[],
  silksMap?: Map<string, Silks>,
  legacySwing?: LegacySwing,
  calendarAdvance?: CalendarAdvance,
): () => void {
  const root = document.createElement('div');
  root.className = 'results-screen';

  const playerHorse = placings.find((p) => p.id === playerHorseId);
  if (!playerHorse) throw new Error('Player horse not found in results');

  const playerPosition = placings.findIndex((p) => p.id === playerHorseId) + 1;

  const swingTotal = legacySwing ? legacySwing.raceDelta + legacySwing.bonus : 0;
  const swingClass = swingTotal > 0 ? 'up' : swingTotal < 0 ? 'down' : 'flat';
  const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

  root.innerHTML = `
    <div class="results-container">
      <div class="results-header">
        <h2>Race Results</h2>
        <div class="results-player-badge">
          <span class="badge-position">${playerPosition}</span>
          <span class="badge-name">${playerHorse.name}</span>
        </div>
      </div>
      ${
        legacySwing
          ? `
        <div class="results-legacy ${swingClass}">
          <span class="legacy-swing-label">Legacy</span>
          <span class="legacy-swing-delta">${signed(swingTotal)}</span>
          ${legacySwing.bonus !== 0 ? `<span class="legacy-swing-bonus">(${signed(legacySwing.raceDelta)} result, ${signed(legacySwing.bonus)} division)</span>` : ''}
          <span class="legacy-swing-total">${legacySwing.total} pts</span>
        </div>
      `
          : ''
      }
      ${
        calendarAdvance
          ? `
        <div class="results-calendar">
          🗓️ Week ${calendarAdvance.weekBefore} → ${calendarAdvance.weekAfter} — a few weeks to recover before the next card.
        </div>
      `
          : ''
      }
      <div class="results-list" id="results-list"></div>
      <button class="btn btn-primary results-return" id="return-btn">Return to Menu</button>
    </div>
  `;

  container.appendChild(root);

  const resultsList = root.querySelector<HTMLDivElement>('#results-list')!;
  const returnBtn = root.querySelector<HTMLButtonElement>('#return-btn')!;

  const teardownFns: Array<() => void> = [];

  // Build results table
  const winnerTime = placings[0]!.finishTime ?? 0;
  placings.forEach((placing, i) => {
    const position = i + 1;
    const marginSecs = (placing.finishTime ?? winnerTime) - winnerTime;
    const marginLengths = Math.round(marginSecs * 2 * 10) / 10; // Rough conversion: 6 m/s ≈ horse length per 0.4s
    const isPlayer = placing.id === playerHorseId;

    const row = document.createElement('div');
    row.className = `results-row ${isPlayer ? 'is-player' : ''}`;
    row.innerHTML = `
      <span class="results-pos">${position}</span>
      <span class="results-name">${placing.name}</span>
      <span class="results-margin">${position === 1 ? 'WIN' : `+${marginLengths}L`}</span>
    `;

    // Attach infobox if we have field data
    if (field && silksMap) {
      const horse = field.find((h) => h.id === placing.id);
      if (horse) {
        const nameSpan = row.querySelector<HTMLSpanElement>('.results-name')!;
        const silks = silksMap.get(horse.id);
        const cleanup = attachInfoBox(nameSpan, horse, silks);
        teardownFns.push(cleanup);
        nameSpan.style.cursor = 'pointer';
      }
    }

    resultsList.appendChild(row);
  });

  returnBtn.addEventListener('click', onReturn);

  return () => {
    teardownFns.forEach((fn) => fn());
    root.remove();
  };
}
