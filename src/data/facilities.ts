/**
 * Stable facilities that players can upgrade with cash.
 * Each facility has 5 levels with increasing costs and benefits.
 */

export interface Facility {
  id: string;
  name: string;
  description: string;
  baseIcon: string;
  benefit: string;
  baseCost: number;
}

export interface FacilityUpgradeCost {
  level: number;
  cost: number;
  description: string;
}

export const FACILITIES: Record<string, Facility> = {
  barn: {
    id: 'barn',
    name: 'Barn',
    description: 'Horse housing and comfort',
    baseIcon: '🏠',
    benefit: '+2% condition retention',
    baseCost: 5000,
  },
  training: {
    id: 'training',
    name: 'Training Grounds',
    description: 'Training facilities and equipment',
    baseIcon: '🏋️',
    benefit: '+1 stat point per training',
    baseCost: 7500,
  },
  medical: {
    id: 'medical',
    name: 'Medical Wing',
    description: 'Veterinary care and recovery',
    baseIcon: '⚕️',
    benefit: '+5% injury recovery speed',
    baseCost: 10000,
  },
  feed: {
    id: 'feed',
    name: 'Feed Storage',
    description: 'Premium feed and supplements',
    baseIcon: '🌾',
    benefit: '+3% morale gain',
    baseCost: 6000,
  },
  stud: {
    id: 'stud',
    name: 'Stud Farm',
    description: 'Breeding preparation',
    baseIcon: '🐴',
    benefit: '+10% breeding potential',
    baseCost: 15000,
  },
  admin: {
    id: 'admin',
    name: 'Administration',
    description: 'Record keeping and logistics',
    baseIcon: '📋',
    benefit: '+5% prize money',
    baseCost: 8000,
  },
  paddock: {
    id: 'paddock',
    name: 'Paddock',
    description: 'Grazing and exercise space',
    baseIcon: '🌳',
    benefit: '+2 morale per week',
    baseCost: 5500,
  },
};

export function getUpgradeCost(baseCost: number, targetLevel: number): number {
  // Cost scales with level: level 1 = 1x, level 2 = 1.5x, level 3 = 2.25x, etc.
  const multiplier = Math.pow(1.5, targetLevel - 1);
  return Math.round(baseCost * multiplier);
}

export function getFacilityDescription(facilityId: string, level: number): string {
  const facility = FACILITIES[facilityId];
  if (!facility) return '';
  return `${facility.name} - Level ${level}/5`;
}
