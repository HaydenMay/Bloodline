import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import type { Coat, Silks } from '../palette.js';

/**
 * The racehorse: a rigged GLB (UniRig skeleton, baked PBR textures) animated
 * procedurally — the same gallop maths the old primitive horse used, applied
 * to bone rotations instead of group transforms.
 *
 * The GLB is fetched and parsed ONCE per session (module cache) and each of
 * the eight runners gets a SkeletonUtils clone, which shares geometry and
 * textures while giving every horse its own skeleton to pose.
 *
 * Bone roles were mapped from the bind-pose hierarchy (see the dump in the
 * commit notes): the model faces +Z — the same convention as the track's
 * `sample()` heading — with forelegs under the chest and hindlegs under the
 * pelvis. The withers sit at y≈1.09 in model units, so the scene is scaled by
 * 1.6/1.09 to land the withers at the game's WITHER_HEIGHT.
 */
const HORSE_URL = new URL('../../assets/3DAssets/horse-rigged.glb', import.meta.url).href;
const WITHER_SCALE = 1.6 / 1.09;

/**
 * Gallop footfall, as a fraction of the stride cycle (transverse gallop).
 * Legs are spread ~25-30% apart so the diagonal pairs don't move in unison.
 * Sequence: hindLeft → hindRight → foreLeft → foreRight (leading leg last).
 */
const LEG_PHASE = { hindLeft: 0.0, hindRight: 0.30, foreLeft: 0.55, foreRight: 0.80 } as const;
/** Metres of ground covered per stride — a real gallop is ~2.4 strides/sec at 21 m/s. */
const STRIDE_METRES = 21 / 2.35;
const TAU = Math.PI * 2;

/** Bone chains, root-first. [0] is embedded in the body and is not rotated. */
const CHAINS = {
  foreLeft: ['Bone_002', 'Bone_032', 'Bone_031', 'Bone_030'],
  foreRight: ['Bone_002', 'Bone_038', 'Bone_037', 'Bone_036'],
  hindLeft: ['Bone_017', 'Bone_016', 'Bone_015', 'Bone_014'],
  hindRight: ['Bone_023', 'Bone_022', 'Bone_021', 'Bone_020'],
  tail: ['Bone_011', 'Bone_010', 'Bone_009', 'Bone_008', 'Bone_007', 'Bone_006'],
} as const;

const ROOT_BONE = 'Bone_000';
const NECK_BASE = 'Bone_026';

/** Parsed GLB, shared by every runner for the whole session. */
let horseAsset: Promise<THREE.Group> | null = null;
function loadHorseScene(): Promise<THREE.Group> {
  horseAsset ??= new GLTFLoader().loadAsync(HORSE_URL).then((g) => g.scene);
  return horseAsset;
}

/**
 * Standard material with an optional grazing-angle sheen, injected via
 * `onBeforeCompile` — shadows, fog and the environment probe all keep
 * working. A coat is mostly read at its silhouette, where light catches the
 * hairs edge-on; without this term the baked coat reads as matte plastic.
 */
function coatMaterial(base: THREE.Material, tint: string, sheen = 0): THREE.MeshStandardMaterial {
  const m = base.clone() as THREE.MeshStandardMaterial;
  m.color = new THREE.Color(tint);
  if (sheen > 0) {
    const sheenColor = { value: new THREE.Color('#fff2df') };
    const sheenStrength = { value: sheen };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uSheenColor = sheenColor;
      shader.uniforms.uSheenStrength = sheenStrength;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          ['uniform vec3 uSheenColor;', 'uniform float uSheenStrength;', 'void main() {'].join('\n'),
        )
        .replace(
          '#include <emissivemap_fragment>',
          [
            '#include <emissivemap_fragment>',
            '{',
            '  float sheenFresnel = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);',
            '  totalEmissiveRadiance += uSheenColor * uSheenStrength * sheenFresnel;',
            '}',
          ].join('\n'),
        );
    };
  }
  return m;
}

/** A bone with its rest transform, so procedural rotation applies as an offset. */
interface Poised {
  bone: THREE.Bone;
  rest: THREE.Quaternion;
}

function poised(bone: THREE.Bone | undefined): Poised | undefined {
  return bone ? { bone, rest: bone.quaternion.clone() } : undefined;
}

/** One leg, in gallop terms. */
interface Leg {
  upper: Poised | undefined;
  lower: Poised | undefined;
  fetlock: Poised | undefined;
  phase: number;
  front: boolean;
}

export class Horse3dRigged {
  readonly root = new THREE.Group();

  /** Visual only, advanced from distance covered so the hooves do not skate. */
  stridePhase = Math.random();

  private readonly disposables: { dispose(): void }[] = [];
  // Assigned from the async load callback, so they cannot be readonly.
  private rootBone: Poised | undefined;
  private neck: Poised | undefined;
  private tail: Poised[] = [];
  private readonly legs: Leg[] = [];
  private disposed = false;
  private ready = false;

  constructor(coat: Coat, _silks: Silks) {
    void loadHorseScene().then((scene) => {
      if (this.disposed) return;
      const horse = skeletonClone(scene);
      horse.scale.setScalar(WITHER_SCALE);
      this.root.add(horse);

      // One baked material for the whole model: tint it by the horse's coat.
      // (The tack tints with the body for now — splitting the material in
      // Blender is the upgrade path if that ever bothers anyone.)
      horse.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = true;
          const tinted = coatMaterial(obj.material as THREE.Material, coat.body, 0.14);
          obj.material = tinted;
          this.disposables.push(tinted);
        }
      });

      const byName = (n: string) => horse.getObjectByName(n) as THREE.Bone | undefined;

      // Build a bone map by traversing — getObjectByName can miss bones in
      // cloned skeletons because SkeletonUtils reparents them.
      const boneMap = new Map<string, THREE.Bone>();
      horse.traverse((obj) => {
        if (obj instanceof THREE.Bone) boneMap.set(obj.name, obj);
      });
      const findBone = (n: string) => boneMap.get(n) ?? byName(n);

      this.rootBone = poised(findBone(ROOT_BONE));
      this.neck = poised(findBone(NECK_BASE));
      this.tail = CHAINS.tail.map((n) => poised(findBone(n))).filter((p): p is Poised => p !== undefined);

      const leg = (names: readonly string[], front: boolean, phase: number): Leg => {
        const u = poised(findBone(names[1]!));
        const l = poised(findBone(names[2]!));
        const f = poised(findBone(names[3]!));
        if (!u || !l) console.warn(`[horse3d] missing bone: upper=${names[1]}=${!!u}, lower=${names[2]}=${!!l}`);
        return { upper: u, lower: l, fetlock: f, phase, front };
      };
      this.legs.push(
        leg(CHAINS.foreLeft, true, LEG_PHASE.foreLeft),
        leg(CHAINS.foreRight, true, LEG_PHASE.foreRight),
        leg(CHAINS.hindLeft, false, LEG_PHASE.hindLeft),
        leg(CHAINS.hindRight, false, LEG_PHASE.hindRight),
      );

      this.ready = true;
    });
  }

  /**
   * Advances the gait. `metresCovered` rather than elapsed time: cadence has
   * to come from ground speed or the hooves skate, which is the single most
   * obvious tell that a running animation is fake.
   */
  update(dt: number, metresCovered: number, speed: number, effort: number): void {
    this.stridePhase = (this.stridePhase + metresCovered / STRIDE_METRES) % 1;
    if (!this.ready) return;
    const theta = this.stridePhase * TAU;

    // How hard the horse is visibly working, 0 standing still to 1 flat out.
    // Legs move at any non-zero speed — a walking horse still has leg motion.
    const intensity = Math.min(1, speed / 21);
    const drive = Math.min(1, Math.max(0, effort));

    // One suspension per stride: the root bone rises and pitches once per
    // cycle. Offsets apply on top of the rest transform, never replacing it.
    if (this.rootBone) {
      const airborne = Math.max(0, Math.sin(theta + 1.1));
      this.rootBone.bone.position.y =
        0.028 * Math.sin(theta * 2) * intensity + 0.07 * airborne * intensity;
      setOffset(this.rootBone, [1, 0, 0], 0.05 * Math.sin(theta + 2.2) * intensity);
    }

    for (const leg of this.legs) {
      const t = theta + leg.phase * TAU;
      // Stance sweeps the leg back; swing carries it forward.
      setOffset(leg.upper, [1, 0, 0], -0.7 * Math.cos(t) * intensity);
      // The knee/hock folds backward while the hoof is off the ground.
      // Negative [1,0,0] rotates the bone tip toward -Z (backward).
      const fold = Math.max(0, -Math.sin(t));
      setOffset(leg.lower, [1, 0, 0], -1.5 * fold * intensity);
      if (leg.fetlock) {
        setOffset(leg.fetlock, [1, 0, 0], -0.35 * fold * intensity);
      }
    }

    // The neck pumps in counter-phase and reaches further forward the harder
    // the horse is asked — the give-away that reads as effort.
    if (this.neck) {
      setOffset(this.neck, [1, 0, 0], (0.1 + 0.12 * drive) * intensity + 0.11 * Math.sin(theta + 0.4) * intensity);
    }

    // Tail streams out behind, each segment lagging the one before it.
    this.tail.forEach((seg, i) => {
      const lag = theta - i * 0.5;
      const base = i === 0 ? 0.38 + 0.44 * intensity : 0.04 + 0.025 * intensity;
      setOffset(seg, [1, 0, 0], base + 0.06 * Math.sin(lag) * intensity, [0, 0, 1], 0.06 * Math.sin(lag * 0.7 + i) * intensity);
    });

    void dt;
  }

  dispose(): void {
    this.disposed = true;
    for (const d of this.disposables) d.dispose();
  }
}

/** Rotate a poised bone to rest * offset(s), without allocating per frame. */
const _axis = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
function setOffset(
  p: Poised | undefined,
  axisA: [number, number, number],
  angleA: number,
  axisB?: [number, number, number],
  angleB = 0,
): void {
  if (!p) return;
  _axis.set(axisA[0], axisA[1], axisA[2]);
  _qa.setFromAxisAngle(_axis, angleA);
  if (axisB) {
    _axis.set(axisB[0], axisB[1], axisB[2]);
    _qb.setFromAxisAngle(_axis, angleB).multiply(_qa);
    _qa.copy(_qb);
  }
  p.bone.quaternion.copy(p.rest).multiply(_qa);
}
