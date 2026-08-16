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

/** Reputation was a second lifetime counter; stable prestige is the only gate now. */
describe('dropping reputation', () => {
  it('strips it from a save written while it still existed', () => {
    const old = { ...createStable('Ashford Park', 'seed-1234'), reputation: 42 };
    const migrated = migrate(old, 2) as Record<string, unknown>;
    expect(migrated.reputation).toBeUndefined();
    expect(migrated.cash).toBe(old.cash);
    expect(migrated.stableName).toBe('Ashford Park');
  });

  it('leaves a save that never had it alone', () => {
    const fresh = createStable('Ashford Park', 'seed-1234');
    expect(migrate(fresh, 2)).toEqual(fresh);
  });
});

describe('export / import round-trip', () => {
  it('survives a round trip intact', () => {
    const original = createStable('Ashford Park', 'seed-1234');
    original.cash = 5000;

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
