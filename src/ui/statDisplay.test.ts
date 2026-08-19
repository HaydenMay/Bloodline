// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { Horse } from '../sim/types.js';
import { STAT_KEYS } from '../sim/types.js';
import { attachStatReveal, getPotentialBand, renderStatRows } from './statDisplay.js';

function horse(overrides: Partial<Horse> = {}): Horse {
  return {
    id: 'h1',
    name: 'Test',
    gender: 'stallion',
    age: 3,
    stats: { speed: 50, stamina: 50, burst: 50, grit: 50, temper: 50, consistency: 50 },
    potential: { speed: 60, stamina: 95, burst: 51, grit: 80, temper: 70, consistency: 60 },
    style: 'stalker',
    moment: 'late',
    preferredDistance: { min: 1200, max: 1800 },
    traits: [],
    condition: 75,
    morale: 65,
    division: 'open',
    divisionLevel: 2,
    divisionPoints: 0,
    starts: 0,
    wins: 0,
    places: 0,
    shows: 0,
    coat: 'bay',
    jockeySkill: 60,
    ...overrides,
  };
}

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

describe('potential bands', () => {
  it('narrows as headroom shrinks', () => {
    expect(getPotentialBand(10, 90).id).toBe('untapped');
    expect(getPotentialBand(50, 85).id).toBe('plenty');
    expect(getPotentialBand(50, 70).id).toBe('some');
    expect(getPotentialBand(50, 55).id).toBe('close');
    expect(getPotentialBand(50, 50).id).toBe('maxed');
  });

  it('treats a stat within a point of its ceiling as finished', () => {
    expect(getPotentialBand(69, 70).id).toBe('maxed');
  });

  /** §2 masks the ceiling for the whole career — a band, never the figure. */
  it('never exposes the ceiling as a number', () => {
    const band = getPotentialBand(50, 87);
    expect(band.label).not.toMatch(/\d/);
  });

  /**
   * The ghost marker and the stat fill share one bar, so they must share one
   * scale. Reporting progress-toward-ceiling instead drew a stat of 50 with a
   * ceiling of 51 as though it had half the bar left to climb.
   */
  it('places the ceiling on the same 0-100 scale as the stat bar', () => {
    expect(getPotentialBand(50, 60).ceilingAt).toBe(60);
    expect(getPotentialBand(30, 95).ceilingAt).toBe(95);
  });

  it('leaves almost no gap when a stat is at its ceiling', () => {
    const band = getPotentialBand(50, 51);
    expect(band.id).toBe('maxed');
    expect(band.ceilingAt - 50).toBeLessThanOrEqual(1);
  });

  it('clamps a ceiling to the top of the scale', () => {
    expect(getPotentialBand(80, 130).ceilingAt).toBe(100);
  });
});

describe('stat rows', () => {
  it('renders every stat, not just the five the training screen used to show', () => {
    root.innerHTML = renderStatRows(horse());
    expect(root.querySelectorAll('.stat-row')).toHaveLength(STAT_KEYS.length);
    expect(root.textContent).toContain('Consistency');
  });

  /**
   * The bug this replaced: one band computed from `speed` and printed as if it
   * described the whole horse.
   */
  it('gives each stat its own band', () => {
    root.innerHTML = renderStatRows(horse());
    const rows = Array.from(root.querySelectorAll('.stat-row'));

    const speedRow = rows.find((r) => r.getAttribute('data-stat') === 'speed')!;
    const staminaRow = rows.find((r) => r.getAttribute('data-stat') === 'stamina')!;
    const burstRow = rows.find((r) => r.getAttribute('data-stat') === 'burst')!;

    // speed 50/60 is close; stamina 50/95 is barely touched; burst 50/51 is done.
    expect(speedRow.querySelector('.stat-row-room')!.textContent).toContain('close');
    expect(staminaRow.querySelector('.stat-row-room')!.textContent).toContain('barely');
    expect(burstRow.querySelector('.stat-row-room')!.textContent).toContain('ceiling');
    expect(speedRow.querySelector('.stat-row-room')!.textContent).not.toBe(
      staminaRow.querySelector('.stat-row-room')!.textContent,
    );
  });

  /**
   * Picking a starter or a yearling is a bet on the ceiling, not on the low
   * baby numbers every horse opens with — so the grade reads the potential,
   * and the current value only shows up once you tap for it.
   */
  it('leads with the potential grade, not the current one', () => {
    root.innerHTML = renderStatRows(
      horse({ potential: { ...horse().potential, speed: 92 } }),
    );
    const speedRow = root.querySelector('[data-stat="speed"]')!;
    expect(speedRow.querySelector('.stat-row-grade')!.textContent).toBe('X');
    expect(speedRow.querySelector('.stat-row-num')!.textContent).toBe('50');
  });

  it('falls back to the current grade when potential is hidden, for rivals', () => {
    root.innerHTML = renderStatRows(horse({ stats: { ...horse().stats, speed: 92 } }), {
      showPotential: false,
    });
    const speedRow = root.querySelector('[data-stat="speed"]')!;
    expect(speedRow.querySelector('.stat-row-grade')!.textContent).toBe('X');
  });

  it('omits potential entirely when asked, for rivals', () => {
    root.innerHTML = renderStatRows(horse(), { showPotential: false });
    expect(root.querySelector('.stat-row-room')).toBeNull();
    expect(root.querySelector('.stat-row-ceiling')).toBeNull();
  });

  it('describes each row for a screen reader', () => {
    root.innerHTML = renderStatRows(horse());
    const label = root.querySelector('[data-stat="stamina"]')!.getAttribute('aria-label');
    expect(label).toContain('Stamina');
    expect(label).toContain('grade');
  });
});

describe('tap to reveal, per §3', () => {
  it('hides numbers until tapped', () => {
    root.innerHTML = renderStatRows(horse());
    expect(root.querySelector('.stat-row.revealed')).toBeNull();

    attachStatReveal(root);
    (root.querySelector('.stat-row') as HTMLElement).click();

    expect(root.querySelectorAll('.stat-row.revealed')).toHaveLength(STAT_KEYS.length);
  });

  /** Tapping switches the whole readout, rather than inspecting one stat. */
  it('reveals every row from any one tap', () => {
    root.innerHTML = renderStatRows(horse());
    attachStatReveal(root);
    (root.querySelector('[data-stat="grit"]') as HTMLElement).click();
    expect(root.querySelectorAll('.stat-row.revealed')).toHaveLength(STAT_KEYS.length);
  });

  it('taps back to grades', () => {
    root.innerHTML = renderStatRows(horse());
    attachStatReveal(root);
    const row = root.querySelector('.stat-row') as HTMLElement;
    row.click();
    row.click();
    expect(root.querySelector('.stat-row.revealed')).toBeNull();
  });

  it('can open already revealed', () => {
    root.innerHTML = renderStatRows(horse(), { revealNumbers: true });
    expect(root.querySelectorAll('.stat-row.revealed')).toHaveLength(STAT_KEYS.length);
  });

  it('detaches cleanly', () => {
    root.innerHTML = renderStatRows(horse());
    const detach = attachStatReveal(root);
    detach();
    (root.querySelector('.stat-row') as HTMLElement).click();
    expect(root.querySelector('.stat-row.revealed')).toBeNull();
  });

  it('copes with no rows at all', () => {
    expect(() => attachStatReveal(root)()).not.toThrow();
  });
});
