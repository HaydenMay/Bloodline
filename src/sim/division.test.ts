import { describe, it, expect } from 'vitest';
import type { Horse } from './types.js';
import type { Division } from '../data/index.js';
import {
  finalizeDemotion,
  finalizePromotion,
  updateAIDivisionProgression,
} from './division.js';

const LEVELS: Division[] = ['maiden', 'novice', 'open', 'stakes', 'championship'];

function horseAt(division: Division, divisionPoints = 0): Horse {
  return {
    id: 'h1',
    name: 'Test',
    gender: 'stallion',
    age: 3,
    stats: { speed: 50, stamina: 50, burst: 50, grit: 50, temper: 50, consistency: 50 },
    potential: { speed: 70, stamina: 70, burst: 70, grit: 70, temper: 70, consistency: 70 },
    style: 'stalker',
    moment: 'late',
    preferredDistance: { min: 1200, max: 1800 },
    traits: [],
    condition: 75,
    morale: 65,
    division,
    divisionLevel: LEVELS.indexOf(division),
    divisionPoints,
    starts: 0,
    wins: 0,
    places: 0,
    shows: 0,
    coat: 'bay',
    jockeySkill: 60,
  };
}

/**
 * Race fields, prize money and legacy scaling are all keyed off the division
 * *name*, so it must never drift from the level.
 */
describe('division name stays in step with division level', () => {
  it('renames the horse when a promotion race is won', () => {
    const horse = horseAt('maiden', 5);
    finalizePromotion(horse, 1);
    expect(horse.divisionLevel).toBe(1);
    expect(horse.division).toBe('novice');
  });

  it('leaves the name alone when a promotion race is lost', () => {
    const horse = horseAt('maiden', 5);
    finalizePromotion(horse, 6);
    expect(horse.divisionLevel).toBe(0);
    expect(horse.division).toBe('maiden');
  });

  it('renames the horse when it is demoted', () => {
    const horse = horseAt('open', -3);
    finalizeDemotion(horse, 7);
    expect(horse.divisionLevel).toBe(1);
    expect(horse.division).toBe('novice');
  });

  it('leaves the name alone when demotion is survived', () => {
    const horse = horseAt('open', -3);
    finalizeDemotion(horse, 2);
    expect(horse.division).toBe('open');
  });

  it('renames AI horses on promotion and demotion too', () => {
    const climber = horseAt('novice', 4);
    updateAIDivisionProgression(climber, 1); // +3 -> 7, promotes
    expect(climber.division).toBe('open');

    const slider = horseAt('stakes', -2);
    updateAIDivisionProgression(slider, 8); // -1 -> -3, demotes
    expect(slider.division).toBe('open');
  });

  it('never promotes past championship or demotes below maiden', () => {
    const top = horseAt('championship', 5);
    finalizePromotion(top, 1);
    expect(top.division).toBe('championship');
    expect(top.divisionLevel).toBe(4);

    const bottom = horseAt('maiden', -3);
    finalizeDemotion(bottom, 8);
    expect(bottom.division).toBe('maiden');
    expect(bottom.divisionLevel).toBe(0);
  });

  it('keeps name and level consistent across a full climb', () => {
    const horse = horseAt('maiden');
    for (let level = 1; level <= 4; level++) {
      finalizePromotion(horse, 1);
      expect(horse.divisionLevel).toBe(level);
      expect(horse.division).toBe(LEVELS[level]);
    }
  });
});
