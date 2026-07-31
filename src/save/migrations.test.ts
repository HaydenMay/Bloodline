import { describe, it, expect } from 'vitest';
import { migrate, SaveTooNewError } from './migrations.js';
import { CURRENT_VERSION, createStable } from './schema.js';
import { exportToString, importFromString } from './index.js';

describe('migrate', () => {
  it('passes current-version data through untouched', () => {
    const data = { seed: 'abc', cash: 100 };
    expect(migrate(data, CURRENT_VERSION)).toBe(data);
  });

  it('refuses a save from a newer build rather than corrupting it', () => {
    expect(() => migrate({}, CURRENT_VERSION + 1)).toThrow(SaveTooNewError);
  });

  it('throws a clear error when a migration step is missing', () => {
    // Only meaningful once CURRENT_VERSION > 1; guards the gap-detection path.
    if (CURRENT_VERSION > 1) {
      expect(() => migrate({}, -1)).toThrow();
    }
  });
});

describe('export / import round-trip', () => {
  it('survives a round trip intact', () => {
    const original = createStable('Ashford Park', 'seed-1234');
    original.cash = 5000;
    original.reputation = 42;

    const restored = importFromString(exportToString(original));

    expect(restored).toEqual(original);
  });

  it('rejects a file that is not a save', () => {
    expect(() => importFromString('{"hello":"world"}')).toThrow(/missing version/i);
  });

  it('rejects malformed JSON', () => {
    expect(() => importFromString('not json at all')).toThrow();
  });
});
