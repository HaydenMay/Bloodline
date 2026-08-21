// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import type { Horse } from '../sim/types.js';
import { mountRaceDayScreen, type RaceDayRace } from './raceDayScreen.js';
import { createNewCareer, createStable, loadStable, type Career } from './career.js';
import { DEFAULTS } from '../data/colors.js';

/**
 * The 2D/3D choice lives on Race Day, next to Start Race, and sticks.
 *
 * Worth a test rather than a look: the whole point of putting it here instead
 * of in a settings menu is that it is picked per race, and the whole point of
 * persisting it is that a twenty-start career is not twenty re-picks. Both
 * halves are invisible until they break.
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
    const active = host.querySelector('.raceday-view-btn.is-active');
    expect(active?.getAttribute('data-view')).toBe('2d');
    teardown();
  });

  it('moves the active state when 3D is picked', () => {
    const { host, teardown } = mount(career);
    host.querySelector<HTMLButtonElement>('.raceday-view-btn[data-view="3d"]')!.click();

    const active = host.querySelectorAll('.raceday-view-btn.is-active');
    expect(active.length).toBe(1);
    expect(active[0]!.getAttribute('data-view')).toBe('3d');
    teardown();
  });

  it('persists the choice, so the next race opens on it', () => {
    const first = mount(career);
    first.host.querySelector<HTMLButtonElement>('.raceday-view-btn[data-view="3d"]')!.click();
    first.teardown();

    expect(loadStable()?.settings.raceView).toBe('3d');

    // A fresh screen, reading the saved stable rather than the one in hand.
    const reloaded = { ...career, stable: loadStable()! };
    const second = mount(reloaded);
    const active = second.host.querySelector('.raceday-view-btn.is-active');
    expect(active?.getAttribute('data-view')).toBe('3d');
    second.teardown();
  });

  it('offers 3D on a desktop window', () => {
    const { host, teardown } = mount(career);
    const btn = host.querySelector<HTMLButtonElement>('.raceday-view-btn[data-view="3d"]')!;
    expect(btn.disabled).toBe(false);
    expect(host.querySelector<HTMLElement>('.raceday-view-note')!.hidden).toBe(true);
    teardown();
  });

  //it('closes 3D off on a phone, and shows 2D as what will actually run', () => {
    // A stable that picked 3D on a desktop and then opened on a phone. The
    // saved preference is untouched — it is right again on the next desktop —
    // but the button has to say what this device will do.
    //const first = mount(career);
    //first.host.querySelector<HTMLButtonElement>('.raceday-view-btn[data-view="3d"]')!.click();
    //first.teardown();

    //const width = window.innerWidth;
    //Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    //try {
      //const { host, teardown } = mount({ ...career, stable: loadStable()! });
      //expect(host.querySelector<HTMLButtonElement>('.raceday-view-btn[data-view="3d"]')!.disabled).toBe(true);
      //expect(host.querySelector('.raceday-view-btn.is-active')?.getAttribute('data-view')).toBe('2d');
      //expect(host.querySelector<HTMLElement>('.raceday-view-note')!.hidden).toBe(false);
      ///expect(loadStable()?.settings.raceView).toBe('3d');
    //teardown();
  //  } finally {
      //Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
 //   }
  //});

  it('can be switched back to 2D', () => {
    const { host, teardown } = mount(career);
    host.querySelector<HTMLButtonElement>('.raceday-view-btn[data-view="3d"]')!.click();
    host.querySelector<HTMLButtonElement>('.raceday-view-btn[data-view="2d"]')!.click();

    expect(loadStable()?.settings.raceView).toBe('2d');
    teardown();
  });
});
