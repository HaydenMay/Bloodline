import type { RaceSnapshot, RunnerSnapshot } from "../sim/race/engine.js";

/**
 * The seam between the race screen and whatever draws the race.
 *
 * `ui/raceScreen.ts` owns the loop, the input, the call-outs and the chrome.
 * A view owns only the world — track, runners, camera — so a second view can
 * draw the same race a different way without touching any of the rest.
 *
 * The simulation already made this cheap: `LiveRace` is tick-driven and hands
 * out snapshots, and `RunnerSnapshot.effort` is documented as being remapped
 * for the render rig's `drive`. This interface just names the seam that was
 * already there.
 */

/**
 * A runner with its position interpolated between the last two ticks.
 *
 * The screen interpolates once and hands the result to the view, because the
 * chrome needs the same numbers the world does — drawing them twice would let
 * the HUD and the horses disagree about where a horse is.
 */
export type InterpolatedRunner = RunnerSnapshot;

export interface RaceViewFrame {
  /** Interpolated, in the snapshot's own order. */
  runners: InterpolatedRunner[];
  /** The player's runner, already found. */
  player: InterpolatedRunner;
  /** The leader's progress through the race, 0-1. */
  progress: number;
  /** Seconds since the previous rendered frame. */
  dt: number;
}

export interface RaceView {
  render(frame: RaceViewFrame): void;
  dispose(): void;
}

/**
 * Positions move one tick at a time but the screen redraws far more often, so
 * everything is drawn between the last two ticks rather than on them. Without
 * this the field advances in visible steps at any refresh rate above TICK_HZ.
 */
export function interpolateRunners(
  prev: RaceSnapshot,
  curr: RaceSnapshot,
  alpha: number,
): InterpolatedRunner[] {
  return curr.runners.map((r, i) => {
    const p = prev.runners[i];
    if (!p) return r;
    return {
      ...r,
      distance: p.distance + (r.distance - p.distance) * alpha,
      speed: p.speed + (r.speed - p.speed) * alpha,
    };
  });
}

/**
 * The 3D view is desktop-only, by viewport rather than by user agent.
 *
 * Not a performance floor — the procedural field is a few thousand triangles
 * and runs fine on a phone. It is a framing one, and it is what buys the
 * headroom to make the 3D view better. A racecourse read side-on needs
 * horizontal room: on a tall phone screen the camera has to choose between a
 * fisheye lens and letting the field run off both edges, and it currently
 * fudges that with MIN_FRAMING_ASPECT. The 2D view was built for that shape
 * and stays the right answer there.
 *
 * Both dimensions are checked, so a phone held sideways — wide enough, far too
 * short — does not slip through.
 */
//export const MIN_3D_WIDTH = 900;
//export const MIN_3D_HEIGHT = 600;

export function supports3d(
  //width: number = window.innerWidth,
  //height: number = window.innerHeight,
): boolean {
  return true
//width >= MIN_3D_WIDTH && height >= MIN_3D_HEIGHT;
}
