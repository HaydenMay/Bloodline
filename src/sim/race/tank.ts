import {
  DRAIN_EXPONENT,
  DRAFT_RECOVER_BONUS,
  EASY_LEAD_RECOVER_BONUS,
  FATIGUE_FLOOR,
  FATIGUE_START,
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
 * IT IS THE JOCKEY'S, NOT THE PLAYER'S. It is never shown as a bar and the
 * player never spends it. Its job is to make pace cost something — so that
 * going too fast early is punished and a lead cannot simply run away — and to
 * give the jockey a reason to settle a horse or ask it to close. Kick charges
 * are a separate bank entirely (charges.ts) and a kick never touches this.
 *
 * The two were combined at first, charges being the tank quantised, and the
 * consequence was that spending a charge spent stamina: a kick could cost more
 * ground in fatigue than it gained, and a player who never kicked beat almost
 * every player who did. The owner's call, and the right one — kicks should
 * always reward the player.
 *
 * What survives from that model is the part worth keeping: the previous rebuild
 * removed energy altogether and with it the only thing that made speed cost
 * anything. The roadmap's own diagnosis: "Effort has no cost in this economy —
 * the actual root cause."
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
 * The speed penalty for running dry — "as tank lowers, effectiveness lowers".
 *
 * A smooth ramp rather than a cliff, and the largest single penalty in the
 * game, which is what makes emptying the worst thing that can happen to a horse
 * and therefore what makes pace a real decision. It applies to the horse's
 * whole output, kicks included: a tired horse cannot quicken like a fresh one.
 */
export function fatigueFactor(tank: number): number {
  if (tank >= FATIGUE_START) return 1;
  const t = Math.max(0, tank) / FATIGUE_START;
  return FATIGUE_FLOOR + (1 - FATIGUE_FLOOR) * t;
}

/**
 * How well the horse is going, 0 (cooked) to 1 (full of running).
 *
 * The tank is hidden, but its effect must not be: the HUD shows this rather
 * than a stamina bar, so a player can see their horse coming to the end of its
 * tether without being handed a number to manage.
 */
export function conditionReadout(tank: number): number {
  const t = tank / FATIGUE_START;
  return t >= 1 ? 1 : t < 0 ? 0 : t;
}
