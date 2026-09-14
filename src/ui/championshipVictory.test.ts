// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { Horse } from '../sim/types.js';
import { mountChampionshipVictory } from './championshipVictory.js';

const horse = (id: string, name: string): Horse => ({ id, name } as Horse);

describe('mountChampionshipVictory', () => {
  it('shows the race podium and routes each next-step choice', () => {
    const container = document.createElement('div');
    const onRetire = vi.fn();
    const onKeepRacing = vi.fn();
    const teardown = mountChampionshipVictory(
      container,
      horse('winner', 'North Star'),
      { primary: '#c69d37', secondary: '#1b293e' },
      onRetire,
      onKeepRacing,
      [
        { horse: horse('third', 'Third Place'), position: 3 },
        { horse: horse('winner', 'North Star'), position: 1 },
        { horse: horse('second', 'Second Place'), position: 2 },
      ],
    );

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('A champion is crowned');
    expect(Array.from(container.querySelectorAll('.championship-podium-name')).map((row) => row.textContent))
      .toEqual(['North Star', 'Second Place', 'Third Place']);

    container.querySelector<HTMLButtonElement>('#retire-btn')!.click();
    container.querySelector<HTMLButtonElement>('#keep-racing-btn')!.click();
    expect(onRetire).toHaveBeenCalledOnce();
    expect(onKeepRacing).toHaveBeenCalledOnce();

    teardown();
    expect(container.children).toHaveLength(0);
  });

  it('escapes a horse name before putting it into the card', () => {
    const container = document.createElement('div');
    mountChampionshipVictory(container, horse('winner', '<strong>Not markup</strong>'));

    expect(container.querySelectorAll('strong')).toHaveLength(1);
    expect(container.textContent).toContain('<strong>Not markup</strong>');
  });
});
