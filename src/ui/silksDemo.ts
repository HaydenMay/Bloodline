import { getBadgeDataUri } from '../render/shieldBadge.js';

const COAT_COLORS = [
  { id: 'bay', name: 'Bay' },
  { id: 'chestnut', name: 'Chestnut' },
  { id: 'palomino', name: 'Palomino' },
  { id: 'grey', name: 'Grey' },
  { id: 'black', name: 'Black' },
] as const;

const DEMO_COLORS = [
  { hex: '#F2C14E', name: 'Gold' },
  { hex: '#E63946', name: 'Red' },
  { hex: '#457B9D', name: 'Blue' },
  { hex: '#1D3557', name: 'Navy' },
  { hex: '#A8DADC', name: 'Light Blue' },
  { hex: '#F1FAEE', name: 'Cream' },
  { hex: '#2A9D8F', name: 'Teal' },
  { hex: '#E76F51', name: 'Orange' },
  { hex: '#9D4EDD', name: 'Purple' },
  { hex: '#3A86FF', name: 'Bright Blue' },
] as const;

export function mountSilksDemo(host: HTMLElement): void {
  let selectedCoat = 'palomino';
  let selectedManeColor = '#1a1a1a';
  let selectedSilksColor = '#A8DADC';

  const updateBadge = async () => {
    const badgeImg = host.querySelector<HTMLImageElement>('.sd-badge');
    if (badgeImg) {
      const uri = await getBadgeDataUri({
        coat: selectedCoat,
        silks: { primary: selectedSilksColor, secondary: selectedManeColor },
      });
      if (uri) {
        badgeImg.src = uri;
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
          ${DEMO_COLORS.map(
            (color) =>
              `<button
                class="sd-color-btn sd-mane ${color.hex === selectedManeColor ? 'active' : ''}"
                data-color="${color.hex}"
                title="${color.name}"
                style="background: ${color.hex}"
              ></button>`,
          ).join('')}
        </div>
        <input type="text" class="sd-hex-input" id="mane-hex" value="${selectedManeColor}" placeholder="#1a1a1a" />
      </div>

      <div class="sd-section">
        <label>3. Silks Color (Jockey & Shield Outline)</label>
        <div class="sd-colors">
          ${DEMO_COLORS.map(
            (color) =>
              `<button
                class="sd-color-btn sd-silks ${color.hex === selectedSilksColor ? 'active' : ''}"
                data-color="${color.hex}"
                title="${color.name}"
                style="background: ${color.hex}"
              ></button>`,
          ).join('')}
        </div>
        <input type="text" class="sd-hex-input" id="silks-hex" value="${selectedSilksColor}" placeholder="#A8DADC" />
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
        updateBadge();
      }
    });
  });

  // Mane color selection
  host.querySelectorAll('.sd-color-btn.sd-mane').forEach((btn) => {
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
        updateBadge();
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
        updateBadge();
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
      updateBadge();
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
      updateBadge();
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

  // Initial badge render
  updateBadge();
}
