import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Horse3dRigged } from './horse3dRigged.js';
import { GradeShader } from './gradeShader.js';
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
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private readonly envTarget: THREE.WebGLRenderTarget;
  private readonly sun: THREE.DirectionalLight;
  private readonly horses = new Map<string, Horse3dRigged>();
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
    // Capped below native on high-DPI screens: the fullscreen post passes
    // below resample the frame several times, and past ~1.75 the extra texels
    // buy nothing visible at broadcast distance while costing real frame time.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Raw linear output is what makes untonemapped WebGL read as plastic: the
    // sunlit side of a white horse clips flat and the shadowed side crushes to
    // one dead value, so nothing has any roll-off. ACES gives the highlights
    // somewhere to go.
    //
    // The curve costs contrast, because the palette was authored against no
    // curve at all. Paying that back with exposure only lifts the whole frame
    // into haze — it comes back from the lighting instead: a harder sun and a
    // dimmer sky, which is what a bright afternoon actually looks like.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    // Behind the chrome canvas, which the screen keeps drawing the HUD on.
    // Layering lives in style.css, with the matching --overlay class.
    const canvas = this.renderer.domElement;
    canvas.className = 'race-canvas-3d';
    this.host.insertBefore(canvas, this.host.firstChild);

    // Post chain: scene → bloom → tone map → grade.
    //
    // The scene is rendered in linear HDR into the composer's buffers and the
    // OutputPass applies the renderer's ACES curve plus the sRGB conversion,
    // so bloom reads the HDR highlights before the tone curve rolls them off —
    // which is what keeps the glow soft instead of blown out. The grade pass
    // runs last, in display space, where a colourist would work.
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(rect.width, rect.height),
      0.35,
      0.5,
      0.85,
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.grade.renderToScreen = true;
    this.composer.addPass(this.grade);

    // Image-based lighting, from a procedural room probe — no asset, no load.
    //
    // Hemisphere light only fills the diffuse term; with nothing in
    // `scene.environment` a PBR material has nothing to reflect, so roughness
    // does almost nothing visible and every coat reads as matte plastic. The
    // probe is deliberately dim (the sun stays the key) — it exists to put a
    // believable ambient specular on everything, which is most of what
    // separates "shaded" from "lit".
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.4;
    pmrem.dispose();
    room.dispose();

    this.scene.add(new THREE.HemisphereLight('#bfe0ff', '#4a6b3a', 0.55));

    // Cool separation light from behind the stands, opposite the sun. It casts
    // no shadow and does almost nothing to surfaces facing the camera — its
    // whole job is a bright edge on the far side of each horse so they read
    // against the turf and each other instead of merging into the field.
    const rim = new THREE.DirectionalLight('#cfe4ff', 0.9);
    rim.position.set(-45, 30, -25);
    rim.target.position.set(0, 1, 0);
    this.scene.add(rim, rim.target);

    this.sun = new THREE.DirectionalLight('#fff4e0', 3.1);
    this.sun.position.set(40, 70, 25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    // The default bias leaves the horses' own shadows crawling on their legs.
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
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
      const horse = new Horse3dRigged(r.coat, r.silks);
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
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
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
      horse.root.position.y += 1.6;
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
    this.grade.uniforms['uTime']!.value = performance.now() / 1000;
    this.composer.render();
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

    /**
     * Every camera is anchored on the PLAYER, not on the middle of the field.
     *
     * Framing the pack looks right only while the player is in it: the moment
     * they drop off the back or go clear, the shot stays with the bunch and
     * the horse you are actually riding walks out of frame. Biasing a little
     * toward the pack keeps the rivals in shot without letting them steal the
     * camera.
     */
    const focus = player.distance + (mid - player.distance) * 0.22;
    /** How far the player sits from the middle of the field, in metres. */
    const offPace = Math.abs(player.distance - mid);
    const packPoint = sample(this.startDistance + focus, 0).position;
    const playerPoint = sample(
      this.startDistance + player.distance,
      this.laneOffset(player.lane),
    ).position;

    let desired: THREE.Vector3;
    let lookAt = playerPoint.clone().setY(1.2);
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
        desired = sample(this.startDistance + focus - 30, 0).position.setY(52 + spread * 0.4);
        responsiveness = 2.2;
        break;
      }
      case 'head-on': {
        // Down the track ahead of the leader, looking back, so the field runs
        // straight at the lens — but still framed on the player behind it.
        desired = sample(this.startDistance + lead + 38, 0).position.setY(3.2);
        responsiveness = 3;
        break;
      }
      case 'side-on':
      default: {
        // A tracking truck running inside the rail, level with the field —
        // the same read as the 2D view, so the race plays the same way.
        //
        // Held tight on the player rather than on the pack, and pulled back
        // only by how far off the pace they actually are. Keying the pull-back
        // to the field's full spread instead meant one runaway leader or one
        // tailed-off backmarker shoved the camera miles out and shrank the
        // horse you are riding to nothing.
        // Sat slightly AHEAD of the player along the track, so they ride into
        // frame from the left with the ground they are running at open in
        // front of them. Anchored behind instead, the shot trails the horse
        // and fills the screen with track already covered.
        desired = sample(
          this.startDistance + player.distance + 9,
          -(TRACK_HALF_WIDTH + 9 + offPace * 0.3),
        ).position.setY(4.4 + offPace * 0.08);
        break;
      }
    }

    // The camera BODY eases — that lag is what makes the move feel filmed
    // rather than welded on. Its AIM does not: sharing one smoothing meant the
    // look target trailed a horse running at 17 m/s, so the player drifted off
    // toward the edge of frame exactly when the racing got interesting.
    this.camera.position.lerp(desired, 1 - Math.exp(-dt * responsiveness));
    this.camTarget.lerp(lookAt, 1 - Math.exp(-dt * responsiveness * 3));
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
    this.composer.dispose();
    this.envTarget.dispose();
    this.renderer.dispose();
  }
}

export { PERIMETER };
