/**
 * Trainer and jockey.
 *
 * Both level up with cash, but the yard's prestige is the ceiling: money alone
 * cannot buy a top jockey, because a good rider signs with a yard that wins,
 * not with whoever waves a cheque. Cash is what you spend; prestige is what you
 * are allowed to spend it on.
 *
 * Staff are hired by the *stable* and stay hired across every horse, which is
 * why the stable's own standing gates them. An earlier build gated them on a
 * separate "reputation" score — a second lifetime counter earned from race
 * results, which is what prestige already is. Two numbers measuring the same
 * thing left players with a currency they could neither explain nor act on.
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
 * Prestige ceiling per level, indexed by level.
 *
 * Sized against the prestige ladder (Novice 0, Professional 400, Elite 1500,
 * Champion 3500, Legend 7500) and against what a career actually banks: a first
 * horse leaves the yard somewhere near 400, so it can climb to level 5 on its
 * own, and the top of the ladder takes a yard several generations deep. Staff
 * levels are kept once bought, so this only ever gates climbing higher.
 */
export const PRESTIGE_REQUIRED = [0, 0, 60, 150, 300, 600, 1100, 1800, 2800, 4200];

export function getPrestigeRequired(level: number): number {
  if (level <= 1) return 0;
  return PRESTIGE_REQUIRED[level - 1] ?? PRESTIGE_REQUIRED[PRESTIGE_REQUIRED.length - 1]!;
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
  prestigeRequired: number;
  /** Why the upgrade is unavailable, for the UI to show. */
  blockedBy: 'max' | 'prestige' | 'cash' | null;
}

export function checkStaffUpgrade(
  currentLevel: number,
  cash: number,
  prestige: number,
): StaffUpgradeCheck {
  const nextLevel = currentLevel + 1;
  const atMax = currentLevel >= MAX_STAFF_LEVEL;
  const cost = atMax ? 0 : getStaffUpgradeCost(nextLevel);
  const prestigeRequired = atMax ? 0 : getPrestigeRequired(nextLevel);

  let blockedBy: StaffUpgradeCheck['blockedBy'] = null;
  if (atMax) blockedBy = 'max';
  // Prestige is reported ahead of cash: it is the harder wall, and telling a
  // player to go and earn money when the yard is the real problem is a lie.
  else if (prestige < prestigeRequired) blockedBy = 'prestige';
  else if (cash < cost) blockedBy = 'cash';

  return {
    canUpgrade: blockedBy === null,
    atMax,
    nextLevel,
    cost,
    prestigeRequired,
    blockedBy,
  };
}
