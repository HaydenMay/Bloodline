import type { Coat, Silks } from './palette.js';
import { coatFor } from './palette.js';
import type { RaceView, RaceViewFrame } from './raceView.js';
import type { CameraMode, RaceScene3d } from './three/raceScene3d.js';

export interface RaceView3dOptions {
  host: HTMLElement;
  playerHorseId: string;
  silksFor: Map<string, Silks>;
  coatOf: Map<string, Coat | string>;
  totalMetres: number;
  lanes: Map<string, number>;
  horseIds: string[];
  /** Opening camera. Side-on by default, matching how the 2D view reads. */
  cameraMode?: CameraMode | undefined;
}

export interface RaceView3d extends RaceView {
  setCameraMode(mode: CameraMode): void;
}

/**
 * The 3D race view.
 *
 * Three.js is a third of the bundle on its own, and a player who never turns
 * 3D on should not pay for it — so it is pulled in on demand and the view
 * draws nothing until it lands. That gap is covered by the pre-race card,
 * which is on screen for as long as it takes to press START RACE.
 */
export function createRaceView3d(opts: RaceView3dOptions): RaceView3d {
  let scene: RaceScene3d | null = null;
  let disposed = false;
  let pendingMode: CameraMode = opts.cameraMode ?? 'side-on';
  let settled = false;

  void import('./three/raceScene3d.js').then(({ RaceScene3d: Scene3d }) => {
    if (disposed) return;
    scene = new Scene3d({
      host: opts.host,
      playerHorseId: opts.playerHorseId,
      totalMetres: opts.totalMetres,
      runners: opts.horseIds.map((id) => {
        const raw = opts.coatOf.get(id);
        return {
          id,
          coat: typeof raw === 'string' ? coatFor(raw) : raw!,
          silks: opts.silksFor.get(id)!,
          lane: opts.lanes.get(id) ?? 0,
        };
      }),
    });
    scene.cameraMode = pendingMode;
  });

  return {
    render(frame: RaceViewFrame): void {
      if (!scene) return;
      if (!settled) {
        settled = true;
        scene.settleCamera(frame);
      }
      scene.render(frame);
    },
    setCameraMode(mode: CameraMode): void {
      pendingMode = mode;
      if (scene) scene.cameraMode = mode;
    },
    dispose(): void {
      disposed = true;
      scene?.dispose();
      scene = null;
    },
  };
}
