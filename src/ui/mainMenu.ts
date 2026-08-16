/**
 * Main menu: landing page with game title and "New Game"/"Continue" buttons.
 */

export interface MainMenuCallbacks {
  onNewGame: () => void;
  onContinue?: () => void;
  /** Hands the player a copy of their save to keep. */
  onExport?: () => void;
  /** Receives the text of a save file the player chose. */
  onImport?: (text: string) => void;
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
        <button class="btn btn-primary" id="new-game-btn">New Game</button>
      </div>
      <div class="main-menu-save">
        <button class="menu-link" id="export-btn">Back Up Save</button>
        <button class="menu-link" id="import-btn">Restore Save</button>
        <input type="file" id="import-file" accept="application/json,.json" hidden />
      </div>
      <p class="main-menu-save-note">
        Your stable lives in this browser. Back it up to keep it if you clear your
        data or move to another device.
      </p>
    </div>
  `;

  container.appendChild(menu);

  if (callbacks.onContinue) {
    const continueBtn = menu.querySelector<HTMLButtonElement>('#continue-btn')!;
    continueBtn.addEventListener('click', callbacks.onContinue);
  }

  const newGameBtn = menu.querySelector<HTMLButtonElement>('#new-game-btn')!;
  newGameBtn.addEventListener('click', callbacks.onNewGame);

  menu.querySelector<HTMLButtonElement>('#export-btn')!.addEventListener('click', () => {
    callbacks.onExport?.();
  });

  const fileInput = menu.querySelector<HTMLInputElement>('#import-file')!;
  menu.querySelector<HTMLButtonElement>('#import-btn')!.addEventListener('click', () => {
    fileInput.click();
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
