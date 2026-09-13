// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { Horse } from '../sim/types.js';
import { mountRaceDayScreen, type RaceDayRace } from './raceDayScreen.js';
import { createNewCareer, createStable, type Career } from './career.js';
import { DEFAULTS } from '../data/colors.js';

/**
 * 3D mode is disabled — the procedural models don't animate well enough yet.
 * All 3D code is preserved for future re-enablement. These tests verify that
 * the UI no longer offers 3D and always defaults to 2D.
 */

function horse(): Horse {
  return {
    id: 'h1',
    name: 'Test Horse',
    gender: 'stallion',
    age: 3,
    stats: { speed: 50, stamina: 50, burst: 50, grit: 50, temper: 50, consistency: 50 },
    potential: { speed: 80, stamina: 80, burst: 80, grit: 80, temper: 80, consistency: 80 },
    style: 'stalker',
    moment: 'late',
    preferredDistance: { min: 1200, max: 1800 },
    traits: [],
    condition: 70,
    morale: 65,
    division: 'open',
    divisionLevel: 2,
    divisionPoints: 0,
    starts: 0,
    wins: 0,
    places: 0,
    shows: 0,
    coat: 'bay',
    jockeySkill: 60,
  };
}

const race: RaceDayRace = {
  name: 'Test Handicap',
  distance: 1400,
  going: 'good',
  purse: 20000,
  toWinner: 10000,
};

function mount(career: Career): { host: HTMLElement; teardown: () => void } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const teardown = mountRaceDayScreen(
    host,
    career,
    [horse()],
    race,
    () => {},
    () => {},
  );
  return { host, teardown };
}

describe('race view choice', () => {
  let career: Career;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    career = createNewCareer(horse(), DEFAULTS.playerSilksDefault, createStable('raceView-1'));
  });

  it('opens on 2D for a stable that has never chosen', () => {
    const { host, teardown } = mount(career);
    // 3D mode is disabled — no view buttons should exist
    const btns = host.querySelectorAll('.raceday-view-btn');
    expect(btns.length).toBe(0);
    teardown();
  });

  it('does not write an experimental view preference to the stable', () => {
    const { teardown } = mount(career);
    expect(career.stable.settings).not.toHaveProperty('raceView');
    teardown();
  });
});
