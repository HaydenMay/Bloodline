import { getBadgeDataUri } from '../render/shieldBadge.js';
import { drawHorseShadow } from '../render/horse.js';
import { drawSpriteHorse, loadSprites } from '../render/spriteHorse.js';
import { COATS, RIVAL_SILKS, coatFor, type Silks } from '../render/palette.js';

const COAT_COLORS = Object.values(COATS).map((coat) => ({
  id: coat.id,
  name: coat.name,
}));

/**
 * Colours for the silks' SECONDARY, which is breeches, collar and the badge's
 * accent. Taken from the rival silks, because that is the slot it fills.
 *
 * It used to offer the coats' MANE colours here, under a label that said "Mane
 * & Leg Color", and that was simply a lie about what the control does: mane and
 * legs come from the coat gene (DESIGN.md §11 — appearance is genetic and not
 * editable), so picking a "mane colour" here recoloured the jockey's breeches
 * and nothing else.
 */
const TRIM_COLORS = [...new Set(RIVAL_SILKS.map((s) => s.secondary))].map((hex, i) => ({
  hex,
  name: `Trim ${i + 1}`,
}));

const SILKS_COLORS = RIVAL_SILKS.map((silks, i) => ({
  hex: silks.primary,
  name: `Silks ${i + 1}`,
}));

export function mountSilksDemo(host: HTMLElement): void {
  let selectedCoat = 'palomino';
  let selectedTrimColor = RIVAL_SILKS[0]!.secondary;
  let selectedSilksColor = RIVAL_SILKS[0]!.primary;

  const updatePreview = async () => {
    const silks: Silks = { primary: selectedSilksColor, secondary: selectedTrimColor };

    const badgeImg = host.querySelector<HTMLImageElement>('.sd-badge');
    if (badgeImg) {
      const uri = await getBadgeDataUri({ coat: selectedCoat, silks });
      if (uri) badgeImg.src = uri;
    }

    // The RACE SPRITE, not the drawn rig. This panel exists to answer "what
    // will my horse look like out there", and the only honest answer is the
    // thing the race actually draws — same sheet, same mask, same tint path.
    // The rig is a different horse; showing it here would preview a coat the
    // player never sees.
    const canvas = host.querySelector<HTMLCanvasElement>('.sd-horse-canvas');
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / 200, canvas.height / 150);
      const x = canvas.width / 2;
      const y = canvas.height * 0.88;
      drawHorseShadow(ctx, x, y + 2, scale * 1.1);
      // A phase with all four legs clear of each other, so coat, points and
      // silks are all readable at a glance rather than overlapping.
      drawSpriteHorse(ctx, x, y, { coat: selectedCoat, silks, phase: 0.12, scale });
    }
  };

  host.innerHTML = `
    <div class="silks-demo">
      <h2>Color System Demo</h2>
      <p>Customize the three color regions: body, mane/legs, and silks.</p>

      <div class="sd-section">
        <label>1. Body Color (Coat)</label>
        <div class="sd-buttons">
          ${COAT_COLORS.map(
            (coat) =>
              `<button class="sd-coat-btn ${coat.id === selectedCoat ? 'active' : ''}" data-coat="${coat.id}">
                ${coat.name}
              </button>`,
          ).join('')}
        </div>
      </div>

      <div class="sd-section">
        <label>2. Silks Trim (breeches &amp; collar)</label>
        <div class="sd-colors">
          ${TRIM_COLORS.map(
            (color) =>
              `<button
                class="sd-color-btn sd-trim ${color.hex === selectedTrimColor ? 'active' : ''}"
                data-color="${color.hex}"
                title="${color.name}"
                style="background: ${color.hex}"
              ></button>`,
          ).join('')}
        </div>
        <input type="text" class="sd-hex-input" id="trim-hex" value="${selectedTrimColor}" placeholder="#F2F4F7" />
      </div>

      <div class="sd-section">
        <label>3. Silks Color (Jockey & Shield Outline)</label>
        <div class="sd-colors">
          ${SILKS_COLORS.map(
            (color) =>
              `<button
                class="sd-color-btn sd-silks ${color.hex === selectedSilksColor ? 'active' : ''}"
                data-color="${color.hex}"
                title="${color.name}"
                style="background: ${color.hex}"
              ></button>`,
          ).join('')}
        </div>
        <input type="text" class="sd-hex-input" id="silks-hex" value="${selectedSilksColor}" placeholder="#2F7FD1" />
      </div>

      <div class="sd-preview-container">
        <div class="sd-preview">
          <p>Horse Preview</p>
          <canvas class="sd-horse-canvas" width="300" height="200"></canvas>
        </div>
        <div class="sd-preview">
          <p>Badge Preview</p>
          <img class="sd-badge" src="" alt="Badge preview" />
          <div class="sd-info">
            <span class="sd-coat-name">${COAT_COLORS.find((c) => c.id === selectedCoat)?.name}</span>
            <div class="sd-color-labels">
              <div class="sd-color-info">
                <span class="sd-color-label">Mane</span>
                <span class="sd-color-swatch" style="background: ${coatFor(selectedCoat).hair}"></span>
              </div>
              <div class="sd-color-info">
                <span class="sd-color-label">Points</span>
                <span class="sd-color-swatch" style="background: ${coatFor(selectedCoat).points}"></span>
              </div>
              <div class="sd-color-info">
                <span class="sd-color-label">Silks</span>
                <span class="sd-color-swatch" style="background: ${selectedSilksColor}"></span>
              </div>
              <div class="sd-color-info">
                <span class="sd-color-label">Trim</span>
                <span class="sd-color-swatch" style="background: ${selectedTrimColor}"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="sd-actions">
        <button class="sd-start-btn">Start Race</button>
        <a href="/" class="sd-back-link">Back</a>
      </div>
    </div>
  `;

  // Coat selection
  host.querySelectorAll('.sd-coat-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const coat = (e.target as HTMLElement).getAttribute('data-coat');
      if (coat) {
        selectedCoat = coat;
        host.querySelectorAll('.sd-coat-btn').forEach((b) => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        host.querySelector<HTMLSpanElement>('.sd-coat-name')!.textContent =
          COAT_COLORS.find((c) => c.id === coat)?.name || coat;
        updatePreview();
      }
    });
  });

  // Silks trim selection
  const trimBtns = host.querySelectorAll('.sd-color-btn.sd-trim');
  trimBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const color = (e.target as HTMLElement).getAttribute('data-color');
      if (color) {
        selectedTrimColor = color;
        host.querySelectorAll('.sd-color-btn.sd-trim').forEach((b) => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        host.querySelector<HTMLInputElement>('#trim-hex')!.value = color;
        host.querySelectorAll('.sd-color-info')[0]!.querySelector('.sd-color-swatch')!.setAttribute(
          'style',
          `background: ${color}`,
        );
        updatePreview();
      }
    });
  });

  // Silks color selection
  host.querySelectorAll('.sd-color-btn.sd-silks').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const color = (e.target as HTMLElement).getAttribute('data-color');
      if (color) {
        selectedSilksColor = color;
        host.querySelectorAll('.sd-color-btn.sd-silks').forEach((b) => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        host.querySelector<HTMLInputElement>('#silks-hex')!.value = color;
        host.querySelectorAll('.sd-color-info')[1]!.querySelector('.sd-color-swatch')!.setAttribute(
          'style',
          `background: ${color}`,
        );
        updatePreview();
      }
    });
  });

  // Hex input updates
  host.querySelector<HTMLInputElement>('#trim-hex')!.addEventListener('change', (e) => {
    const hex = (e.target as HTMLInputElement).value;
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      selectedTrimColor = hex;
      host.querySelectorAll('.sd-color-btn.sd-trim').forEach((b) => b.classList.remove('active'));
      host.querySelectorAll('.sd-color-info')[0]!.querySelector('.sd-color-swatch')!.setAttribute(
        'style',
        `background: ${hex}`,
      );
      updatePreview();
    }
  });

  host.querySelector<HTMLInputElement>('#silks-hex')!.addEventListener('change', (e) => {
    const hex = (e.target as HTMLInputElement).value;
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      selectedSilksColor = hex;
      host.querySelectorAll('.sd-color-btn.sd-silks').forEach((b) => b.classList.remove('active'));
      host.querySelectorAll('.sd-color-info')[1]!.querySelector('.sd-color-swatch')!.setAttribute(
        'style',
        `background: ${hex}`,
      );
      updatePreview();
    }
  });

  // Start race button
  host.querySelector('.sd-start-btn')!.addEventListener('click', () => {
    sessionStorage.setItem(
      'color-override',
      JSON.stringify({
        coat: selectedCoat,
        maneColor: selectedTrimColor,
        silksColor: selectedSilksColor,
      }),
    );
    window.location.href = '/';
  });

  // Initial preview render
  loadSprites().then(() => updatePreview());
}
