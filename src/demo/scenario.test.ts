import { describe, expect, it } from 'vitest';
import { createDemoStarters, createDemoField, demoDistance, trainDemoHorse } from './scenario.js';

describe('demo scenario', () => {
  it('creates a reproducible starter selection and a full field containing the chosen horse', () => {
    const starters = createDemoStarters();
    expect(starters).toHaveLength(6);
    expect(createDemoStarters()).toEqual(starters);
    const field = createDemoField(starters[0]!);
    expect(field).toHaveLength(8);
    expect(new Set(field.map(h => h.id)).size).toBe(8);
    expect(field[0]).toEqual(starters[0]);
  });
  it('applies real training without mutating the original horse', () => {
    const horse = createDemoStarters()[0]!;
    const oldStats = { ...horse.stats };
    const trained = trainDemoHorse(horse, 'sprintWork');
    expect(horse.stats).toEqual(oldStats);
    expect(trained.horse.stats).not.toEqual(oldStats);
  });
});

import { simulateRace } from '../sim/race/engine.js';
it('runs both scenarios through the production race engine for every starter', () => {
  for (const starter of createDemoStarters()) {
    for (const [round, horse] of [[1, starter], [2, trainDemoHorse(starter, 'sprintWork').horse]] as const) {
      const field = createDemoField(horse);
      const result = simulateRace(field.map(h => ({ horse: h })), { seed: `bloodline-demo-race-${round}`, metres: demoDistance(horse), going: 'good', hype: 0.5 });
      expect(result.results).toHaveLength(8);
      expect(result.results.find(r => r.horseId === horse.id)?.finishPosition).toBeGreaterThan(0);
    }
  }
});
