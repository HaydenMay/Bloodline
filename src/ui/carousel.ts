/**
 * Generic carousel component for stepping through a list of items.
 *
 * Handles navigation (arrows, dots), counter, and rendering logic.
 * Caller provides renderItem callback to display each item's content.
 */

export interface CarouselConfig<T> {
  /** Items to cycle through. */
  items: T[];
  /** Render function for each item. Returns the HTML to display. */
  renderItem: (item: T, index: number) => HTMLElement | string;
  /** Called when user selects an item (via button or action). Optional. */
  onSelect?: (item: T, index: number) => void;
  /** Show item counter (e.g., "3 / 7"). Default: true. */
  showCounter?: boolean;
  /** Show dot indicators at bottom. Default: true. */
  showDots?: boolean;
  /** Show arrow buttons. Default: true. */
  showArrows?: boolean;
  /** Header title. Optional. */
  title?: string;
  /** Button label for selection. Default: "Select". */
  selectLabel?: string;
  /** CSS class for the root container. Default: "carousel". */
  className?: string;
  /** CSS class prefix for inner elements (e.g., "sc" → .sc-header, .sc-counter). Default: uses className. */
  cssPrefix?: string;
}

export interface CarouselState<T> {
  currentIndex: number;
  items: T[];
  goTo: (index: number) => void;
  next: () => void;
  prev: () => void;
}

export function mountCarousel<T>(
  host: HTMLElement,
  config: CarouselConfig<T>,
): { teardown: () => void; state: CarouselState<T> } {
  alert(`mountCarousel called with selectLabel: ${config.selectLabel || 'undefined'}`);
  const {
    items,
    renderItem,
    onSelect,
    showCounter = true,
    showDots = true,
    showArrows = true,
    title,
    selectLabel = 'Select',
    className = 'carousel',
    cssPrefix = className.split('-')[0],
  } = config;

  if (items.length === 0) {
    const msg = `Carousel: no items provided (className: ${className})`;
    console.error(msg);
    const errorDiv = document.createElement('div');
    errorDiv.style.padding = '20px';
    errorDiv.style.color = '#ff6b6b';
    errorDiv.textContent = 'Error: No items to display in carousel';
    host.appendChild(errorDiv);
    return {
      teardown: () => { errorDiv.remove(); },
      state: {
        currentIndex: 0,
        items: [],
        goTo: () => {},
        next: () => {},
        prev: () => {},
      },
    };
  }

  const root = document.createElement('div');
  root.className = className;

  let currentIndex = 0;

  // Build structure
  if (title || showCounter) {
    const header = document.createElement('div');
    header.className = `${cssPrefix}-header`;
    header.innerHTML = title ? `<h2>${title}</h2>` : '';
    if (showCounter) {
      const counter = document.createElement('span');
      counter.className = `${cssPrefix}-counter`;
      counter.id = `${cssPrefix}-counter`;
      header.appendChild(counter);
    }
    root.appendChild(header);
  }

  const stage = document.createElement('div');
  stage.className = `${cssPrefix}-stage`;

  if (showArrows) {
    const prevBtn = document.createElement('button');
    prevBtn.className = `${cssPrefix}-arrow ${cssPrefix}-arrow-prev`;
    prevBtn.id = `${cssPrefix}-prev`;
    prevBtn.setAttribute('aria-label', 'Previous item');
    prevBtn.textContent = '‹';
    stage.appendChild(prevBtn);
  }

  const content = document.createElement('div');
  content.className = `${cssPrefix}-content`;
  content.id = `${cssPrefix}-content`;
  stage.appendChild(content);

  if (showArrows) {
    const nextBtn = document.createElement('button');
    nextBtn.className = `${cssPrefix}-arrow ${cssPrefix}-arrow-next`;
    nextBtn.id = `${cssPrefix}-next`;
    nextBtn.setAttribute('aria-label', 'Next item');
    nextBtn.textContent = '›';
    stage.appendChild(nextBtn);
  }

  root.appendChild(stage);

  if (showDots) {
    const dots = document.createElement('div');
    dots.className = `${cssPrefix}-dots`;
    dots.id = `${cssPrefix}-dots`;
    root.appendChild(dots);
  }

  const selectBtn = document.createElement('button');
  selectBtn.className = `btn btn-primary ${cssPrefix}-select`;
  selectBtn.id = `${cssPrefix}-select`;
  selectBtn.textContent = selectLabel;
  root.appendChild(selectBtn);
  alert(`Select button created: ${selectLabel}`);

  host.appendChild(root);

  // Helper function to normalize index
  const normalizeIndex = (i: number): number => {
    return ((i % items.length) + items.length) % items.length;
  };

  // Render functions
  const renderDots = (): void => {
    const dotsEl = root.querySelector<HTMLDivElement>(`#${cssPrefix}-dots`);
    if (!dotsEl) return;

    dotsEl.innerHTML = items
      .map(
        (_, i) =>
          `<button class="${cssPrefix}-dot ${i === currentIndex ? 'is-active' : ''}" data-i="${i}" aria-label="Item ${i + 1}"></button>`,
      )
      .join('');

    dotsEl.querySelectorAll<HTMLButtonElement>(`.${cssPrefix}-dot`).forEach((dot) => {
      dot.addEventListener('click', () => goTo(Number(dot.dataset.i)));
    });
  };

  const renderContent = (): void => {
    const contentEl = root.querySelector<HTMLDivElement>(`#${cssPrefix}-content`);
    if (!contentEl) return;

    contentEl.innerHTML = '';
    const item = items[currentIndex]!;
    const rendered = renderItem(item, currentIndex);
    if (typeof rendered === 'string') {
      contentEl.innerHTML = rendered;
    } else {
      contentEl.appendChild(rendered);
    }
  };

  const renderCounter = (): void => {
    const counterEl = root.querySelector<HTMLSpanElement>(`#${cssPrefix}-counter`);
    if (counterEl) {
      counterEl.textContent = `${currentIndex + 1} / ${items.length}`;
    }
  };

  const render = (): void => {
    renderCounter();
    renderContent();
    renderDots();
  };

  // Navigation
  const goTo = (i: number): void => {
    currentIndex = normalizeIndex(i);
    render();
  };

  const next = (): void => goTo(currentIndex + 1);
  const prev = (): void => goTo(currentIndex - 1);

  // Event listeners
  const prevBtn = root.querySelector<HTMLButtonElement>(`#${cssPrefix}-prev`);
  if (prevBtn) prevBtn.addEventListener('click', prev);

  const nextBtn = root.querySelector<HTMLButtonElement>(`#${cssPrefix}-next`);
  if (nextBtn) nextBtn.addEventListener('click', next);

  selectBtn.addEventListener('click', () => {
    try {
      alert('1. Button clicked');
      const hasOnSelect = !!onSelect;
      alert('2. Checked onSelect');
      alert(`3. onSelect is: ${hasOnSelect}`);
      if (onSelect) {
        alert('4. About to call onSelect');
        alert(`4b. onSelect type: ${typeof onSelect}`);
        const result = onSelect(items[currentIndex]!, currentIndex);
        alert(`5. onSelect returned: ${typeof result}`);
        alert('6. onSelect call completed');
      } else {
        alert('ERROR: onSelect is undefined!');
      }
    } catch (e) {
      alert(`CATCH: ${e}`);
    }
  });

  // Initial render
  render();

  // Cleanup
  const teardown = (): void => {
    root.remove();
  };

  // Return state for external access if needed
  const state: CarouselState<T> = {
    currentIndex,
    items,
    goTo,
    next,
    prev,
  };

  return { teardown, state };
}
