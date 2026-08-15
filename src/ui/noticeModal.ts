/**
 * The standard modal for anything the player needs to read, answer or type.
 *
 * Use this instead of `alert()`/`confirm()` and instead of hand-building a
 * `.modal-overlay`. Native dialogs look like an OS error rather than part of
 * the game, and every hand-rolled overlay re-invents its own markup, wiring and
 * teardown — which is how the "don't show again" checkbox once ended up saving
 * on one button but not the other.
 *
 * Shapes it covers:
 *   - a notice  — one button, an outcome to acknowledge
 *   - a choice  — two or more buttons, the player picks
 *   - a prompt  — a text field, optionally required
 *   - any of the above carrying an opt-out checkbox
 *
 * Bespoke full-screen moments (the championship victory scene) are their own
 * thing and deliberately do not go through here.
 */

export type NoticeTone = 'positive' | 'setback' | 'warning' | 'neutral';

/** What the player left behind: checkbox state and typed text. */
export interface NoticeResult {
  checked: boolean;
  value: string;
}

/** A result plus which button produced it. */
export interface NoticeOutcome extends NoticeResult {
  actionIndex: number;
  label: string;
}

export interface NoticeAction {
  label: string;
  /** Primary is the accented, recommended choice. Defaults to primary. */
  variant?: 'primary' | 'secondary';
  /**
   * Runs when this button is chosen. Receives the checkbox and input state, so
   * every branch sees them and none can forget to read them.
   */
  onSelect?: (result: NoticeResult) => void;
  /**
   * Grey this button out until a required input has text. Defaults to true for
   * a primary action, false for a secondary one — a Cancel must stay reachable.
   */
  requiresInput?: boolean;
}

export interface NoticeCheckbox {
  label: string;
  /** Runs on dismissal, whichever action was taken. */
  onChange?: (checked: boolean) => void;
}

export interface NoticeInput {
  label?: string;
  placeholder?: string;
  value?: string;
  maxLength?: number;
  /** Blocks the primary action until something is typed. */
  required?: boolean;
}

export interface NoticeOptions {
  icon?: string;
  title: string;
  /** Each string becomes its own paragraph. */
  lines?: string[];
  /** Muted footer line — what to do next. */
  hint?: string;
  tone?: NoticeTone;
  /** Buttons, left to right. Defaults to a single dismiss button. */
  actions?: NoticeAction[];
  /** Label for the default button when `actions` is omitted. */
  buttonLabel?: string;
  checkbox?: NoticeCheckbox;
  input?: NoticeInput;
  /**
   * Whether clicking the backdrop closes the modal. Defaults to true for a
   * single-action notice and false for a choice or a prompt, where dismissing
   * without answering would be ambiguous.
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

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select, textarea, [href], [tabindex]:not([tabindex="-1"])';

/**
 * Shows a modal over `container`. Returns a function that closes it early —
 * useful when a screen tears down while a notice is still open.
 */
export function showNotice(
  container: HTMLElement,
  options: NoticeOptions,
  onDismiss?: (outcome: NoticeOutcome) => void,
): () => void {
  const {
    icon,
    title,
    lines = [],
    hint,
    tone = 'neutral',
    checkbox,
    input,
    buttonLabel = 'Continue',
  } = options;

  const actions: NoticeAction[] = options.actions?.length
    ? options.actions
    : [{ label: buttonLabel }];
  // A prompt needs an answer, so the backdrop should not silently discard it.
  const dismissOnBackdrop = options.dismissOnBackdrop ?? (actions.length <= 1 && !input);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content notice-modal notice-${tone}" role="dialog" aria-modal="true">
      <div class="notice-body">
        ${icon ? `<div class="notice-icon" aria-hidden="true">${icon}</div>` : ''}
        <h2 class="notice-title">${escapeHtml(title)}</h2>
        ${lines.map((line) => `<p class="notice-line">${escapeHtml(line)}</p>`).join('')}
        ${hint ? `<p class="notice-hint">${escapeHtml(hint)}</p>` : ''}
        ${
          input
            ? `
          <label class="notice-input-wrap">
            ${input.label ? `<span class="notice-input-label">${escapeHtml(input.label)}</span>` : ''}
            <input type="text" class="notice-input"
                   ${input.placeholder ? `placeholder="${escapeHtml(input.placeholder)}"` : ''}
                   ${input.maxLength ? `maxlength="${input.maxLength}"` : ''}
                   value="${escapeHtml(input.value ?? '')}" />
          </label>
        `
            : ''
        }
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
      </div>
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

  const previouslyFocused = document.activeElement as HTMLElement | null;
  container.appendChild(overlay);

  const card = overlay.querySelector<HTMLElement>('.notice-modal')!;
  const checkboxInput = overlay.querySelector<HTMLInputElement>('.notice-checkbox-input');
  const textInput = overlay.querySelector<HTMLInputElement>('.notice-input');
  const buttons = Array.from(overlay.querySelectorAll<HTMLButtonElement>('.notice-btn'));

  /** Buttons gated on a required field, so the player cannot submit nothing. */
  const gatedButtons = input?.required
    ? buttons.filter((btn) => {
        const action = actions[Number(btn.dataset.actionIndex)]!;
        return action.requiresInput ?? (action.variant ?? 'primary') === 'primary';
      })
    : [];

  const syncGate = (): void => {
    const empty = (textInput?.value ?? '').trim().length === 0;
    gatedButtons.forEach((btn) => {
      btn.disabled = empty;
    });
  };
  syncGate();

  let closed = false;

  const close = (index: number): void => {
    if (closed) return;
    const action = actions[index];
    // Never resolve through a button the player cannot press.
    if (action && gatedButtons.includes(buttons[index]!) && buttons[index]!.disabled) return;
    closed = true;

    const result: NoticeResult = {
      checked: checkboxInput?.checked ?? false,
      value: (textInput?.value ?? '').trim(),
    };

    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
    previouslyFocused?.focus?.();

    action?.onSelect?.(result);
    checkbox?.onChange?.(result.checked);
    onDismiss?.({ ...result, actionIndex: index, label: action?.label ?? '' });
  };

  /** True when this is the frontmost modal, so stacked notices don't both react. */
  const isTopmost = (): boolean => {
    const all = container.querySelectorAll('.modal-overlay');
    return all[all.length - 1] === overlay;
  };

  function onKeyDown(e: KeyboardEvent): void {
    if (closed || !isTopmost()) return;

    // Escape is only an unambiguous answer when there is one button and nothing
    // typed to throw away.
    if (e.key === 'Escape' && actions.length === 1 && !input) {
      e.preventDefault();
      close(0);
      return;
    }

    // Enter submits a prompt from the text field.
    if (e.key === 'Enter' && textInput && e.target === textInput) {
      e.preventDefault();
      const primary = buttons.findIndex(
        (btn, i) => !btn.disabled && (actions[i]!.variant ?? 'primary') === 'primary',
      );
      if (primary !== -1) close(primary);
      return;
    }

    // Keep Tab inside the dialog.
    if (e.key === 'Tab') {
      const focusable = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !card.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => close(Number(btn.dataset.actionIndex)));
  });

  textInput?.addEventListener('input', syncGate);

  // Clicking the backdrop dismisses; a click inside the card must not.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && dismissOnBackdrop) close(0);
  });

  document.addEventListener('keydown', onKeyDown, true);

  // A prompt wants the caret in the field; everything else wants the button.
  if (textInput) {
    textInput.focus();
    textInput.select();
  } else {
    buttons.find((b) => !b.disabled)?.focus();
  }

  return () => close(-1);
}

/**
 * Promise form, for sequences that read better awaited than nested in
 * callbacks. Resolves once the modal closes, with the chosen action and state.
 */
export function askNotice(
  container: HTMLElement,
  options: NoticeOptions,
): Promise<NoticeOutcome> {
  return new Promise((resolve) => {
    showNotice(container, options, resolve);
  });
}
