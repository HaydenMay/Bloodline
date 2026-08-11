import type { Horse } from '../sim/types.js';
import type { Silks } from '../render/palette.js';

export interface PodiumPlacing {
  horse: Horse;
  position: 1 | 2 | 3;
}

export function mountChampionshipVictory(
  container: HTMLElement,
  horse: Horse,
  silks?: Silks,
  onRetire?: () => void,
  onKeepRacing?: () => void,
  topThree?: PodiumPlacing[],
): () => void {
  const root = document.createElement('div');
  root.className = 'championship-victory';

  root.innerHTML = `
    <div class="victory-overlay"></div>
    <div class="victory-container">
      <div class="victory-content">
        ${
          topThree && topThree.length >= 3
            ? `
          <div class="podium-display">
            <div class="podium-slot podium-second">
              <canvas id="second-place-canvas"></canvas>
              <div class="podium-platform">
                <span class="podium-number">2</span>
              </div>
            </div>
            <div class="podium-slot podium-first">
              <canvas id="first-place-canvas"></canvas>
              <div class="victory-wreath-overlay" id="victory-wreath-overlay"></div>
              <div class="podium-platform">
                <span class="podium-number">1</span>
              </div>
            </div>
            <div class="podium-slot podium-third">
              <canvas id="third-place-canvas"></canvas>
              <div class="podium-platform">
                <span class="podium-number">3</span>
              </div>
            </div>
          </div>
        `
            : `
          <div class="victory-horse-display">
            <canvas id="victory-horse-canvas"></canvas>
            <div class="victory-wreath-overlay" id="victory-wreath-overlay"></div>
          </div>
        `
        }
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

  // Set up horses based on whether we have top 3 data
  if (topThree && topThree.length >= 3) {
    // Podium display with top 3
    const canvasSize = 150;

    // 2nd place (left)
    const secondCanvas = root.querySelector<HTMLCanvasElement>('#second-place-canvas')!;
    secondCanvas.width = canvasSize;
    secondCanvas.height = canvasSize;
    const secondCtx = secondCanvas.getContext('2d')!;
    loadAndDrawHorseSprite(secondCtx, canvasSize, canvasSize);

    // 1st place (center) with wreath
    const firstCanvas = root.querySelector<HTMLCanvasElement>('#first-place-canvas')!;
    firstCanvas.width = canvasSize;
    firstCanvas.height = canvasSize;
    const firstCtx = firstCanvas.getContext('2d')!;
    loadAndDrawHorseSprite(firstCtx, canvasSize, canvasSize);

    const wreathOverlay = root.querySelector<HTMLDivElement>('#victory-wreath-overlay')!;
    animateWreath(wreathOverlay);

    // 3rd place (right)
    const thirdCanvas = root.querySelector<HTMLCanvasElement>('#third-place-canvas')!;
    thirdCanvas.width = canvasSize;
    thirdCanvas.height = canvasSize;
    const thirdCtx = thirdCanvas.getContext('2d')!;
    loadAndDrawHorseSprite(thirdCtx, canvasSize, canvasSize);
  } else {
    // Fallback: single horse display
    const canvas = root.querySelector<HTMLCanvasElement>('#victory-horse-canvas')!;
    const displaySize = Math.min(window.innerWidth * 0.7, 600);
    canvas.width = displaySize;
    canvas.height = displaySize;

    const ctx = canvas.getContext('2d')!;
    loadAndDrawHorseSprite(ctx, canvas.width, canvas.height, silks);

    const wreathOverlay = root.querySelector<HTMLDivElement>('#victory-wreath-overlay')!;
    animateWreath(wreathOverlay);
  }

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

function loadAndDrawHorseSprite(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  silks?: Silks,
): void {
  // Clear canvas
  ctx.fillStyle = 'transparent';
  ctx.clearRect(0, 0, width, height);

  // Load and draw the horse sprite
  const horseSrc = new URL(
    '../assets/horse-positions/forward-no-jockey/south.png',
    import.meta.url,
  ).href;

  const horseImg = new Image();
  horseImg.src = horseSrc;
  horseImg.onload = () => {
    // Scale and center the horse on the canvas
    const scale = 4; // Horse sprite is 184x184, scale up 4x for prominence
    const imgWidth = horseImg.width * scale;
    const imgHeight = horseImg.height * scale;
    const x = (width - imgWidth) / 2;
    const y = (height - imgHeight) / 2;
    ctx.drawImage(horseImg, x, y, imgWidth, imgHeight);
  };
  horseImg.onerror = () => {
    // Fallback if image doesn't load
    drawFallbackHorse(ctx, width, height, silks);
  };
}

function drawFallbackHorse(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  silks?: Silks,
): void {
  // Fallback silhouette if image fails to load
  const horseColor = silks?.primary || '#8B7355';
  ctx.fillStyle = horseColor;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;

  const centerX = width / 2;
  const centerY = height / 2;

  ctx.beginPath();
  ctx.arc(centerX, centerY - 40, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(centerX, centerY + 20, 35, 45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = horseColor;
  for (let i = 0; i < 4; i++) {
    const legX = centerX + (i < 2 ? -20 : 20);
    ctx.fillRect(legX - 8, centerY + 50, 16, 50);
    ctx.strokeRect(legX - 8, centerY + 50, 16, 50);
  }
}

function animateWreath(element: HTMLElement): void {
  // Create wreath image element
  const wreathSrc = new URL(
    '../assets/wreaths/champ_wreath.png',
    import.meta.url,
  ).href;

  const wreathImg = document.createElement('img');
  wreathImg.src = wreathSrc;
  wreathImg.className = 'victory-wreath-image';
  wreathImg.alt = 'Championship Wreath';
  element.appendChild(wreathImg);

  // Trigger animation
  element.classList.add('show');
}
