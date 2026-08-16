// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildBundle,
  clearSlot,
  parseBundle,
  readSlot,
  slotsFor,
  writeSlot,
} from './durability.js';

interface Yard {
  cash: number;
  barn: number;
}

const KEY = 'test_slot';
const slots = slotsFor(KEY);
const valid = (v: unknown): boolean =>
  !!v && typeof v === 'object' && typeof (v as Yard).cash === 'number';

const write = (data: Yard): void => writeSlot(KEY, data, 1, valid);
const read = () => readSlot<Yard>(KEY, valid);

beforeEach(() => localStorage.clear());

describe('rolling backup', () => {
  it('reads back what was written', () => {
    write({ cash: 100, barn: 1 });
    const out = read();
    expect(out.status).toBe('ok');
    expect(out.status === 'ok' && out.data.cash).toBe(100);
  });

  it('reports an untouched slot as empty rather than failing', () => {
    expect(read().status).toBe('empty');
  });

  it('keeps the previous value as a backup on each write', () => {
    write({ cash: 100, barn: 1 });
    write({ cash: 200, barn: 2 });
    const backup = JSON.parse(localStorage.getItem(slots.backup)!);
    expect(backup.data.cash).toBe(100);
  });

  /** One bad write must not be able to destroy the last good copy. */
  it('never rotates an unreadable value into the backup', () => {
    write({ cash: 100, barn: 1 });
    write({ cash: 200, barn: 2 });
    localStorage.setItem(slots.primary, '{ corrupt');
    write({ cash: 300, barn: 3 });

    const backup = JSON.parse(localStorage.getItem(slots.backup)!);
    expect(backup.data.cash).toBe(100);
  });

  /**
   * Without this the very first save is a single point of failure: nothing has
   * been rotated yet, so corrupting it leaves nothing to fall back on.
   */
  it('leaves a readable backup even after the very first write', () => {
    write({ cash: 100, barn: 1 });
    const backup = JSON.parse(localStorage.getItem(slots.backup)!);
    expect(backup.data.cash).toBe(100);

    localStorage.setItem(slots.primary, 'corrupted before a second save ever happened');
    const out = read();
    expect(out.status).toBe('recovered');
    expect(out.status === 'recovered' && out.data.cash).toBe(100);
  });
});

describe('recovering a damaged save', () => {
  it('falls back to the backup when the primary will not parse', () => {
    write({ cash: 100, barn: 1 });
    write({ cash: 200, barn: 2 });
    localStorage.setItem(slots.primary, 'not json at all');

    const out = read();
    expect(out.status).toBe('recovered');
    expect(out.status === 'recovered' && out.data.cash).toBe(100);
  });

  it('falls back when the primary parses but is the wrong shape', () => {
    write({ cash: 100, barn: 1 });
    write({ cash: 200, barn: 2 });
    localStorage.setItem(slots.primary, JSON.stringify({ version: 1, data: { nonsense: true } }));
    expect(read().status).toBe('recovered');
  });

  it('heals the primary so the next read is clean', () => {
    write({ cash: 100, barn: 1 });
    write({ cash: 200, barn: 2 });
    localStorage.setItem(slots.primary, 'broken');

    expect(read().status).toBe('recovered');
    expect(read().status).toBe('ok');
  });

  it('quarantines the damaged copy instead of discarding it', () => {
    write({ cash: 100, barn: 1 });
    localStorage.setItem(slots.primary, 'the broken bytes');
    read();
    expect(localStorage.getItem(slots.quarantine)).toBe('the broken bytes');
  });

  it('restores from the backup when the primary is deleted outright', () => {
    write({ cash: 100, barn: 1 });
    write({ cash: 200, barn: 2 });
    localStorage.removeItem(slots.primary);

    const out = read();
    expect(out.status).toBe('recovered');
    expect(out.status === 'recovered' && out.data.cash).toBe(100);
  });

  it('writes a recovered value back, so the backup is never the only copy left', () => {
    write({ cash: 100, barn: 1 });
    write({ cash: 200, barn: 2 });
    localStorage.removeItem(slots.primary);

    read();
    expect(localStorage.getItem(slots.primary)).not.toBeNull();
    expect(read().status).toBe('ok');
  });

  it('reports unreadable — never empty — when there is no backup to fall back on', () => {
    // Reporting "empty" here is what would let the game start a fresh yard
    // over the top of a save that is damaged but still on disk.
    localStorage.setItem(slots.primary, 'garbage');
    const out = read();
    expect(out.status).toBe('unreadable');
    expect(localStorage.getItem(slots.quarantine)).toBe('garbage');
  });

  /** A deliberate clear must stay cleared, or retiring a horse would undo itself. */
  it('clears both copies so a deliberate deletion cannot be undone by the backup', () => {
    write({ cash: 100, barn: 1 });
    write({ cash: 200, barn: 2 });
    clearSlot(KEY);
    expect(read().status).toBe('empty');
    expect(localStorage.getItem(slots.backup)).toBeNull();
  });

  it('can keep the backup when the absence might be accidental', () => {
    write({ cash: 100, barn: 1 });
    write({ cash: 200, barn: 2 });
    clearSlot(KEY, { keepBackup: true });
    expect(read().status).toBe('recovered');
  });
});

describe('export bundles', () => {
  it('round-trips a save', () => {
    const bundle = buildBundle({ horse: 'x' }, { cash: 50 });
    const parsed = parseBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.bundle.stable).toEqual({ cash: 50 });
  });

  it('rejects text that is not JSON', () => {
    const parsed = parseBundle('nope');
    expect(parsed).toEqual({ ok: false, error: 'That file is not valid JSON.' });
  });

  it("rejects JSON that isn't a Bloodline save", () => {
    const parsed = parseBundle(JSON.stringify({ some: 'other file' }));
    expect(parsed.ok).toBe(false);
  });

  it('rejects a save from a newer version rather than mangling it', () => {
    const bundle = { ...buildBundle(null, { cash: 1 }), version: 99 };
    const parsed = parseBundle(JSON.stringify(bundle));
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.error).toMatch(/newer version/);
  });

  it('rejects an empty bundle', () => {
    const parsed = parseBundle(JSON.stringify(buildBundle(null, null)));
    expect(parsed.ok).toBe(false);
  });
});
