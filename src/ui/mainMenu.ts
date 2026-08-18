/**
 * Main menu.
 *
 * "New Horse" rather than "New Game": the yard persists across horses by
 * design, so a button labelled New Game would promise a reset it does not
 * perform. Wiping the yard is a separate, deliberately awkward action.
 */

export interface MainMenuCallbacks {
  onNewGame: () => void;
  onContinue?: () => void;
  /** Hands the player a copy of their save to keep. */
  onExport?: () => void;
  /** Receives the text of a save file the player chose. */
  onImport?: (text: string) => void;
  /**
   * The Archive — the pedigree tree — opened straight from the menu.
   *
   * DESIGN.md 10: "first-class screen, not a submenu." The stud book is
   * reachable through "New Horse" already, but only as one branch of a
   * decision; a yard's bloodstock is worth looking at on its own — which
   * ancestor carried a line's speed, which mare to breed next — so it gets a
   * door of its own, with breeding itself reachable from inside it.
   */
  onBloodstock?: () => void;
  /** Whether the yard has anything at stud, which is what earns that door. */
  hasBloodstock?: boolean;
  /** Wipes the yard and starts over. Guarded behind a confirmation. */
  onResetStable?: () => void;
  /** Whether a yard already exists, which changes what the buttons mean. */
  hasStable?: boolean;
}

export function mountMainMenu(container: HTMLElement, callbacks: MainMenuCallbacks): () => void {
  const menu = document.createElement('div');
  menu.className = 'main-menu';

  menu.innerHTML = `
    <div class="main-menu-content">
      <div class="main-menu-title">
        <h1>Bloodline</h1>
      </div>
      <div class="main-menu-actions">
        ${callbacks.onContinue ? '<button class="btn btn-primary" id="continue-btn">Continue Career</button>' : ''}
        <button class="btn btn-primary" id="new-game-btn">${callbacks.hasStable ? 'New Horse' : 'Start Your Stable'}</button>
 <!--       ${
          callbacks.hasBloodstock
            ? '<button class="btn btn-secondary" id="bloodstock-btn">The Archive</button>'
            : ''
        } -->
      </div>
      ${
        callbacks.hasStable
          ? `<p class="main-menu-context">A new horse joins your existing stable — facilities, staff and prestige carry over.</p>`
          : ''
      }
      <div class="main-menu-save">
        <button class="menu-link" id="export-btn">Back Up Save</button>
        <button class="menu-link" id="import-btn">Restore Save</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden />
      </div>
      <p class="main-menu-save-note">
        Your stable lives in this browser. Back it up to keep it if you clear your
        data or move to another device.
      </p>
      ${
        callbacks.hasStable
          ? `<div class="main-menu-danger">
               <button class="menu-link danger" id="reset-btn">Start a New Stable</button>
             </div>`
          : ''
      }
    </div>
  `;

  container.appendChild(menu);

  if (callbacks.onContinue) {
    const continueBtn = menu.querySelector<HTMLButtonElement>('#continue-btn')!;
    continueBtn.addEventListener('click', callbacks.onContinue);
  }

  const newGameBtn = menu.querySelector<HTMLButtonElement>('#new-game-btn')!;
  newGameBtn.addEventListener('click', callbacks.onNewGame);

  menu.querySelector<HTMLButtonElement>('#bloodstock-btn')?.addEventListener('click', () => {
    callbacks.onBloodstock?.();
  });

  menu.querySelector<HTMLButtonElement>('#export-btn')!.addEventListener('click', () => {
    callbacks.onExport?.();
  });

  const fileInput = menu.querySelector<HTMLInputElement>('#import-file')!;
  menu.querySelector<HTMLButtonElement>('#import-btn')!.addEventListener('click', () => {
    fileInput.click();
  });
  menu.querySelector<HTMLButtonElement>('#reset-btn')?.addEventListener('click', () => {
    callbacks.onResetStable?.();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      callbacks.onImport?.(String(reader.result ?? ''));
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  return () => {
    menu.remove();
  };
}
