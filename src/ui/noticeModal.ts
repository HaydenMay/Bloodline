/**
 * A styled in-game notice, used in place of `alert()` for moments the player
 * should actually read — division outcomes, Hall of Fame inductions.
 *
 * Native alerts pull the player out of the game and can only shout; this sits
 * over whatever screen is behind it and can carry a hint about what to do next.
 */
export interface NoticeOptions {
  icon?: string;
  title: string;
  /** Each string becomes its own paragraph. */
  lines: string[];
  /** Muted footer line — what to do next. */
  hint?: string;
  buttonLabel?: string;
  /** Sets the accent colour: a good result, a setback, or neutral news. */
  tone?: 'positive' | 'setback' | 'neutral';
}

export function showNotice(
  container: HTMLElement,
  options: NoticeOptions,
  onDismiss?: () => void,
): void {
  const { icon, title, lines, hint, buttonLabel = 'Continue', tone = 'neutral' } = options;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content notice-modal notice-${tone}">
      ${icon ? `<div class="notice-icon">${icon}</div>` : ''}
      <h2 class="notice-title">${title}</h2>
      ${lines.map((line) => `<p class="notice-line">${line}</p>`).join('')}
      ${hint ? `<p class="notice-hint">${hint}</p>` : ''}
      <button class="btn btn-primary notice-btn">${buttonLabel}</button>
    </div>
  `;

  container.appendChild(overlay);

  const dismiss = (): void => {
    overlay.remove();
    onDismiss?.();
  };

  overlay.querySelector('.notice-btn')?.addEventListener('click', dismiss);
  // Clicking the backdrop dismisses too, but a click inside the card must not.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
}
