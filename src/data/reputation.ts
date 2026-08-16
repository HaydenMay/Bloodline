import { CONSUMABLES } from './consumables.js';
import { MAX_STAFF_LEVEL, STAFF, getReputationRequired, type StaffRoster } from './staff.js';

/**
 * What reputation is actually for.
 *
 * Cash is what you spend; reputation is what you are allowed to spend it on
 * (§11). It is the harder of the two walls, which makes it the more confusing
 * number to show without a reason attached — a bare "Reputation 0" in the hub
 * says nothing about why a player should want more of it.
 *
 * Everything that reputation gates lives in two places, staff levels and the
 * supplies catalogue, so this resolves the next wall across both.
 */
export interface ReputationUnlock {
  /** Reputation needed. */
  at: number;
  /** What it opens up, phrased for a one-line caption. */
  what: string;
}

export function getNextReputationUnlock(
  reputation: number,
  staff: StaffRoster,
): ReputationUnlock | null {
  const candidates: ReputationUnlock[] = [];

  for (const role of ['trainer', 'jockey'] as const) {
    const nextLevel = (staff[role]?.level ?? 1) + 1;
    if (nextLevel > MAX_STAFF_LEVEL) continue;
    const at = getReputationRequired(nextLevel);
    if (at > reputation) candidates.push({ at, what: `${STAFF[role].name} level ${nextLevel}` });
  }

  for (const item of Object.values(CONSUMABLES)) {
    if (item.reputationRequired > reputation) {
      candidates.push({ at: item.reputationRequired, what: item.name });
    }
  }

  if (candidates.length === 0) return null;

  // The nearest wall is the one worth naming — it is the next thing that
  // actually changes if the player goes and wins a race.
  return candidates.reduce((best, option) => (option.at < best.at ? option : best));
}
