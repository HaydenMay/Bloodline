import { CURRENT_VERSION } from './schema.js';

/**
 * Forward-only migrations, applied one version at a time.
 *
 * A migration at key N upgrades data from version N to version N+1. To add one:
 *   1. bump CURRENT_VERSION in schema.ts
 *   2. add the matching entry here
 *   3. add a test in migrations.test.ts using a realistic old save
 *
 * Migrations must be pure and must never throw on well-formed older data.
 */
type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

const migrations: Record<number, Migration> = {
  1: (data) => ({
    ...data,
    settings: {
      ...(data.settings as Record<string, unknown>),
      autopilotEnabled: false,
    },
  }),
  /**
   * Reputation is gone. It gated staff levels and the supplies catalogue, which
   * stable prestige now does on its own — the two were separate lifetime
   * counters earned from the same race results.
   */
  2: (data) => {
    const next = { ...data };
    delete next.reputation;
    return next;
  },
  /** The 2D/3D race view choice, added with the Three.js renderer. */
  3: (data) => ({
    ...data,
    settings: {
      ...(data.settings as Record<string, unknown>),
      raceView: '2d',
    },
  }),
};

export class SaveTooNewError extends Error {
  constructor(found: number) {
    super(
      `Save is version ${found} but this build only understands ${CURRENT_VERSION}. ` +
        'It was probably written by a newer version of the game.',
    );
    this.name = 'SaveTooNewError';
  }
}

export class SaveMigrationError extends Error {
  constructor(from: number, cause: unknown) {
    super(`Failed migrating save from version ${from}: ${String(cause)}`);
    this.name = 'SaveMigrationError';
  }
}

/**
 * Walks `data` forward from `fromVersion` to CURRENT_VERSION.
 * Throws SaveTooNewError if the save came from a future build.
 */
export function migrate(data: unknown, fromVersion: number): unknown {
  if (fromVersion > CURRENT_VERSION) throw new SaveTooNewError(fromVersion);
  if (fromVersion === CURRENT_VERSION) return data;

  let current = data as Record<string, unknown>;

  for (let v = fromVersion; v < CURRENT_VERSION; v++) {
    const step = migrations[v];
    if (!step) {
      throw new SaveMigrationError(v, `no migration registered for version ${v}`);
    }
    try {
      current = step(current);
    } catch (cause) {
      throw new SaveMigrationError(v, cause);
    }
  }

  return current;
}
