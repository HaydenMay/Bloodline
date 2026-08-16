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
];

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
