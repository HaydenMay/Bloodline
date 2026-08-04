import { getBadgeDataUri } from '../render/shieldBadge.js';

const COAT_COLORS = [
  { id: 'bay', name: 'Bay' },
  { id: 'chestnut', name: 'Chestnut' },
  { id: 'palomino', name: 'Palomino' },
  { id: 'grey', name: 'Grey' },
  { id: 'black', name: 'Black' },
] as const;

const DEMO_SILKS_COLORS = [
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
  let selectedCoat = 'bay';
  let selectedPrimary = '#F2C14E';
  let selectedSecondary = '#12222B';

  const updateBadge = async () => {
    const badgeImg = host.querySelector<HTMLImageElement>('.sd-badge');
    if (badgeImg) {
      const uri = await getBadgeDataUri({
        coat: selectedCoat,
        silks: { primary: selectedPrimary, secondary: selectedSecondary },
      });
      if (uri) {
        badgeImg.src = uri;
      }
    }
  };

  host.innerHTML = `
    <div class="silks-demo">
      <h2>Silks Demo</h2>
      <p>Select coat and silks colors, then start a race to see the badge in action.</p>

      <div class="sd-section">
        <label>Coat Color</label>
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
        <label>Primary Silks Color</label>
        <div class="sd-colors">
          ${DEMO_SILKS_COLORS.map(
            (color) =>
              `<button
                class="sd-color-btn ${color.hex === selectedPrimary ? 'active' : ''}"
                data-color="${color.hex}"
                title="${color.name}"
                style="background: ${color.hex}"
              ></button>`,
          ).join('')}
        </div>
        <input type="text" class="sd-hex-input" id="primary-hex" value="${selectedPrimary}" />
      </div>

      <div class="sd-section">
        <label>Secondary Silks Color</label>
        <div class="sd-colors">
          ${DEMO_SILKS_COLORS.map(
            (color) =>
              `<button
                class="sd-color-btn sd-secondary ${color.hex === selectedSecondary ? 'active' : ''}"
                data-color="${color.hex}"
                title="${color.name}"
                style="background: ${color.hex}"
              ></button>`,
          ).join('')}
        </div>
        <input type="text" class="sd-hex-input" id="secondary-hex" value="${selectedSecondary}" />
      </div>

      <div class="sd-preview">
        <p>Preview</p>
        <img class="sd-badge" src="" alt="Badge preview" />
        <div class="sd-info">
          <span class="sd-coat-name">${COAT_COLORS.find((c) => c.id === selectedCoat)?.name}</span>
          <div class="sd-silks-preview">
            <span class="sd-silks-swatch" style="background: ${selectedPrimary}"></span>
            <span class="sd-silks-swatch" style="background: ${selectedSecondary}"></span>
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

  // Primary color selection
  host.querySelectorAll('.sd-color-btn:not(.sd-secondary)').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const color = (e.target as HTMLElement).getAttribute('data-color');
      if (color) {
        selectedPrimary = color;
        host.querySelectorAll('.sd-color-btn:not(.sd-secondary)').forEach((b) => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        host.querySelector<HTMLInputElement>('#primary-hex')!.value = color;
        host.querySelectorAll('.sd-silks-preview .sd-silks-swatch')[0]!.setAttribute('style', `background: ${color}`);
        updateBadge();
      }
    });
  });

  // Secondary color selection
  host.querySelectorAll('.sd-color-btn.sd-secondary').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const color = (e.target as HTMLElement).getAttribute('data-color');
      if (color) {
        selectedSecondary = color;
        host.querySelectorAll('.sd-color-btn.sd-secondary').forEach((b) => b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
        host.querySelector<HTMLInputElement>('#secondary-hex')!.value = color;
        host.querySelectorAll('.sd-silks-preview .sd-silks-swatch')[1]!.setAttribute('style', `background: ${color}`);
        updateBadge();
      }
    });
  });

  // Hex input updates
  host.querySelector<HTMLInputElement>('#primary-hex')!.addEventListener('change', (e) => {
    const hex = (e.target as HTMLInputElement).value;
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      selectedPrimary = hex;
      host.querySelectorAll('.sd-color-btn:not(.sd-secondary)').forEach((b) => b.classList.remove('active'));
      host.querySelectorAll('.sd-silks-preview .sd-silks-swatch')[0]!.setAttribute('style', `background: ${hex}`);
      updateBadge();
    }
  });

  host.querySelector<HTMLInputElement>('#secondary-hex')!.addEventListener('change', (e) => {
    const hex = (e.target as HTMLInputElement).value;
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      selectedSecondary = hex;
      host.querySelectorAll('.sd-color-btn.sd-secondary').forEach((b) => b.classList.remove('active'));
      host.querySelectorAll('.sd-silks-preview .sd-silks-swatch')[1]!.setAttribute('style', `background: ${hex}`);
      updateBadge();
    }
  });

  // Start race button
  host.querySelector('.sd-start-btn')!.addEventListener('click', () => {
    sessionStorage.setItem(
      'silks-override',
      JSON.stringify({
        primary: selectedPrimary,
        secondary: selectedSecondary,
      }),
    );
    window.location.href = '/';
  });

  // Initial badge render
  updateBadge();
}
