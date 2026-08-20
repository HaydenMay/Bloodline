import * as THREE from 'three';
import { Horse3d } from './horse3d.js';
import {
  buildCourse,
  buildSky,
  FINISH_DISTANCE,
  PERIMETER,
  sample,
  TRACK_HALF_WIDTH,
  wrap,
} from './track3d.js';
import type { Coat, Silks } from '../palette.js';
import type { RaceViewFrame } from '../raceView.js';

export type CameraMode = 'side-on' | 'chase' | 'aerial' | 'head-on';

const BASE_FOV = 42;
const REFERENCE_ASPECT = 1280 / 800;
/**
 * Below this, stop widening the lens. Insisting on the full landscape width on
 * a tall phone pushes the camera into a fisheye and shrinks the horses to
 * specks; past this point a strung-out field may run past the edges instead.
 */
const MIN_FRAMING_ASPECT = 0.9;

function fovFor(aspect: number): number {
  const effective = Math.max(aspect, MIN_FRAMING_ASPECT);
  const rad = THREE.MathUtils.degToRad(BASE_FOV);
  const adjusted = 2 * Math.atan(Math.tan(rad / 2) * (REFERENCE_ASPECT / effective));
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(adjusted), 20, 80);
}

export interface RaceScene3dOptions {
  host: HTMLElement;
  playerHorseId: string;
  totalMetres: number;
  runners: { id: string; coat: Coat; silks: Silks; lane: number }[];
}

/**
 * The 3D race. Owns a WebGL canvas sitting behind the chrome canvas, and reads
 * exactly the same interpolated frame the 2D view does.
 */
export class RaceScene3d {
  cameraMode: CameraMode = 'side-on';

  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sun: THREE.DirectionalLight;
  private readonly horses = new Map<string, Horse3d>();
  private readonly lastDistance = new Map<string, number>();
  private readonly course: { dispose(): void };
  private readonly sky: { dispose(): void };
  private readonly host: HTMLElement;
  private readonly playerHorseId: string;
  private readonly startDistance: number;
  private readonly camTarget = new THREE.Vector3();
  private readonly marker: THREE.Mesh;
  private readonly observer: ResizeObserver;
  private disposed = false;

  constructor(opts: RaceScene3dOptions) {
    this.host = opts.host;
    this.playerHorseId = opts.playerHorseId;

    // Wind the race back from the winning post so it finishes at the line.
    this.startDistance = wrap(FINISH_DISTANCE - opts.totalMetres);

    const sky = new THREE.Color('#8fc4e8');
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 260, 1100);

    const rect = this.host.getBoundingClientRect();
    const aspect = Math.max(0.1, rect.width / Math.max(1, rect.height));
    this.camera = new THREE.PerspectiveCamera(fovFor(aspect), aspect, 0.1, 1600);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Behind the chrome canvas, which the screen keeps drawing the HUD on.
    // Layering lives in style.css, with the matching --overlay class.
    const canvas = this.renderer.domElement;
    canvas.className = 'race-canvas-3d';
    this.host.insertBefore(canvas, this.host.firstChild);

    this.scene.add(new THREE.HemisphereLight('#bfe0ff', '#4a6b3a', 0.85));

    this.sun = new THREE.DirectionalLight('#fff4e0', 2.1);
    this.sun.position.set(40, 70, 25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    // A tight frustum that follows the field keeps shadows crisp instead of
    // smearing one map across a mile of racecourse.
    const shadowCam = this.sun.shadow.camera;
    shadowCam.left = -30;
    shadowCam.right = 30;
    shadowCam.top = 30;
    shadowCam.bottom = -30;
    shadowCam.near = 1;
    shadowCam.far = 200;
    this.scene.add(this.sun, this.sun.target);

    this.course = buildCourse(this.scene);
    this.sky = buildSky(this.scene);

    for (const r of opts.runners) {
      const horse = new Horse3d(r.coat, r.silks);
      this.horses.set(r.id, horse);
      this.scene.add(horse.root);
    }

    // The player's marker, so you can find yourself in a field of eight.
    const markerGeo = new THREE.ConeGeometry(0.45, 0.9, 4);
    const markerMat = new THREE.MeshBasicMaterial({ color: '#f2b13a' });
    this.marker = new THREE.Mesh(markerGeo, markerMat);
    this.marker.rotation.x = Math.PI;
    this.scene.add(this.marker);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.resize();
  }

  private resize(): void {
    if (this.disposed) return;
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = fovFor(aspect);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /** Lane 0 is the rail. Spreads the field across the track's real width. */
  private laneOffset(lane: number): number {
    const usable = TRACK_HALF_WIDTH - 2.2;
    return -usable + (lane / 7) * usable * 1.7;
  }

  render(frame: RaceViewFrame): void {
    if (this.disposed) return;
    const { runners, player, dt } = frame;

    for (const r of runners) {
      const horse = this.horses.get(r.id);
      if (!horse) continue;

      const last = this.lastDistance.get(r.id);
      // Distance covered since the previous frame drives the gait, so the
      // cadence is honest at any refresh rate and through a skipped race.
      const covered = last === undefined ? 0 : Math.max(0, r.distance - last);
      this.lastDistance.set(r.id, r.distance);

      const at = sample(this.startDistance + r.distance, this.laneOffset(r.lane));
      horse.root.position.copy(at.position);
      horse.root.rotation.y = at.heading;
      // Lean into the turns.
      horse.root.rotation.z = THREE.MathUtils.lerp(
        horse.root.rotation.z,
        -at.curvature * r.speed * 0.5,
        1 - Math.exp(-dt * 4),
      );
      horse.update(dt, covered, r.speed, r.effort);

      if (r.id === this.playerHorseId) {
        this.marker.position.set(at.position.x, 2.9 + Math.sin(performance.now() / 260) * 0.1, at.position.z);
      }
    }

    this.updateCamera(frame, dt);
    this.renderer.render(this.scene, this.camera);
    void player;
  }

  private updateCamera(frame: RaceViewFrame, dt: number): void {
    const { runners, player } = frame;

    let lead = -Infinity;
    let tail = Infinity;
    for (const r of runners) {
      if (r.distance > lead) lead = r.distance;
      if (r.distance < tail) tail = r.distance;
    }
    const mid = (lead + tail) / 2;
    const spread = lead - tail;
    const packPoint = sample(this.startDistance + mid, 0).position;

    let desired: THREE.Vector3;
    let lookAt = packPoint.clone().setY(1.15);
    let responsiveness = 3.5;

    switch (this.cameraMode) {
      case 'chase': {
        desired = sample(this.startDistance + player.distance - 13, this.laneOffset(player.lane))
          .position.setY(3.6);
        lookAt = sample(this.startDistance + player.distance + 7, this.laneOffset(player.lane))
          .position.setY(1.6);
        responsiveness = 5;
        break;
      }
      case 'aerial': {
        desired = sample(this.startDistance + mid - 30, 0).position.setY(52 + spread * 0.4);
        responsiveness = 2.2;
        break;
      }
      case 'head-on': {
        // Down the track ahead of the leader, looking back, so the field runs
        // straight at the lens.
        desired = sample(this.startDistance + lead + 38, 0).position.setY(3.2);
        responsiveness = 3;
        break;
      }
      case 'side-on':
      default: {
        // A tracking truck running inside the rail, level with the field —
        // the same read as the 2D view, so the race plays the same way.
        // Eases back as the runners string out so the whole field stays in shot.
        desired = sample(
          this.startDistance + mid + 2,
          -(TRACK_HALF_WIDTH + 9 + spread * 0.38),
        ).position.setY(4.4 + spread * 0.1);
        break;
      }
    }

    const smoothing = 1 - Math.exp(-dt * responsiveness);
    this.camera.position.lerp(desired, smoothing);
    this.camTarget.lerp(lookAt, smoothing);
    this.camera.lookAt(this.camTarget);

    this.sun.position.set(packPoint.x + 40, 70, packPoint.z + 25);
    this.sun.target.position.copy(packPoint);
    this.sun.target.updateMatrixWorld();
  }

  /** Snaps the rig to the field rather than easing in from wherever it was. */
  settleCamera(frame: RaceViewFrame): void {
    for (let i = 0; i < 40; i++) this.updateCamera(frame, 0.1);
  }

  dispose(): void {
    this.disposed = true;
    this.observer.disconnect();
    for (const horse of this.horses.values()) horse.dispose();
    this.horses.clear();
    this.course.dispose();
    this.sky.dispose();
    this.marker.geometry.dispose();
    (this.marker.material as THREE.Material).dispose();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}

export { PERIMETER };
