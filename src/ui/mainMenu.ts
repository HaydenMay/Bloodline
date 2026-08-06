/**
 * Main menu: landing page with game title and "New Game"/"Continue" buttons.
 */

export interface MainMenuCallbacks {
  onNewGame: () => void;
  onContinue?: () => void;
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
    </div>
  `;

  container.appendChild(menu);

  if (callbacks.onContinue) {
    const continueBtn = menu.querySelector<HTMLButtonElement>('#continue-btn')!;
    continueBtn.addEventListener('click', callbacks.onContinue);
  }

  const newGameBtn = menu.querySelector<HTMLButtonElement>('#new-game-btn')!;
  newGameBtn.addEventListener('click', callbacks.onNewGame);

  return () => {
    menu.remove();
  };
}
