import { describe, it, expect } from 'vitest';
import {
  BASE_PURSES,
  PRIZE_SHARES,
  STARTER_ALLOWANCE_SHARE,
  getPrizeMoney,
  getPrizeShare,
  getPurse,
} from './purse.js';

describe('purses', () => {
  it('pays more the higher the division', () => {
    const divisions = ['maiden', 'novice', 'open', 'stakes', 'championship'];
    for (let i = 1; i < divisions.length; i++) {
      expect(getPurse(divisions[i]!)).toBeGreaterThan(getPurse(divisions[i - 1]!));
    }
  });

  /**
   * The point of the whole change: difficulty picks a stronger field, so it has
   * to pay. Before this the calendar's difficulty bars changed nothing but the
   * size of the crowd drawn behind the race.
   */
  it('pays more for a harder race', () => {
    expect(getPurse('open', 1)).toBeGreaterThan(getPurse('open', 0.5));
    expect(getPurse('open', 0.5)).toBeGreaterThan(getPurse('open', 0));
  });

  it('keeps the spread meaningful but not absurd', () => {
    const ratio = getPurse('open', 1) / getPurse('open', 0);
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(3);
  });

  it('treats a middling race as roughly the division base', () => {
    expect(getPurse('open', 0.5)).toBe(BASE_PURSES.open);
  });

  it('clamps difficulty rather than paying out fantasy money', () => {
    expect(getPurse('open', 99)).toBe(getPurse('open', 1));
    expect(getPurse('open', -5)).toBe(getPurse('open', 0));
  });

  it('falls back to the lowest purse for an unknown division', () => {
    expect(getPurse('nonsense', 0.5)).toBe(BASE_PURSES.maiden);
  });

  it('posts a round number, the way a racecard would', () => {
    for (const difficulty of [0, 0.13, 0.37, 0.62, 0.89, 1]) {
      expect(getPurse('stakes', difficulty) % 100).toBe(0);
    }
  });
});

describe('prize money', () => {
  it('pays down the placings, every place worth less than the one above', () => {
    for (let position = 2; position <= PRIZE_SHARES.length; position++) {
      expect(getPrizeShare(position)).toBeLessThan(getPrizeShare(position - 1));
    }
  });

  it('shares out the whole purse across the placed runners', () => {
    const total = PRIZE_SHARES.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  /**
   * The old ladder paid 4th and everything behind it a flat 10%, so running
   * last in an Open race collected $2,000 and a bad day cost nothing.
   */
  it('drops the unplaced to a token starter’s allowance', () => {
    expect(getPrizeShare(7)).toBe(STARTER_ALLOWANCE_SHARE);
    expect(getPrizeShare(12)).toBe(STARTER_ALLOWANCE_SHARE);
    expect(getPrizeShare(7)).toBeLessThan(getPrizeShare(6) / 2);
  });

  it('still pays something for turning up', () => {
    expect(getPrizeMoney('open', 8, 0.5)).toBeGreaterThan(0);
  });

  it('is the share of the purse for that race', () => {
    const purse = getPurse('stakes', 0.8);
    expect(getPrizeMoney('stakes', 1, 0.8)).toBe(Math.round(purse * 0.5));
    expect(getPrizeMoney('stakes', 3, 0.8)).toBe(Math.round(purse * 0.12));
  });

  /** A win in a hard race must beat a win in an easy one, or difficulty is a tax. */
  it('makes winning a hard race worth more than winning an easy one', () => {
    expect(getPrizeMoney('open', 1, 1)).toBeGreaterThan(getPrizeMoney('open', 1, 0));
  });
});
