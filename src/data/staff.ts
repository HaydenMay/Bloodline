/**
 * Trainer and jockey.
 *
 * Both level up with cash, but reputation is the ceiling: money alone cannot
 * buy a top jockey, because a good rider will not take the mount for a yard
 * nobody has heard of. That is the whole point of reputation as a second
 * currency — cash is what you spend, reputation is what you are allowed to
 * spend it on.
 */

export type StaffRole = 'trainer' | 'jockey';

export interface StaffMember {
  level: number; // 1-10
}

export interface StaffRoster {
  trainer: StaffMember;
  jockey: StaffMember;
}

export interface StaffDefinition {
  id: StaffRole;
  name: string;
  icon: string;
  /** What this role does for you, in plain terms. */
  description: string;
  /** Effect summary at a given level, for the UI. */
  effectLabel: (level: number) => string;
}

export const MAX_STAFF_LEVEL = 10;

export const STAFF: Record<StaffRole, StaffDefinition> = {
  trainer: {
    id: 'trainer',
    name: 'Head Trainer',
    icon: '🎓',
    description: 'Runs the gallops. A better trainer gets more out of every session.',
    effectLabel: (level) => `+${(getTrainerBonus(level) * 100).toFixed(0)}% from each training session`,
  },
  jockey: {
    id: 'jockey',
    name: 'Stable Jockey',
    icon: '🏇',
    description: 'Rides your horse on race day. Judgement of pace wins close finishes.',
    effectLabel: (level) => `Rides at ${getJockeySkill(level)} skill`,
  },
};

/**
 * Reputation ceiling per level. A level is only purchasable once the yard has
 * the standing for it, so early cash windfalls cannot skip the ladder.
 */
export function getReputationRequired(level: number): number {
  if (level <= 1) return 0;
  // 0, 0, 15, 40, 75, 120, 175, 240, 315, 400 — gentle at first, steep at the top.
  return Math.round(5 * (level - 1) * (level - 1) - 5 * (level - 1));
}

/** Cash price of moving from `level - 1` up to `level`. */
export function getStaffUpgradeCost(level: number): number {
  if (level <= 1) return 0;
  return Math.round(4000 * Math.pow(1.55, level - 2));
}

/** Training gains are multiplied by 1 + this. Level 1 is neutral. */
export function getTrainerBonus(level: number): number {
  return (Math.max(1, level) - 1) * 0.08;
}

/** The jockey's skill value handed to the race sim. */
export function getJockeySkill(level: number): number {
  return Math.min(100, 50 + (Math.max(1, level) - 1) * 5);
}

export function createStaffRoster(): StaffRoster {
  return { trainer: { level: 1 }, jockey: { level: 1 } };
}

export interface StaffUpgradeCheck {
  canUpgrade: boolean;
  atMax: boolean;
  nextLevel: number;
  cost: number;
  reputationRequired: number;
  /** Why the upgrade is unavailable, for the UI to show. */
  blockedBy: 'max' | 'reputation' | 'cash' | null;
}

export function checkStaffUpgrade(
  currentLevel: number,
  cash: number,
  reputation: number,
): StaffUpgradeCheck {
  const nextLevel = currentLevel + 1;
  const atMax = currentLevel >= MAX_STAFF_LEVEL;
  const cost = atMax ? 0 : getStaffUpgradeCost(nextLevel);
  const reputationRequired = atMax ? 0 : getReputationRequired(nextLevel);

  let blockedBy: StaffUpgradeCheck['blockedBy'] = null;
  if (atMax) blockedBy = 'max';
  // Reputation is reported ahead of cash: it is the harder wall, and telling a
  // player to go and earn money when the yard is the real problem is a lie.
  else if (reputation < reputationRequired) blockedBy = 'reputation';
  else if (cash < cost) blockedBy = 'cash';

  return {
    canUpgrade: blockedBy === null,
    atMax,
    nextLevel,
    cost,
    reputationRequired,
    blockedBy,
  };
}
