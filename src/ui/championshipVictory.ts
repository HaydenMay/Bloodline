import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';

export function mountChampionshipVictory(
  container: HTMLElement,
  horse: Horse,
  silks?: Silks,
  onRetire?: () => void,
  onKeepRacing?: () => void,
): () => void {
  const root = document.createElement('div');
  root.className = 'championship-victory';

  root.innerHTML = `
    <div class="victory-overlay"></div>
    <div class="victory-container">
      <div class="victory-content">
        <div class="victory-horse-display">
          <canvas id="victory-horse-canvas" width="300" height="300"></canvas>
          <div class="victory-wreath-overlay" id="victory-wreath-overlay"></div>
        </div>
        <h2 class="victory-title">🏆 Championship Victory!</h2>
        <p class="victory-message">You've won the championship! Congratulations <strong>${horse.name}</strong></p>
        <div class="victory-buttons">
          <button class="btn btn-secondary" id="retire-btn">Retire Champion</button>
          <button class="btn btn-primary" id="keep-racing-btn">Keep Racing</button>
        </div>
      </div>
    </div>
  `;

  container.appendChild(root);

  // Draw the horse sprite on canvas
  const canvas = root.querySelector<HTMLCanvasElement>('#victory-horse-canvas')!;
  const ctx = canvas.getContext('2d')!;
  drawHorseSprite(ctx, canvas.width, canvas.height, silks);

  // Animate wreath
  const wreathOverlay = root.querySelector<HTMLDivElement>('#victory-wreath-overlay')!;
  animateWreath(wreathOverlay);

  // Button handlers
  const retireBtn = root.querySelector<HTMLButtonElement>('#retire-btn')!;
  const keepRacingBtn = root.querySelector<HTMLButtonElement>('#keep-racing-btn')!;

  retireBtn.addEventListener('click', () => {
    if (onRetire) onRetire();
  });

  keepRacingBtn.addEventListener('click', () => {
    if (onKeepRacing) onKeepRacing();
  });

  return () => {
    root.remove();
  };
}

function drawHorseSprite(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  silks?: Silks,
): void {
  // Clear canvas
  ctx.fillStyle = 'transparent';
  ctx.fillRect(0, 0, width, height);

  // Draw a simple horse silhouette (front view)
  // This will be replaced with the actual sprite from src/assets/horse-positions/foward-no-jockey
  ctx.fillStyle = silks?.bodyColor || '#8B7355';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;

  // Horse body (front view - simplified)
  const centerX = width / 2;
  const centerY = height / 2;

  // Head
  ctx.beginPath();
  ctx.arc(centerX, centerY - 40, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Body
  ctx.beginPath();
  ctx.ellipse(centerX, centerY + 20, 35, 45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Legs
  ctx.fillStyle = silks?.bodyColor || '#8B7355';
  for (let i = 0; i < 4; i++) {
    const legX = centerX + (i < 2 ? -20 : 20);
    ctx.fillRect(legX - 8, centerY + 50, 16, 50);
    ctx.strokeRect(legX - 8, centerY + 50, 16, 50);
  }
}

function animateWreath(element: HTMLElement): void {
  // Create wreath HTML with animation
  element.innerHTML = `
    <div class="wreath wreath-animated">
      <span class="wreath-flower" style="--pos: 0;"></span>
      <span class="wreath-flower" style="--pos: 1;"></span>
      <span class="wreath-flower" style="--pos: 2;"></span>
      <span class="wreath-flower" style="--pos: 3;"></span>
      <span class="wreath-flower" style="--pos: 4;"></span>
      <span class="wreath-flower" style="--pos: 5;"></span>
      <span class="wreath-flower" style="--pos: 6;"></span>
      <span class="wreath-flower" style="--pos: 7;"></span>
    </div>
  `;

  // Trigger animation
  element.classList.add('show');
}
