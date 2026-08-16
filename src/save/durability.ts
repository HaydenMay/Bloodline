/**
 * Keeping a stable alive.
 *
 * The stable is meant to outlive every horse in it, which makes it the one
 * record the game cannot afford to lose. localStorage gives no such guarantee:
 * a half-finished write, a browser cleanup, a stray edit in devtools, and the
 * only copy is gone.
 *
 * Three defences, in order of how often they matter:
 *   1. a rolling backup, so one bad write is not fatal
 *   2. quarantine instead of deletion, so nothing unreadable is ever discarded
 *   3. export and import, so the player can hold their own copy
 *
 * None of this makes localStorage durable. It makes losing everything take
 * more than one accident.
 */

export interface StoredEnvelope<T> {
  version: number;
  data: T;
}

export type LoadOutcome<T> =
  | { status: 'ok'; data: T }
  | { status: 'recovered'; data: T; reason: string }
  | { status: 'empty' }
  | { status: 'unreadable'; reason: string };

export interface SlotNames {
  primary: string;
  backup: string;
  quarantine: string;
}

export function slotsFor(key: string): SlotNames {
  return { primary: key, backup: `${key}__backup`, quarantine: `${key}__corrupt` };
}

function readEnvelope<T>(
  raw: string | null,
  isValid: (value: unknown) => boolean,
): T | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredEnvelope<T>;
    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) return null;
    return isValid(parsed.data) ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Writes `data`, keeping the value it replaces as a backup.
 *
 * The backup is only rotated when the outgoing value was itself readable, so a
 * corrupt write can never overwrite the last good copy.
 */
export function writeSlot<T>(
  key: string,
  data: T,
  version: number,
  isValid: (value: unknown) => boolean,
): void {
  const slots = slotsFor(key);
  const envelope = JSON.stringify({ version, data });

  try {
    const outgoing = localStorage.getItem(slots.primary);
    const outgoingIsGood = outgoing !== null && readEnvelope<T>(outgoing, isValid) !== null;

    if (outgoingIsGood) {
      localStorage.setItem(slots.backup, outgoing);
    } else if (readEnvelope<T>(localStorage.getItem(slots.backup), isValid) === null) {
      // The outgoing value is unusable and there is no backup worth keeping.
      // Seed the backup with what we are about to write, so that after any
      // successful save there are always two readable copies — otherwise the
      // very first write leaves a single point of failure.
      localStorage.setItem(slots.backup, envelope);
    }

    localStorage.setItem(slots.primary, envelope);
  } catch (error) {
    console.error(`Failed to save ${key}:`, error);
  }
}

/**
 * Reads a slot, falling back to the backup when the primary is unreadable.
 *
 * An unreadable primary is moved aside rather than deleted, so a player who
 * hits this can still be helped to recover it by hand.
 */
export function readSlot<T>(
  key: string,
  isValid: (value: unknown) => boolean,
): LoadOutcome<T> {
  const slots = slotsFor(key);

  let primaryRaw: string | null;
  try {
    primaryRaw = localStorage.getItem(slots.primary);
  } catch (error) {
    return { status: 'unreadable', reason: String(error) };
  }

  const primary = readEnvelope<T>(primaryRaw, isValid);
  if (primary !== null) return { status: 'ok', data: primary };

  const backup = readEnvelope<T>(localStorage.getItem(slots.backup), isValid);

  if (primaryRaw && backup !== null) {
    // Keep the damaged copy rather than dropping it, then heal the primary.
    try {
      localStorage.setItem(slots.quarantine, primaryRaw);
      localStorage.setItem(slots.primary, JSON.stringify({ version: 1, data: backup }));
    } catch (error) {
      console.error('Failed to quarantine corrupt save:', error);
    }
    return {
      status: 'recovered',
      data: backup,
      reason: 'The most recent save could not be read, so the previous one was restored.',
    };
  }

  if (primaryRaw) {
    try {
      localStorage.setItem(slots.quarantine, primaryRaw);
    } catch (error) {
      console.error('Failed to quarantine corrupt save:', error);
    }
    return {
      status: 'unreadable',
      reason: 'The save could not be read and there was no backup to fall back on.',
    };
  }

  if (backup !== null) {
    // Put it back straight away rather than leaving the backup as the only
    // copy — otherwise a player who quits here is one more deletion from
    // having nothing at all.
    try {
      localStorage.setItem(slots.primary, JSON.stringify({ version: 1, data: backup }));
    } catch (error) {
      console.error('Failed to restore save from backup:', error);
    }
    return {
      status: 'recovered',
      data: backup,
      reason: 'The save was missing, so the backup was restored.',
    };
  }

  return { status: 'empty' };
}

/**
 * Clears a slot.
 *
 * Both copies go by default: an absence the game asked for must stay absent,
 * or the backup would quietly resurrect a career the player deliberately
 * ended. Pass `keepBackup` only where the absence might be accidental.
 */
export function clearSlot(key: string, options: { keepBackup?: boolean } = {}): void {
  const slots = slotsFor(key);
  try {
    localStorage.removeItem(slots.primary);
    if (!options.keepBackup) localStorage.removeItem(slots.backup);
  } catch (error) {
    console.error(`Failed to clear ${key}:`, error);
  }
}

/* ---------------------------------------------------------------------------
   Export and import
   ------------------------------------------------------------------------ */

export const SAVE_FILE_FORMAT = 'bloodline-save';
export const SAVE_FILE_VERSION = 1;

export interface SaveBundle {
  format: string;
  version: number;
  exportedAt: string;
  career: unknown | null;
  stable: unknown | null;
}

export function buildBundle(career: unknown | null, stable: unknown | null): SaveBundle {
  return {
    format: SAVE_FILE_FORMAT,
    version: SAVE_FILE_VERSION,
    exportedAt: new Date().toISOString(),
    career,
    stable,
  };
}

export type BundleParse =
  | { ok: true; bundle: SaveBundle }
  | { ok: false; error: string };

export function parseBundle(text: string): BundleParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'That file does not contain a save.' };
  }

  const bundle = parsed as SaveBundle;
  if (bundle.format !== SAVE_FILE_FORMAT) {
    return { ok: false, error: 'That file is not a Bloodline save.' };
  }
  if (typeof bundle.version !== 'number' || bundle.version > SAVE_FILE_VERSION) {
    return {
      ok: false,
      error: 'That save was made by a newer version of the game.',
    };
  }
  if (!bundle.stable && !bundle.career) {
    return { ok: false, error: 'That save is empty.' };
  }

  return { ok: true, bundle };
}

/** A filename that sorts by date and says what it is. */
export function saveFileName(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `bloodline-${stamp}.json`;
}
