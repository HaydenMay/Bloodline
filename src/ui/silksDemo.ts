import { getBadgeDataUri } from '../render/shieldBadge.js';
import { drawHorseShadow } from '../render/horse.js';
import { drawSpriteHorse, loadSprites } from '../render/spriteHorse.js';
import { COATS, RIVAL_SILKS, coatFor, type Silks } from '../render/palette.js';

const COAT_COLORS = Object.values(COATS).map((coat) => ({
  id: coat.id,
  name: coat.name,
}));

const TRIM_COLORS = [...new Set(RIVAL_SILKS.map((s) => s.secondary))].map((hex, i) => ({
  hex,
  name: `Trim ${i + 1}`,
}));

/** Every mane colour the coats define, offered on its own. */
const HAIR_COLORS = [...new Set(Object.values(COATS).map((c) => c.hair))].map((hex) => ({ hex }));
/** Every points colour the coats define — cannons and hooves. */
const POINT_COLORS = [...new Set(Object.values(COATS).map((c) => c.points))].map((hex) => ({ hex }));

const SILKS_COLORS = RIVAL_SILKS.map((silks, i) => ({
  hex: silks.primary,
  name: `Silks ${i + 1}`,
}));

export function mountSilksDemo(host: HTMLElement): void {
  // FIVE INDEPENDENT COLOURS, one per tinted material in the mask. In the game
  // three of them arrive together from the coat gene — a horse does not choose
  // its mane. This screen is the exception on purpose: it exists to exercise
  // the colour system, and it cannot show what the mask can do if three of its
  // five regions are welded to one control. Picking a coat still sets all
  // three, so it behaves as a preset; then each can be moved off it.
  let selectedCoat = 'palomino';
  let selectedHairColor = COATS.palomino.hair;
  let selectedPointColor = COATS.palomino.points;
  let selectedTrimColor = RIVAL_SILKS[0]!.secondary;
  let selectedSilksColor = RIVAL_SILKS[0]!.primary;

  const updatePreview = async () => {
    const silks: Silks = { primary: selectedSilksColor, secondary: selectedTrimColor };
    const coat = {
      ...coatFor(selectedCoat),
      hair: selectedHairColor,
      points: selectedPointColor,
    };

    const badgeImg = host.querySelector<HTMLImageElement>('.sd-badge');
    if (badgeImg) {
      const uri = await getBadgeDataUri({ coat, silks });
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
      drawSpriteHorse(ctx, x, y, { coat, silks, phase: 0.12, scale });
    }
  };

  host.innerHTML = `
    <div class="silks-demo">
      <h2>Color System Demo</h2>
      <p>Five tinted regions, one per material in the mask.</p>

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
        <label>2. Mane &amp; Tail</label>
        <div class="sd-colors">
          ${HAIR_COLORS.map(
            (color) =>
              `<button
                class="sd-color-btn sd-hair ${color.hex === selectedHairColor ? 'active' : ''}"
                data-color="${color.hex}"
                style="background: ${color.hex}"
              ></button>`,
          ).join('')}
        </div>
        <input type="text" class="sd-hex-input" id="hair-hex" value="${selectedHairColor}" placeholder="#221509" />
      </div>

      <div class="sd-section">
        <label>3. Points (lower legs &amp; hooves)</label>
        <div class="sd-colors">
          ${POINT_COLORS.map(
            (color) =>
              `<button
                class="sd-color-btn sd-points ${color.hex === selectedPointColor ? 'active' : ''}"
                data-color="${color.hex}"
                style="background: ${color.hex}"
              ></button>`,
          ).join('')}
        </div>
        <input type="text" class="sd-hex-input" id="points-hex" value="${selectedPointColor}" placeholder="#2A1A0E" />
      </div>

      <div class="sd-section">
        <label>4. Silks Trim (breeches &amp; collar)</label>
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
        <label>5. Silks Color (jockey &amp; shield)</label>
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
          </div>
        </div>
      </div>

      <div class="sd-actions">
        <button class="sd-start-btn">Start Race</button>
        <a href="/" class="sd-back-link">Back</a>
      </div>
    </div>
  `;

  /** Wire one swatch row plus its hex box to a single colour. */
  const wire = (cls: string, hexId: string, set: (v: string) => void): void => {
    const apply = (color: string, btn?: Element): void => {
      set(color);
      host.querySelectorAll(`.sd-color-btn.${cls}`).forEach((b) => b.classList.remove('active'));
      btn?.classList.add('active');
      host.querySelector<HTMLInputElement>(`#${hexId}`)!.value = color;
      updatePreview();
    };
    host.querySelectorAll(`.sd-color-btn.${cls}`).forEach((btn) => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-color');
        if (color) apply(color, btn);
      });
    });
    host.querySelector<HTMLInputElement>(`#${hexId}`)!.addEventListener('change', (e) => {
      const color = (e.target as HTMLInputElement).value.trim();
      // Anything that is not a hex colour would tint the horse to NaN, so it is
      // simply ignored and the box keeps showing the value in force.
      if (/^#[0-9a-fA-F]{6}$/.test(color)) apply(color);
    });
  };

  // A coat is a PRESET here: it sets body, mane and points together the way the
  // gene does, and the two controls below can then be moved off it.
  host.querySelectorAll('.sd-coat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-coat');
      if (!id) return;
      selectedCoat = id;
      selectedHairColor = coatFor(id).hair;
      selectedPointColor = coatFor(id).points;
      host.querySelectorAll('.sd-coat-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      host.querySelector<HTMLSpanElement>('.sd-coat-name')!.textContent =
        COAT_COLORS.find((c) => c.id === id)?.name ?? id;
      for (const [cls, hexId, value] of [
        ['sd-hair', 'hair-hex', selectedHairColor],
        ['sd-points', 'points-hex', selectedPointColor],
      ] as const) {
        host.querySelector<HTMLInputElement>(`#${hexId}`)!.value = value;
        host.querySelectorAll(`.sd-color-btn.${cls}`).forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-color') === value);
        });
      }
      updatePreview();
    });
  });

  wire('sd-hair', 'hair-hex', (v) => { selectedHairColor = v; });
  wire('sd-points', 'points-hex', (v) => { selectedPointColor = v; });
  wire('sd-trim', 'trim-hex', (v) => { selectedTrimColor = v; });
  wire('sd-silks', 'silks-hex', (v) => { selectedSilksColor = v; });


  host.querySelector('.sd-start-btn')!.addEventListener('click', () => {
    sessionStorage.setItem(
      'color-override',
      JSON.stringify({
        coat: selectedCoat,
        hairColor: selectedHairColor,
        pointsColor: selectedPointColor,
        trimColor: selectedTrimColor,
        silksColor: selectedSilksColor,
      }),
    );
    window.location.href = '/';
  });

  loadSprites().then(() => updatePreview());
}
