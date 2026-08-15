/**
 * The standard modal for anything the player needs to read or answer.
 *
 * Use this instead of `alert()` and instead of hand-building a `.modal-overlay`.
 * Native dialogs look like an OS error rather than part of the game, and every
 * hand-rolled overlay re-invents its own markup, wiring and teardown — which is
 * how the "don't show again" checkbox once ended up saving on one button but
 * not the other.
 *
 * Covers three shapes:
 *   - a notice   — one button, an outcome to acknowledge
 *   - a choice   — two or more buttons, the player picks
 *   - either one carrying an opt-out checkbox
 *
 * Bespoke full-screen moments (the championship victory scene) are their own
 * thing and deliberately do not go through here.
 */

export type NoticeTone = 'positive' | 'setback' | 'warning' | 'neutral';

export interface NoticeAction {
  label: string;
  /** Primary is the accented, recommended choice. Defaults to primary. */
  variant?: 'primary' | 'secondary';
  /**
   * Runs when this button is chosen. Receives the checkbox state, so every
   * branch sees it and none can forget to read it.
   */
  onSelect?: (checked: boolean) => void;
}

export interface NoticeCheckbox {
  label: string;
  /** Runs on dismissal, whichever action was taken. */
  onChange?: (checked: boolean) => void;
}

export interface NoticeOptions {
  icon?: string;
  title: string;
  /** Each string becomes its own paragraph. */
  lines: string[];
  /** Muted footer line — what to do next. */
  hint?: string;
  tone?: NoticeTone;
  /** Buttons, left to right. Defaults to a single dismiss button. */
  actions?: NoticeAction[];
  /** Label for the default button when `actions` is omitted. */
  buttonLabel?: string;
  checkbox?: NoticeCheckbox;
  /**
   * Whether clicking the backdrop closes the modal. Defaults to true for a
   * single-action notice and false for a choice, where dismissing without
   * picking would be ambiguous.
   */
  dismissOnBackdrop?: boolean;
}

/** Escapes text destined for innerHTML — horse names are player-supplied. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Shows a modal over `container`. Returns a function that closes it early —
 * useful when a screen tears down while a notice is still open.
 */
export function showNotice(
  container: HTMLElement,
  options: NoticeOptions,
  onDismiss?: () => void,
): () => void {
  const {
    icon,
    title,
    lines,
    hint,
    tone = 'neutral',
    checkbox,
    buttonLabel = 'Continue',
  } = options;

  const actions: NoticeAction[] = options.actions?.length
    ? options.actions
    : [{ label: buttonLabel }];
  const dismissOnBackdrop = options.dismissOnBackdrop ?? actions.length <= 1;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content notice-modal notice-${tone}" role="dialog" aria-modal="true">
      ${icon ? `<div class="notice-icon" aria-hidden="true">${icon}</div>` : ''}
      <h2 class="notice-title">${escapeHtml(title)}</h2>
      ${lines.map((line) => `<p class="notice-line">${escapeHtml(line)}</p>`).join('')}
      ${hint ? `<p class="notice-hint">${escapeHtml(hint)}</p>` : ''}
      ${
        checkbox
          ? `
        <label class="notice-checkbox">
          <input type="checkbox" class="notice-checkbox-input" />
          <span>${escapeHtml(checkbox.label)}</span>
        </label>
      `
          : ''
      }
      <div class="notice-actions">
        ${actions
          .map(
            (action, i) =>
              `<button class="btn btn-${action.variant ?? 'primary'} notice-btn" data-action-index="${i}">${escapeHtml(action.label)}</button>`,
          )
          .join('')}
      </div>
    </div>
  `;

  container.appendChild(overlay);

  const checkboxInput = overlay.querySelector<HTMLInputElement>('.notice-checkbox-input');
  let closed = false;

  const close = (action?: NoticeAction): void => {
    if (closed) return;
    closed = true;
    const checked = checkboxInput?.checked ?? false;
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    action?.onSelect?.(checked);
    checkbox?.onChange?.(checked);
    onDismiss?.();
  };

  function onKeyDown(e: KeyboardEvent): void {
    // Escape is only an unambiguous answer when there is one button.
    if (e.key === 'Escape' && actions.length === 1) {
      e.preventDefault();
      close(actions[0]);
    }
  }

  overlay.querySelectorAll<HTMLButtonElement>('.notice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.actionIndex);
      close(actions[index]);
    });
  });

  // Clicking the backdrop dismisses; a click inside the card must not.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && dismissOnBackdrop) close(actions[0]);
  });

  document.addEventListener('keydown', onKeyDown);

  overlay.querySelector<HTMLButtonElement>('.notice-btn')?.focus();

  return () => close();
}
