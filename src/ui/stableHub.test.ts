// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Horse } from '../sim/types.js';
import { mountStableHub, type StableHubCallbacks } from './stableHub.js';
import { createNewCareer, createStable, type Career } from './career.js';
import { DEFAULTS } from '../data/colors.js';

function horse(age: number): Horse {
  return {
    id: 'h1',
    name: 'Test Horse',
    gender: 'stallion',
    age,
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

function career(age: number, racesCompleted: number): Career {
  const made = createNewCareer(horse(age), DEFAULTS.playerSilksDefault, createStable());
  made.stats.racesCompleted = racesCompleted;
  made.horseLegacy.peak = 400;
  made.horseLegacy.points = 300;
  return made;
}

const noop = (): void => {};

function callbacks(onRetire: () => void): StableHubCallbacks {
  return {
    onTraining: noop,
    onRaceCalendar: noop,
    onFacilities: noop,
    onTrainerJockey: noop,
    onConsumables: noop,
    onDossier: noop,
    onLegacy: noop,
    onArchive: noop,
    onRest: noop,
    onRetire,
  };
}

let host: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});

describe('retiring from the hub', () => {
  /**
   * The prompt used to live only at the foot of the page, below the whole
   * navigation grid, so a player whose horse had just turned 5 had to go
   * scrolling to find the decision the trainer was asking them to make.
   */
  it('puts the trainer’s prompt above the navigation once decline sets in', () => {
    mountStableHub(host, career(5, 17), callbacks(noop));

    const advice = host.querySelector('.retire-advice');
    const nav = host.querySelector('.hub-navigation');
    expect(advice).not.toBeNull();
    expect(nav).not.toBeNull();

    // Earlier in document order means further up the page.
    const order = advice!.compareDocumentPosition(nav!);
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sits with the horse it is about, not in a banner of its own', () => {
    mountStableHub(host, career(5, 17), callbacks(noop));
    expect(host.querySelector('.hub-horse-profile .retire-advice')).not.toBeNull();
  });

  /** §8: advice the player cannot act on is nagging, not counsel. */
  it('says nothing while the horse is still improving', () => {
    mountStableHub(host, career(3, 4), callbacks(noop));
    expect(host.querySelector('.retire-advice')).toBeNull();
  });

  it('keeps retirement reachable even when the trainer is quiet', () => {
    mountStableHub(host, career(3, 4), callbacks(noop));
    expect(host.querySelectorAll('.retire-btn')).toHaveLength(1);
  });

  it('offers both the prompt and the quiet link when decline has set in', () => {
    mountStableHub(host, career(5, 17), callbacks(noop));
    expect(host.querySelectorAll('.retire-btn')).toHaveLength(2);
  });

  /** Duplicate ids meant only the first button was ever wired up. */
  it('retires from either button', () => {
    const onRetire = vi.fn();
    mountStableHub(host, career(5, 17), callbacks(onRetire));

    const buttons = host.querySelectorAll<HTMLButtonElement>('.retire-btn');
    expect(buttons).toHaveLength(2);

    buttons[0]!.click();
    expect(onRetire).toHaveBeenCalledTimes(1);

    buttons[1]!.click();
    expect(onRetire).toHaveBeenCalledTimes(2);
  });
});
