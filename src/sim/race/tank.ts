import {
  CHARGE_CAPACITY,
  DRAIN_EXPONENT,
  DRAFT_RECOVER_BONUS,
  EASY_LEAD_RECOVER_BONUS,
  FATIGUE_FLOOR,
  FATIGUE_START,
  KICK_TANK_COST,
  PRESS_COST,
  PRESS_MAX_RIVALS,
  REFERENCE_PACE,
  STAMINA_RECOVER_SPAN,
  TANK_RACE_COST,
  TANK_RECOVER_RATE,
} from './constants.js';

/**
 * The tank — the one conserved quantity in the simulation (REBUILD.md §5, R6).
 *
 * It is never shown as a bar. The player sees it only as charge dots, which are
 * the tank quantised (`chargesFor` below). That satisfies the owner's "no
 * stamina bar" while giving the simulation the conserved quantity it has to
 * have: the previous rebuild removed energy entirely and, in doing so, removed
 * the only thing that made speed cost anything. The roadmap's own diagnosis:
 * "Effort has no cost in this economy — the actual root cause."
 *
 * Drain is charged against race PROGRESS rather than wall-clock seconds. That
 * is what lets one set of constants serve a 600 m dash and a 2400 m route
 * without special-casing either: a horse holding a constant pace for a whole
 * race spends the same fraction of its tank whatever the distance.
 */

export interface TankModifiers {
  /** Multiplies recovery. Iron Lungs, Thirsty. */
  recoverMult: number;
  /** Multiplies the drafting bonus. Quick Recovery. */
  draftMult: number;
  /** Subtracted from DRAIN_EXPONENT. Cruiser — a flatter cost curve at pace. */
  exponentRelief: number;
}

export const NO_TANK_MODIFIERS: TankModifiers = {
  recoverMult: 1,
  draftMult: 1,
  exponentRelief: 0,
};

/** Stamina sets regen RATE, continuously. Never tank size. */
export function staminaFactor(stamina: number): number {
  return 1 - STAMINA_RECOVER_SPAN / 2 + STAMINA_RECOVER_SPAN * (stamina / 100);
}

/**
 * Tank spent per second at a given pace.
 *
 * Superlinear in pace, and steeply so. At DRAIN_EXPONENT = 12, running just
 * 2.5% above reference costs 34% more. That steepness is the entire reason
 * going too fast early is punished, and therefore the entire reason pace
 * collapse produces upsets without a fudge factor.
 */
export function drainPerSecond(
  paceFactor: number,
  speed: number,
  totalMetres: number,
  mods: TankModifiers = NO_TANK_MODIFIERS,
  press = 0,
): number {
  const progressPerSecond = speed / totalMetres;
  const exponent = Math.max(1, DRAIN_EXPONENT - mods.exponentRelief);
  const contested = 1 + PRESS_COST * Math.min(press, PRESS_MAX_RIVALS);
  return (
    progressPerSecond * TANK_RACE_COST * Math.pow(paceFactor / REFERENCE_PACE, exponent) * contested
  );
}

/** Tank recovered per second. Position never enters this — only pace does. */
export function recoverPerSecond(
  stamina: number,
  speed: number,
  totalMetres: number,
  drafting: boolean,
  mods: TankModifiers = NO_TANK_MODIFIERS,
  easyLead = false,
): number {
  const progressPerSecond = speed / totalMetres;
  const shelter = drafting
    ? 1 + DRAFT_RECOVER_BONUS * mods.draftMult
    : easyLead
      ? 1 + EASY_LEAD_RECOVER_BONUS
      : 1;
  return progressPerSecond * TANK_RECOVER_RATE * staminaFactor(stamina) * mods.recoverMult * shelter;
}

/**
 * The speed penalty for running dry.
 *
 * A smooth ramp rather than a cliff, and the largest single penalty in the
 * game — which is what makes emptying the worst thing that can happen to a
 * horse, and therefore what makes pace a real decision.
 */
export function fatigueFactor(tank: number): number {
  if (tank >= FATIGUE_START) return 1;
  const t = Math.max(0, tank) / FATIGUE_START;
  return FATIGUE_FLOOR + (1 - FATIGUE_FLOOR) * t;
}

/**
 * Charge dots. THE DOTS ARE THE TANK, quantised.
 *
 * With KICK_TANK_COST = 0.15 the last dot goes out at tank 0.15 — exactly where
 * FATIGUE_START begins to bite. So the dots the HUD already draws are an honest
 * readout of a hidden resource, with no extra instrumentation needed anywhere.
 */
export function chargesFor(tank: number): number {
  return Math.min(CHARGE_CAPACITY, Math.floor(tank / KICK_TANK_COST));
}

/** Fraction of the way toward the next dot. Drives the existing fill wedge. */
export function chargeProgressFor(tank: number): number {
  if (chargesFor(tank) >= CHARGE_CAPACITY) return 1;
  const within = (tank % KICK_TANK_COST) / KICK_TANK_COST;
  return within < 0 ? 0 : within;
}
