import { getBadgeDataUri } from '../render/shieldBadge.js';
import { getHorsePreviewDataUri, loadHorsePreview } from '../render/horsePreview.js';
import { loadSprites } from '../render/spriteHorse.js';
import { COATS, RIVAL_SILKS, type Silks } from '../render/palette.js';

const COAT_COLORS = Object.values(COATS).map((coat) => ({
  id: coat.id,
  name: coat.name,
}));

const MANE_COLORS = Object.values(COATS).map((coat) => ({
  hex: coat.hair,
  name: `${coat.name} Mane`,
}));

const SILKS_COLORS = RIVAL_SILKS.map((silks, i) => ({
  hex: silks.primary,
  name: `Silks ${i + 1}`,
}));

export function mountSilksDemo(host: HTMLElement): void {
  let selectedCoat = 'palomino';
  let selectedManeColor = COATS.palomino.hair;
  let selectedSilksColor = RIVAL_SILKS[0]!.primary;

  const updatePreview = async () => {
    const silks: Silks = { primary: selectedSilksColor, secondary: selectedManeColor };
    console.log('updatePreview called', { coat: selectedCoat, silks });

    // Update badge
    const badgeImg = host.querySelector<HTMLImageElement>('.sd-badge');
    if (badgeImg) {
      console.log('Badge image element found, calling getBadgeDataUri');
      const uri = await getBadgeDataUri({
        coat: selectedCoat,
        silks,
      });
      console.log('getBadgeDataUri returned:', uri ? 'data URI' : 'null');
      if (uri) {
        badgeImg.src = uri;
        console.log('Badge image src updated');
      }
    }

    // Update horse preview
    const horseUri = await getHorsePreviewDataUri({
      coat: selectedCoat,
      silks,
    });
    if (horseUri) {
      let horseImg = host.querySelector<HTMLImageElement>('.sd-horse-img');
      if (!horseImg) {
        const container = host.querySelector('.sd-preview:first-child');
        if (container) {
          const canvas = container.querySelector<HTMLCanvasElement>('.sd-horse-canvas');
          if (canvas) {
            horseImg = document.createElement('img');
            horseImg.className = 'sd-horse-img';
            horseImg.style.cssText = 'width: 100%; height: auto; image-rendering: crisp-edges; display: block;';
            canvas.replaceWith(horseImg);
          }
        }
      }
      if (horseImg) {
        horseImg.src = horseUri;
      }
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
        <label>2. Mane & Leg Color</label>
        <div class="sd-colors">
          ${MANE_COLORS.map(
            (color) =>
              `<button
                class="sd-color-btn sd-mane ${color.hex === selectedManeColor ? 'active' : ''}"
                data-color="${color.hex}"
                title="${color.name}"
                style="background: ${color.hex}"
              ></button>`,
          ).join('')}
        </div>
        <input type="text" class="sd-hex-input" id="mane-hex" value="${selectedManeColor}" placeholder="#F2E7D2" />
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
                <span class="sd-color-swatch" style="background: ${selectedManeColor}"></span>
              </div>
              <div class="sd-color-info">
                <span class="sd-color-label">Silks</span>
                <span class="sd-color-swatch" style="background: ${selectedSilksColor}"></span>
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

  // Mane color selection
  const maneBtns = host.querySelectorAll('.sd-color-btn.sd-mane');
  maneBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const color = (e.target as HTMLElement).getAttribute('data-color');
      if (color) {
        selectedManeColor = color;
        host.querySelectorAll('.sd-color-btn.sd-mane').forEach((b) => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        host.querySelector<HTMLInputElement>('#mane-hex')!.value = color;
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
  host.querySelector<HTMLInputElement>('#mane-hex')!.addEventListener('change', (e) => {
    const hex = (e.target as HTMLInputElement).value;
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      selectedManeColor = hex;
      host.querySelectorAll('.sd-color-btn.sd-mane').forEach((b) => b.classList.remove('active'));
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
        maneColor: selectedManeColor,
        silksColor: selectedSilksColor,
      }),
    );
    window.location.href = '/';
  });

  // Initial preview render
  Promise.all([loadSprites(), loadHorsePreview()]).then(() => updatePreview());
}
