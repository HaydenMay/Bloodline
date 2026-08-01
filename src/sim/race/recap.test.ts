import { describe, expect, it } from 'vitest';
import { buildRecap, lengths, paceOf } from './recap.js';
import type { RaceOutcome, RaceResult } from './types.js';

const result = (over: Partial<RaceResult> & { horseId: string; finishPosition: number }): RaceResult => ({
  name: over.horseId,
  time: 96,
  margin: 0,
  energyLeft: 12,
  sectionals: [],
  hadTrouble: false,
  fumbledStart: false,
  offColour: false,
  ...over,
});

const outcome = (results: RaceResult[], over: Partial<RaceOutcome> = {}): RaceOutcome => ({
  results,
  events: [],
  paceRating: 1,
  duration: 96,
  ...over,
});

describe('lengths', () => {
  it('counts in parts of a horse under a length, not in decimals', () => {
    expect(lengths(0.01)).toBe('a dead heat');
    expect(lengths(0.05)).toBe('a nose');
    expect(lengths(0.12)).toBe('a head');
    expect(lengths(0.3)).toBe('a neck');
    expect(lengths(0.5)).toBe('half a length');
    expect(lengths(0.75)).toBe('three-quarters of a length');
  });

  it('counts in quarter lengths above one', () => {
    expect(lengths(1)).toBe('a length');
    expect(lengths(1.25)).toBe('1¼ lengths');
    expect(lengths(2.5)).toBe('2½ lengths');
    expect(lengths(3.75)).toBe('3¾ lengths');
    expect(lengths(6)).toBe('6 lengths');
  });
});

describe('paceOf', () => {
  it('reads above 1 as a collapse, because the race slowed', () => {
    expect(paceOf(1.2)).toBe('collapsed');
    expect(paceOf(1)).toBe('even');
    expect(paceOf(0.8)).toBe('crawl');
  });
});

describe('buildRecap', () => {
  const field = (): RaceResult[] => [
    result({ horseId: 'a', finishPosition: 1, margin: 0 }),
    result({ horseId: 'me', finishPosition: 2, margin: 1.5 }),
    result({ horseId: 'c', finishPosition: 3, margin: 4 }),
  ];

  it('states the placing and the margin in lengths', () => {
    const r = buildRecap(outcome(field()), 'me', 'stalker');
    expect(r.headline).toBe('2nd of 3');
    expect(r.margin).toBe('beaten 1½ lengths');
  });

  it('reports a win by the runner-up’s margin, not the winner’s', () => {
    const rows = field();
    rows[0]!.horseId = 'me';
    rows[1]!.horseId = 'a';
    rows[1]!.margin = 0.3;
    const r = buildRecap(outcome(rows), 'me', 'stalker');
    expect(r.headline).toBe('WINNER');
    expect(r.margin).toBe('by a neck');
  });

  it('always gives a reason, even for a clean race', () => {
    const r = buildRecap(outcome(field()), 'me', 'stalker');
    expect(r.story.length).toBeGreaterThan(0);
  });

  it('never gives more than three reasons', () => {
    const rows = field();
    rows[1] = result({
      horseId: 'me',
      finishPosition: 2,
      margin: 2,
      hadTrouble: true,
      fumbledStart: true,
      offColour: true,
      energyLeft: 40,
    });
    const r = buildRecap(outcome(rows, { paceRating: 1.3 }), 'me', 'closer');
    expect(r.story.length).toBe(3);
  });

  it('leads with what physically stopped the horse, not with tactics', () => {
    const rows = field();
    rows[1] = result({ horseId: 'me', finishPosition: 2, margin: 2, hadTrouble: true, energyLeft: 40 });
    const r = buildRecap(outcome(rows, { paceRating: 1.3 }), 'me', 'closer');
    expect(r.story[0]).toContain('shut in');
  });

  it('calls out a horse that finished with energy to spare', () => {
    const rows = field();
    rows[1] = result({ horseId: 'me', finishPosition: 2, margin: 2, energyLeft: 40 });
    const r = buildRecap(outcome(rows), 'me', 'closer');
    expect(r.story.join(' ')).toContain('asked too late');
  });

  it('blames the front-runner for its own collapse, and credits a closer for it', () => {
    const rows = field();
    const front = buildRecap(outcome(rows, { paceRating: 1.3 }), 'me', 'frontRunner');
    expect(front.story.join(' ')).toContain('took them along');

    const closer = buildRecap(outcome(rows, { paceRating: 1.3 }), 'me', 'closer');
    expect(closer.story.join(' ')).toContain('came back from behind');
  });

  it('notes an unused kick only when the race was lost', () => {
    const lost = buildRecap(outcome(field()), 'me', 'stalker');
    expect(lost.story.join(' ')).toContain('never asked');

    const rows = field();
    rows[0]!.horseId = 'me';
    const won = buildRecap(outcome(rows), 'me', 'stalker');
    expect(won.story.join(' ')).not.toContain('never asked');
  });

  it('survives a horse that was not in the race', () => {
    const r = buildRecap(outcome(field()), 'ghost', 'stalker');
    expect(r.headline).toBe('—');
    expect(r.story).toEqual([]);
  });
});
