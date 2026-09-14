import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';

export interface PodiumPlacing {
  horse: Horse;
  position: 1 | 2 | 3;
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);

/**
 * Shows the one-time Championship milestone after the race results are closed.
 *
 * This is intentionally a short, readable decision sheet rather than a second
 * results scene. The race result already says how the field finished; this
 * acknowledges what the win changes for the horse and lets the player decide
 * what comes next.
 */
export function mountChampionshipVictory(
  container: HTMLElement,
  horse: Horse,
  silks?: Silks,
  onRetire?: () => void,
  onKeepRacing?: () => void,
  topThree?: PodiumPlacing[],
): () => void {
  const root = document.createElement('section');
  root.className = 'championship-victory';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'championship-title');

  const podium = (topThree?.length ? topThree : [{ horse, position: 1 as const }])
    .sort((a, b) => a.position - b.position)
    .map(({ horse: placedHorse, position }) => `
      <li class="championship-podium-row ${position === 1 ? 'is-winner' : ''}">
        <span class="championship-place" aria-label="Place ${position}">${position}</span>
        <span class="championship-podium-name">${escapeHtml(placedHorse.name)}</span>
        ${position === 1 ? '<span class="championship-podium-status">Champion</span>' : ''}
      </li>
    `)
    .join('');

  const championColour = silks?.primary ?? '#e2b84d';
  root.innerHTML = `
    <div class="championship-victory-backdrop"></div>
    <div class="championship-card" style="--champion-colour: ${championColour}">
      <p class="championship-kicker">Championship Final</p>
      <h2 id="championship-title">A champion is crowned</h2>
      <p class="championship-summary"><strong>${escapeHtml(horse.name)}</strong> has won the Bloodline Championship.</p>
      <ol class="championship-podium" aria-label="Championship podium">
        ${podium}
      </ol>
      <p class="championship-next-step">The title is permanent. Retire to begin their legacy, or keep racing from the stable.</p>
      <div class="championship-actions">
        <button class="btn btn-primary" id="retire-btn">Retire champion</button>
        <button class="btn btn-secondary" id="keep-racing-btn">Keep racing</button>
      </div>
    </div>
  `;

  container.appendChild(root);

  root.querySelector<HTMLButtonElement>('#retire-btn')!.addEventListener('click', () => onRetire?.());
  root.querySelector<HTMLButtonElement>('#keep-racing-btn')!.addEventListener('click', () => onKeepRacing?.());
  root.querySelector<HTMLButtonElement>('#retire-btn')!.focus();

  return () => root.remove();
}
