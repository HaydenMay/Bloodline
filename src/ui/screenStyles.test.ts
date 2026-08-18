import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * A guard against a class of mistake nothing else here catches.
 *
 * Editing a stylesheet by matching text can land an insertion *inside* a
 * multi-line selector list. That happened: a rule added before
 * `.raceday-container,\n.dossier-container {` was inserted into the middle of a
 * four-selector list, leaving `.staff-container, .consumables-container,
 * .raceday-screen[hidden] { display: none }`. Both the Staff and Supplies
 * screens rendered into the DOM and were completely invisible — every test
 * passed, because jsdom never applies the stylesheet.
 */
const css = readFileSync(fileURLToPath(new URL('../style.css', import.meta.url)), 'utf8');

/** Rules as [selector list, body] pairs, comments stripped. */
function rules(): Array<{ selector: string; body: string }> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Array<{ selector: string; body: string }> = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutComments)) !== null) {
    out.push({ selector: match[1]!.trim(), body: match[2]!.trim() });
  }
  return out;
}

/** The full-page screens a player navigates to from the hub. */
const CONTAINERS = [
  '.staff-container',
  '.consumables-container',
  '.raceday-container',
  '.dossier-container',
  '.breeding-container',
  '.archive-container',
];

/**
 * Elements toggled with the native `hidden` attribute rather than a state
 * class. Found live twice: `.archive-detail` and `.archive-toggle` set
 * `display: flex`, and later `.stat-rows` (shared by every stat block in the
 * game) set `display: flex` too — each shares specificity with the UA's
 * `[hidden] { display: none }`, and an author rule at equal specificity beats
 * the UA stylesheet regardless of `hidden` being set. The detail overlay kept
 * eating clicks while hidden; the attributes toggle on the Archive's detail
 * card stayed visibly open no matter what its button said. Each needed a
 * matching `<selector>[hidden] { display: none }` rule.
 */
const HIDDEN_TOGGLED = ['.archive-detail', '.archive-toggle', '.stat-rows'];

describe('elements toggled via the `hidden` attribute', () => {
  it('has a matching [hidden] override wherever the bare class sets display', () => {
    for (const selector of HIDDEN_TOGGLED) {
      const setsDisplay = rules().some(
        ({ selector: sel, body }) =>
          sel.split(',').some((s) => s.trim() === selector) && /display:/.test(body),
      );
      if (!setsDisplay) continue;

      const overridden = rules().some(
        ({ selector: sel, body }) =>
          sel.split(',').some((s) => s.trim() === `${selector}[hidden]`) &&
          /display:\s*none/.test(body),
      );
      expect(overridden, `${selector} sets display but has no ${selector}[hidden] { display: none }`).toBe(
        true,
      );
    }
  });
});

/**
 * Ghost-and-fill bar pairs — a wider ceiling bar behind, a narrower fill in
 * front showing the real value. Found live: `.ib-fill` (the info box's stat
 * bar, shown mid-race) used to be a bare, unclassed `<i>` with no `position`
 * set, while `.ib-ceiling` next to it was `position: absolute`. A positioned
 * element always paints above a static one regardless of DOM order, so the
 * ceiling — the horse's *potential* — covered the real stat bar outright.
 * Every stat on every horse read as its ceiling, not its current value, and
 * nothing here caught it because jsdom never renders paint order — only a
 * screenshot did. Both halves of a pair must be positioned the same way, or
 * one silently wins the paint order no matter which is "correct" on paper.
 */
const GHOST_FILL_PAIRS: Array<[ghost: string, fill: string]> = [
  ['.ib-ceiling', '.ib-fill'],
  ['.stat-row-ceiling', '.stat-row-fill'],
];

describe('ghost-and-fill bar pairs', () => {
  it('positions both halves the same way, so paint order cannot hide one behind the other', () => {
    const isPositioned = (selector: string): boolean =>
      rules().some(
        ({ selector: sel, body }) =>
          sel.split(',').some((s) => s.trim() === selector) && /position:\s*absolute/.test(body),
      );

    for (const [ghost, fill] of GHOST_FILL_PAIRS) {
      expect(isPositioned(ghost), `${ghost} is not position: absolute`).toBe(true);
      expect(isPositioned(fill), `${fill} is not position: absolute — it will paint behind ${ghost}`).toBe(
        true,
      );
    }
  });
});

describe('full-page screen containers', () => {
  it('is never hidden by an unconditional display:none', () => {
    for (const { selector, body } of rules()) {
      if (!/display:\s*none/.test(body)) continue;

      const hides = selector
        .split(',')
        .map((s) => s.trim())
        // A rule that only hides them behind [hidden] or a state class is fine;
        // it is the bare selector that blanks the screen.
        .filter((s) => CONTAINERS.includes(s));

      expect(hides, `"${selector}" hides ${hides.join(', ')} outright`).toEqual([]);
    }
  });

  it('still styles every one of them', () => {
    for (const container of CONTAINERS) {
      const styled = rules().some(({ selector }) =>
        selector.split(',').some((s) => s.trim() === container),
      );
      expect(styled, `${container} has no styles at all`).toBe(true);
    }
  });
});
