/**
 * Legacy and Hall of Fame system for tracking career achievements.
 * Players earn legacy points through accomplishments, unlocking tiers and HOF status.
 */

export interface LegacyAchievement {
  id: string;
  name: string;
  description: string;
  points: number;
  category: 'racing' | 'breeding' | 'rival' | 'milestone';
}

export interface LegacyTier {
  level: number;
  name: string;
  minPoints: number;
  description: string;
  icon: string;
  benefits: string[];
}

export interface HallOfFameEntry {
  horseName: string;
  wins: number;
  earnings: number;
  legacyPoints: number;
  division: string;
  season: number;
  timestamp: number;
}

export interface LegacyStats {
  totalPoints: number;
  tier: number; // 0-5
  hallOfFame: boolean;
  achievements: Record<string, number>; // achievementId -> count
}

// Legacy tiers that players progress through
export const LEGACY_TIERS: LegacyTier[] = [
  {
    level: 0,
    name: 'Novice',
    minPoints: 0,
    description: 'Just starting out',
    icon: '🐴',
    benefits: [
      'Basic facilities (Levels 1-2)',
      'Standard facility upgrades',
    ],
  },
  {
    level: 1,
    name: 'Professional',
    minPoints: 100,
    description: 'Proven track record',
    icon: '🌟',
    benefits: [
      'Professional facilities (Levels 1-3)',
      'All standard facilities available',
      'Breeding facility unlocked',
    ],
  },
  {
    level: 2,
    name: 'Elite',
    minPoints: 300,
    description: 'Championship caliber',
    icon: '👑',
    benefits: [
      'Elite facilities (Levels 1-4)',
      'Premium facility: Elite Stables',
      '5% earnings bonus',
    ],
  },
  {
    level: 3,
    name: 'Champion',
    minPoints: 600,
    description: 'Hall of Fame candidate',
    icon: '🏆',
    benefits: [
      'Championship facilities (All levels 1-5)',
      'Exclusive facility: Champions Quarter',
      '10% earnings bonus',
      'Breeding trait inheritance',
    ],
  },
  {
    level: 4,
    name: 'Legend',
    minPoints: 1000,
    description: 'Immortal racing legacy',
    icon: '⭐',
    benefits: [
      'All facilities maxed potential',
      'Legendary facility: Stud Empire',
      '15% earnings bonus',
      'Special breeding rights',
      'Hall of Fame eligibility',
    ],
  },
];

// Achievements that grant legacy points
export const ACHIEVEMENTS: Record<string, LegacyAchievement> = {
  firstWin: {
    id: 'firstWin',
    name: 'First Victory',
    description: 'Win your first race',
    points: 10,
    category: 'racing',
  },
  tenWins: {
    id: 'tenWins',
    name: 'Winning Streak',
    description: 'Achieve 10 career wins',
    points: 50,
    category: 'racing',
  },
  twentyWins: {
    id: 'twentyWins',
    name: 'Dominant Force',
    description: 'Achieve 20 career wins',
    points: 100,
    category: 'racing',
  },
  fiftyWins: {
    id: 'fiftyWins',
    name: 'Legend in the Making',
    description: 'Achieve 50 career wins',
    points: 200,
    category: 'racing',
  },
  maidenChampion: {
    id: 'maidenChampion',
    name: 'Maiden Master',
    description: 'Promote from Maiden division',
    points: 25,
    category: 'milestone',
  },
  noviceChampion: {
    id: 'noviceChampion',
    name: 'Novice Triumph',
    description: 'Promote from Novice division',
    points: 50,
    category: 'milestone',
  },
  openChampion: {
    id: 'openChampion',
    name: 'Open Victory',
    description: 'Promote from Open division',
    points: 75,
    category: 'milestone',
  },
  stakesChampion: {
    id: 'stakesChampion',
    name: 'Stakes Winner',
    description: 'Promote from Stakes division',
    points: 125,
    category: 'milestone',
  },
  championshipWin: {
    id: 'championshipWin',
    name: 'Ultimate Champion',
    description: 'Promote to Championship division',
    points: 200,
    category: 'milestone',
  },
  millionEarnings: {
    id: 'millionEarnings',
    name: 'Million Dollar Horse',
    description: 'Earn $1,000,000 in prizes',
    points: 150,
    category: 'racing',
  },
};

export function getTierFromPoints(points: number): number {
  for (let i = LEGACY_TIERS.length - 1; i >= 0; i--) {
    if (points >= LEGACY_TIERS[i].minPoints) {
      return i;
    }
  }
  return 0;
}

export function isHallOfFame(legacyPoints: number, wins: number): boolean {
  // Hall of Fame: Legend tier (tier 4) with 50+ wins
  return getTierFromPoints(legacyPoints) >= 4 && wins >= 50;
}

export function calculateLegacyPoints(
  wins: number,
  earnings: number,
  division: string,
): number {
  let points = 0;

  // Win-based points
  if (wins >= 50) points += 200;
  else if (wins >= 20) points += 100;
  else if (wins >= 10) points += 50;
  else if (wins >= 1) points += 10;

  // Earnings-based points
  if (earnings >= 1000000) points += 150;
  else points += Math.floor(earnings / 10000); // 1 point per $10k earned

  // Division-based points (bonus for reaching higher divisions)
  const divisionPoints: Record<string, number> = {
    maiden: 25,
    novice: 75,
    open: 150,
    stakes: 275,
    championship: 475,
  };
  points += divisionPoints[division] || 0;

  return points;
}
