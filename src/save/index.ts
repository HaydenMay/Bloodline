import {
  CURRENT_VERSION,
  SLOT_COUNT,
  slotKey,
  type SaveEnvelope,
  type StableSave,
} from './schema.js';
import { migrate } from './migrations.js';

export * from './schema.js';
export { migrate, SaveTooNewError, SaveMigrationError } from './migrations.js';

export interface SlotInfo {
  slot: number;
  stableName: string;
  savedAt: string;
  cash: number;
}

const isBrowser = (): boolean => typeof localStorage !== 'undefined';

/** Reads and migrates a slot. Returns null if empty; throws if unreadable. */
export function load(slot: number): StableSave | null {
  if (!isBrowser()) return null;

  const raw = localStorage.getItem(slotKey(slot));
  if (!raw) return null;

  const envelope = JSON.parse(raw) as SaveEnvelope;
  const migrated = migrate(envelope.data, envelope.version);
  return migrated as StableSave;
}

export function save(slot: number, data: StableSave): void {
  if (!isBrowser()) return;

  const envelope: SaveEnvelope = {
    version: CURRENT_VERSION,
    savedAt: new Date().toISOString(),
    data,
  };
  localStorage.setItem(slotKey(slot), JSON.stringify(envelope));
}

export function clearSlot(slot: number): void {
  if (isBrowser()) localStorage.removeItem(slotKey(slot));
}

/** Summary of every slot, for the load menu. Unreadable slots are skipped. */
export function listSlots(): (SlotInfo | null)[] {
  return Array.from({ length: SLOT_COUNT }, (_, slot) => {
    try {
      const data = load(slot);
      if (!data) return null;
      const raw = localStorage.getItem(slotKey(slot));
      const envelope = raw ? (JSON.parse(raw) as SaveEnvelope) : null;
      return {
        slot,
        stableName: data.stableName,
        savedAt: envelope?.savedAt ?? '',
        cash: data.cash,
      };
    } catch {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// Export / import
//
// Insurance against browser storage being cleared without warning, and the
// PC <-> mobile transfer path. Multiple slots make a data loss worse, not
// better, so a save you can back up is not a feature — it's insurance.
// DESIGN.md §13.
// ---------------------------------------------------------------------------

export function exportToString(data: StableSave): string {
  const envelope: SaveEnvelope = {
    version: CURRENT_VERSION,
    savedAt: new Date().toISOString(),
    data,
  };
  return JSON.stringify(envelope, null, 2);
}

export function importFromString(text: string): StableSave {
  const envelope = JSON.parse(text) as SaveEnvelope;
  if (typeof envelope?.version !== 'number') {
    throw new Error('Not a Bloodline save file — missing version.');
  }
  return migrate(envelope.data, envelope.version) as StableSave;
}

export function downloadSave(data: StableSave): void {
  if (!isBrowser()) return;

  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = data.stableName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const blob = new Blob([exportToString(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `bloodline-${safeName}-${stamp}.json`;
  a.click();

  URL.revokeObjectURL(url);
}
