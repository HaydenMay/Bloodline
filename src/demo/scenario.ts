import { createRng } from '../sim/rng.js';
import { createNameGenerator } from '../data/names.js';
import { generateHorse, generateStarterSix } from '../sim/horse.js';
import { getAgeTrainingFactor } from '../sim/growth.js';
import { TRAINING_SESSIONS, resolveTrainingSession } from '../ui/trainingScreen.js';
import type { Horse } from '../sim/types.js';

export function createDemoStarters(): Horse[] {
  const rng = createRng('bloodline-demo-starters-v1');
  return generateStarterSix(rng, createNameGenerator(rng));
}

export function demoDistance(player: Horse): number {
  return Math.round((player.preferredDistance.min + player.preferredDistance.max) / 2);
}

export function createDemoField(player: Horse): Horse[] {
  const rng = createRng('bloodline-demo-opponents-v1');
  const names = createNameGenerator(rng, [player.name]);
  return [player, ...Array.from({ length: 7 }, () => generateHorse(rng, names, {
    division: 'maiden', age: 2, starter: true, distanceCentre: demoDistance(player),
  }))];
}

export function trainDemoHorse(horse: Horse, sessionId: 'sprintWork' | 'swimming' | 'crossTraining') {
  return resolveTrainingSession(createRng('bloodline-demo-training-v1'), horse,
    TRAINING_SESSIONS[sessionId]!, getAgeTrainingFactor(horse.age, horse.traits));
}
