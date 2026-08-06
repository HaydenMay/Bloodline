/**
 * Main menu: landing page with game title and "New Game" button.
 */

export function mountMainMenu(container: HTMLElement, onNewGame: () => void): () => void {
  const menu = document.createElement('div');
  menu.className = 'main-menu';

  menu.innerHTML = `
    <div class="main-menu-content">
      <div class="main-menu-title">
        <h1>Bloodline</h1>
      </div>
      <div class="main-menu-actions">
        <button class="btn btn-primary" id="new-game-btn">New Game</button>
      </div>
    </div>
  `;

  container.appendChild(menu);

  const newGameBtn = menu.querySelector<HTMLButtonElement>('#new-game-btn')!;
  newGameBtn.addEventListener('click', onNewGame);

  return () => {
    menu.remove();
  };
}
