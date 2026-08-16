import { describe, it, expect } from 'vitest';
import type { Horse } from './types.js';
import { createRng } from './rng.js';
import {
  DEBUT_AGE,
  FINAL_AGE,
  PEAK_AGE,
  RACES_PER_SEASON,
  advanceSeasonIfDue,
  applyTrainedStat,
  getAgeTrainingFactor,
  getCapFactor,
  getCareerStage,
  getRetirementAdvice,
  isFullyDeveloped,
} from './growth.js';
import { applyInjury, getInjuryChance, isCareerEnding, rollForInjury } from './injury.js';
import { getForm, getSpirit } from './upkeep.js';

function horse(overrides: Partial<Horse> = {}): Horse {
  return {
    id: 'h1',
    name: 'Test',
    gender: 'stallion',
    age: 2,
    stats: { speed: 50, stamina: 50, burst: 50, grit: 50, temper: 50, consistency: 50 },
    potential: { speed: 70, stamina: 70, burst: 70, grit: 70, temper: 70, consistency: 70 },
    style: 'stalker',
    moment: 'late',
    preferredDistance: { min: 1200, max: 1800 },
    traits: [],
    condition: 75,
    morale: 65,
    division: 'maiden',
    divisionLevel: 0,
    divisionPoints: 0,
    starts: 0,
    wins: 0,
    places: 0,
    shows: 0,
    coat: 'bay',
    jockeySkill: 60,
    ...overrides,
  };
}

/**
 * DESIGN.md §2: "Potential — hidden ceilings. Training cannot exceed these."
 * The word `potential` did not appear in the training screen at all, so every
 * horse's ceilings were generated and then read by nothing.
 */
describe('potential caps', () => {
  it('never lets a stat pass its ceiling', () => {
    const h = horse({ stats: { ...horse().stats, speed: 68 } });
    for (let i = 0; i < 50; i++) applyTrainedStat(h, 'speed', 5);
    expect(h.stats.speed).toBe(70);
  });

  it('gives full value while there is headroom', () => {
    expect(getCapFactor(30, 70)).toBe(1);
  });

  it('sharply diminishes as the ceiling nears', () => {
    expect(getCapFactor(60, 70)).toBeLessThan(1);
    expect(getCapFactor(68, 70)).toBeLessThan(getCapFactor(60, 70));
    expect(getCapFactor(70, 70)).toBe(0);
  });

  it('still nudges a stat that would otherwise round to nothing', () => {
    const h = horse({ stats: { ...horse().stats, speed: 69 } });
    const applied = applyTrainedStat(h, 'speed', 1);
    expect(applied).toBe(1);
    expect(h.stats.speed).toBe(70);
  });

  it('applies losses in full — a cap does not soften a bad session', () => {
    const h = horse({ stats: { ...horse().stats, speed: 50 } });
    expect(applyTrainedStat(h, 'speed', -4)).toBe(-4);
    expect(h.stats.speed).toBe(46);
  });

  it('never takes a stat below zero', () => {
    const h = horse({ stats: { ...horse().stats, speed: 2 } });
    applyTrainedStat(h, 'speed', -10);
    expect(h.stats.speed).toBe(0);
  });

  it('recognises a fully developed horse', () => {
    const h = horse();
    expect(isFullyDeveloped(h)).toBe(false);
    for (const key of ['speed', 'stamina', 'burst', 'grit', 'temper', 'consistency'] as const) {
      h.stats[key] = 70;
    }
    expect(isFullyDeveloped(h)).toBe(true);
  });
});

describe('age and the decline arc', () => {
  it('trains youngsters hardest and five-year-olds least', () => {
    expect(getAgeTrainingFactor(2)).toBeGreaterThan(getAgeTrainingFactor(3));
    expect(getAgeTrainingFactor(3)).toBeGreaterThan(getAgeTrainingFactor(4));
    expect(getAgeTrainingFactor(4)).toBeGreaterThan(getAgeTrainingFactor(5));
  });

  it('reads the stage off the age', () => {
    expect(getCareerStage(2)).toBe('developing');
    expect(getCareerStage(PEAK_AGE)).toBe('peak');
    expect(getCareerStage(FINAL_AGE)).toBe('declining');
  });

  it('ages a horse a year per season of racing', () => {
    const h = horse({ age: DEBUT_AGE });
    expect(advanceSeasonIfDue(h, RACES_PER_SEASON - 1).aged).toBe(false);
    expect(advanceSeasonIfDue(h, RACES_PER_SEASON).aged).toBe(true);
    expect(h.age).toBe(3);
  });

  it('never ages past the final racing year', () => {
    const h = horse({ age: DEBUT_AGE });
    advanceSeasonIfDue(h, 100);
    expect(h.age).toBe(FINAL_AGE);
  });

  it('costs nothing before the peak', () => {
    const h = horse({ age: DEBUT_AGE });
    const before = { ...h.stats };
    advanceSeasonIfDue(h, RACES_PER_SEASON);
    expect(h.stats).toEqual(before);
  });

  it('erodes speed and burst first once past the peak', () => {
    const h = horse({ age: PEAK_AGE });
    const before = { ...h.stats };
    advanceSeasonIfDue(h, RACES_PER_SEASON * 3);
    expect(h.stats.speed).toBeLessThan(before.speed);
    expect(h.stats.burst).toBeLessThan(before.burst);
    // The sharp end dulls before the engine does.
    expect(before.speed - h.stats.speed).toBeGreaterThan(before.grit - h.stats.grit);
  });

  it('erodes potential with the stat, so decline cannot be trained back off', () => {
    const h = horse({ age: PEAK_AGE });
    const before = h.potential.burst;
    advanceSeasonIfDue(h, RACES_PER_SEASON * 3);
    expect(h.potential.burst).toBeLessThan(before);
  });

  it('is gradual enough that a declining horse can still win', () => {
    const h = horse({ age: PEAK_AGE, stats: { ...horse().stats, speed: 80 } });
    advanceSeasonIfDue(h, RACES_PER_SEASON * 3);
    // A cliff would make the retirement decision obvious; §8 wants a judgement.
    expect(h.stats.speed).toBeGreaterThan(70);
  });
});

describe("the trainer's retirement advice", () => {
  it('says nothing while the horse is still improving', () => {
    expect(getRetirementAdvice(horse({ age: 3 }), 6, 100, 100)).toBeNull();
  });

  it('says nothing at the peak with a career still to run', () => {
    expect(getRetirementAdvice(horse({ age: PEAK_AGE }), 10, 200, 200)).toBeNull();
  });

  it('speaks up once decline sets in', () => {
    expect(getRetirementAdvice(horse({ age: FINAL_AGE }), 12, 200, 200)).not.toBeNull();
  });

  it('sharpens when legacy is slipping away from the peak', () => {
    const steady = getRetirementAdvice(horse({ age: FINAL_AGE }), 12, 200, 200);
    const slipping = getRetirementAdvice(horse({ age: FINAL_AGE }), 12, 120, 200);
    expect(slipping).not.toBe(steady);
  });

  it('speaks up on a full career even without decline', () => {
    expect(getRetirementAdvice(horse({ age: PEAK_AGE }), 18, 200, 200)).not.toBeNull();
  });
});

describe('injuries', () => {
  const rng = () => createRng('injury-test');

  it('are uncommon for a sound horse in a good yard', () => {
    const fit = horse({ condition: 90, age: 3 });
    expect(getInjuryChance(fit, { medical: 5 })).toBeLessThan(0.05);
  });

  it('rise sharply as a horse tires', () => {
    const fresh = horse({ condition: 90 });
    const jaded = horse({ condition: 20 });
    expect(getInjuryChance(jaded, {})).toBeGreaterThan(getInjuryChance(fresh, {}) * 2);
  });

  it('rise in decline, per §8', () => {
    const peak = horse({ age: PEAK_AGE, condition: 70 });
    const old = horse({ age: FINAL_AGE, condition: 70 });
    expect(getInjuryChance(old, {})).toBeGreaterThan(getInjuryChance(peak, {}));
  });

  it('are heavily reduced by the Medical Wing, per §6', () => {
    const h = horse({ condition: 60 });
    expect(getInjuryChance(h, { medical: 5 })).toBeLessThan(getInjuryChance(h, {}) * 0.5);
  });

  it('are reduced by the Iron Horse trait, which promises exactly that', () => {
    const plain = horse({ condition: 60 });
    const iron = horse({ condition: 60, traits: ['ironHorse'] });
    expect(getInjuryChance(iron, {})).toBeLessThan(getInjuryChance(plain, {}));
  });

  it('cost condition and morale when they land', () => {
    const h = horse({ condition: 80, morale: 80 });
    applyInjury(h, {
      severity: 'strain',
      name: 'Muscle Strain',
      weeksOut: 2,
      conditionCost: 20,
      description: '',
    });
    expect(h.condition).toBe(60);
    expect(h.morale).toBeLessThan(80);
  });

  it('mostly produce minor setbacks rather than career-enders', () => {
    const r = rng();
    let ended = 0;
    let total = 0;
    for (let i = 0; i < 4000; i++) {
      const injury = rollForInjury(horse({ condition: 50 }), {}, r);
      if (injury) {
        total += 1;
        if (isCareerEnding(injury)) ended += 1;
      }
    }
    expect(total).toBeGreaterThan(0);
    // §6: "rarely career-ending".
    expect(ended / total).toBeLessThan(0.1);
  });

  it('leaves most horses sound after any given race', () => {
    const r = rng();
    let hurt = 0;
    for (let i = 0; i < 1000; i++) {
      if (rollForInjury(horse({ condition: 75 }), {}, r)) hurt += 1;
    }
    expect(hurt / 1000).toBeLessThan(0.2);
  });
});

describe('form and spirit', () => {
  it('reads condition as words a trainer would use', () => {
    expect(getForm(95).label).toBe('Peak');
    expect(getForm(80).label).toBe('In Form');
    expect(getForm(60).label).toBe('Steady');
    expect(getForm(35).label).toBe('Off Form');
    expect(getForm(10).label).toBe('Jaded');
  });

  it('covers the whole range without a gap', () => {
    for (let c = 0; c <= 100; c++) expect(getForm(c).label).toBeTruthy();
  });

  it('reads morale the same way', () => {
    expect(getSpirit(90)).toBe('Buzzing');
    expect(getSpirit(10)).toBe('Miserable');
  });
});
