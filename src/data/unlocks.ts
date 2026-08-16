import { CONSUMABLES } from './consumables.js';
import { MAX_STAFF_LEVEL, STAFF, getPrestigeRequired, type StaffRoster } from './staff.js';

/**
 * What the yard's prestige is about to buy it.
 *
 * The stable hub used to show three bare integers — cash, reputation and
 * prestige — with nothing to say what any of them were for, and two of them
 * measuring the same thing. Reputation is gone; prestige is the single gate,
 * and the hub names the next thing it opens so it reads as a target rather than
 * a mystery number.
 *
 * Everything prestige gates lives in three places — facility tiers, staff
 * levels and the supplies catalogue — and facility tiers already announce
 * themselves on the facilities screen, so this resolves the other two.
 */
export interface PrestigeUnlock {
  /** Prestige needed. */
  at: number;
  /** What it opens up, phrased for a one-line caption. */
  what: string;
}

export function getNextPrestigeUnlock(
  prestige: number,
  staff: StaffRoster,
): PrestigeUnlock | null {
  const candidates: PrestigeUnlock[] = [];

  for (const role of ['trainer', 'jockey'] as const) {
    // Scan up the ladder rather than checking only the very next level. A yard
    // whose next promotion is already affordable still has walls above it, and
    // stopping at level + 1 reported "everything unlocked" to a level-1 trainer
    // with four locked levels ahead of it.
    for (let level = (staff[role]?.level ?? 1) + 1; level <= MAX_STAFF_LEVEL; level++) {
      const at = getPrestigeRequired(level);
      if (at > prestige) {
        candidates.push({ at, what: `${STAFF[role].name} level ${level}` });
        break;
      }
    }
  }

  for (const item of Object.values(CONSUMABLES)) {
    if (item.prestigeRequired > prestige) {
      candidates.push({ at: item.prestigeRequired, what: item.name });
    }
  }

  if (candidates.length === 0) return null;

  // The nearest wall is the one worth naming — it is the next thing that
  // actually changes if the player goes and wins a race.
  return candidates.reduce((best, option) => (option.at < best.at ? option : best));
}
