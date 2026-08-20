import * as THREE from 'three';
import type { Coat, Silks } from '../palette.js';

/**
 * A horse built from primitives and animated procedurally — no rigged asset,
 * no keyframes. Proportions are taken from `src/assets/racer.png`, the 24-frame
 * gallop reference: a thoroughbred is long in the leg (ground to elbow is over
 * half its height at the withers), deep through the girth, and at racing pace
 * carries its neck low and stretched rather than upright.
 *
 * Metres throughout, matching the simulation. There is no conversion boundary
 * anywhere in the game (REBUILD.md §3).
 */

/**
 * Leg segments. A thoroughbred stands about 1.6 m at the withers with the
 * elbow a shade under a metre off the ground — legs are roughly 58% of its
 * height, not the two-thirds a first pass tends to draw. Longer than this and
 * the silhouette reads as a deer.
 */
const UPPER_LEG = 0.47;
const LOWER_LEG = 0.41;
const HOOF = 0.06;
/** Derived, so the hooves always land exactly on the ground plane. */
const SHOULDER_Y = UPPER_LEG + LOWER_LEG + HOOF;

/** Metres of ground covered per stride — a real gallop is about three body lengths. */
export const STRIDE_METRES = 2.47 * 3;

const TAU = Math.PI * 2;

/**
 * Gallop footfall, as a fraction of the stride cycle.
 *
 * A transverse gallop lands the two hind feet close together, then the two
 * fore, then a suspension phase with all four off the ground. Spacing the
 * pairs like this is what separates it from a canter or a trot.
 */
const LEG_PHASE = {
  hindLeft: 0.0,
  hindRight: 0.12,
  foreLeft: 0.48,
  foreRight: 0.6,
} as const;

function mat(color: string, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
}

function ball(material: THREE.Material, sx: number, sy: number, sz: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), material);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

function limb(
  material: THREE.Material,
  topRadius: number,
  bottomRadius: number,
  length: number,
): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(topRadius, bottomRadius, length, 9),
    material,
  );
}

interface Leg {
  upper: THREE.Group;
  lower: THREE.Group;
  phase: number;
  front: boolean;
}

export class Horse3d {
  readonly root = new THREE.Group();

  private readonly body = new THREE.Group();
  private readonly neck = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly tail: THREE.Group[] = [];
  private readonly legs: Leg[] = [];
  private readonly jockey = new THREE.Group();
  private readonly jockeyTorso = new THREE.Group();
  private readonly neckBase: number;
  private readonly seatY: number;
  private readonly disposables: { dispose(): void }[] = [];

  /** Visual only, advanced from distance covered so the hooves do not skate. */
  stridePhase = Math.random();

  constructor(coat: Coat, silks: Silks) {
    const hide = mat(coat.body);
    const hair = mat(coat.hair, 0.9);
    const points = mat(coat.points, 0.8);
    const silksMat = mat(silks.primary, 0.7);
    const capMat = mat(silks.secondary, 0.6);
    const skin = mat('#6b4a37', 0.9);
    const bootMat = mat('#241d18', 0.6);
    const breeches = mat('#f4f1ea', 0.75);
    for (const m of [hide, hair, points, silksMat, capMat, skin, bootMat, breeches]) {
      this.disposables.push(m);
    }

    this.root.add(this.body);

    // Girth deep and low behind the shoulder, barrel and rump riding
    // progressively higher — that rising belly line is the tuck-up, and
    // without it the torso reads as one round barrel rather than a racehorse.
    // Topline and underline both matter. The withers are the highest point of
    // a horse, the back dips behind them and the croup comes back up just
    // short — a first pass that simply raised each mass toward the tail gave
    // it an uphill spine, which is a cow. Underneath, the girth hangs lowest
    // at the chest and rises toward the flank: the tuck-up.
    const chest = ball(hide, 0.245, 0.37, 0.38);
    chest.position.set(0, SHOULDER_Y + 0.24, 0.48);
    const barrel = ball(hide, 0.235, 0.345, 0.56);
    barrel.position.set(0, SHOULDER_Y + 0.22, -0.02);
    const rump = ball(hide, 0.245, 0.34, 0.38);
    rump.position.set(0, SHOULDER_Y + 0.25, -0.54);
    this.body.add(chest, barrel, rump);

    // Neck: short, thick at the base, and raked well forward. An upright neck
    // reads as a llama; the reference sheet carries it barely above horizontal.
    this.neckBase = 0.92;
    this.neck.position.set(0, SHOULDER_Y + 0.44, 0.62);
    this.neck.rotation.x = this.neckBase;
    const neckMesh = limb(hide, 0.125, 0.215, 0.64);
    neckMesh.position.y = 0.32;
    this.neck.add(neckMesh);
    this.body.add(this.neck);

    this.head.position.y = 0.64;
    this.head.rotation.x = -this.neckBase + 0.52;
    // Skull, jowl and muzzle as three masses. One tapered lump reads as a
    // beak from trackside; a horse's head has a wide cheek and a blunt nose.
    const skull = ball(hide, 0.115, 0.16, 0.22);
    skull.position.set(0, 0.035, 0.02);
    const jowl = ball(hide, 0.125, 0.14, 0.14);
    jowl.position.set(0, -0.045, -0.02);
    const muzzle = ball(points, 0.092, 0.108, 0.17);
    muzzle.position.set(0, -0.055, 0.26);
    this.head.add(skull, jowl, muzzle);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.15, 6), points);
      ear.position.set(side * 0.062, 0.18, -0.03);
      ear.rotation.x = -0.15;
      this.head.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat(coat.fixed, 0.3));
      eye.position.set(side * 0.082, 0.055, 0.11);
      this.head.add(eye);
    }
    this.neck.add(this.head);

    // Mane laid back along the crest, not standing up off it.
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.075 - t * 0.014, 0.26, 5), hair);
      tuft.position.set(0, 0.06 + t * 0.5, -0.15 + t * 0.02);
      tuft.rotation.x = -2.05;
      tuft.scale.x = 0.72;
      this.neck.add(tuft);
    }

    // Tail: a short chain so it can stream and ripple behind.
    let parent: THREE.Group = this.body;
    let origin = new THREE.Vector3(0, SHOULDER_Y + 0.42, -0.86);
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.copy(origin);
      // Longer than the joint spacing so segments overlap rather than reading
      // as a chain of separate sticks.
      const mesh = limb(hair, 0.055 - i * 0.007, 0.085 - i * 0.007, 0.2);
      mesh.position.y = -0.09;
      seg.add(mesh);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
      origin = new THREE.Vector3(0, -0.145, 0);
    }

    const legSpec = [
      { x: -0.145, z: 0.44, front: true, phase: LEG_PHASE.foreLeft },
      { x: 0.145, z: 0.44, front: true, phase: LEG_PHASE.foreRight },
      { x: -0.155, z: -0.5, front: false, phase: LEG_PHASE.hindLeft },
      { x: 0.155, z: -0.5, front: false, phase: LEG_PHASE.hindRight },
    ];

    for (const spec of legSpec) {
      const upper = new THREE.Group();
      upper.position.set(spec.x, SHOULDER_Y, spec.z);
      const upperMesh = limb(
        hide,
        spec.front ? 0.062 : 0.072,
        spec.front ? 0.095 : 0.125,
        UPPER_LEG,
      );
      upperMesh.position.y = -UPPER_LEG / 2;
      upper.add(upperMesh);

      const lower = new THREE.Group();
      lower.position.y = -UPPER_LEG;
      const lowerMesh = limb(points, 0.036, 0.058, LOWER_LEG);
      lowerMesh.position.y = -LOWER_LEG / 2;
      lower.add(lowerMesh);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.04, HOOF, 7), mat('#2a2521', 0.6));
      hoof.position.y = -LOWER_LEG - HOOF / 2;
      lower.add(hoof);

      upper.add(lower);
      this.body.add(upper);
      this.legs.push({ upper, lower, phase: spec.phase, front: spec.front });
    }

    // Jockey, folded right down over the withers. In the reference the rider is
    // small and very compact — knees up, back flat, head beside the neck — not
    // sitting upright the way a hack rider does.
    this.seatY = SHOULDER_Y + 0.66;
    this.jockey.position.set(0, this.seatY, 0.12);
    this.jockeyTorso.rotation.x = 0.95;
    const seat = ball(silksMat, 0.135, 0.11, 0.13);
    seat.position.set(0, 0, -0.04);
    const torso = ball(silksMat, 0.13, 0.19, 0.12);
    torso.position.y = 0.13;
    this.jockeyTorso.add(seat, torso);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.35, 0.05);
    headGroup.rotation.x = -0.85;
    const jHead = new THREE.Mesh(new THREE.SphereGeometry(0.083, 8, 6), skin);
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.096, 9, 6, 0, TAU, 0, Math.PI * 0.62),
      capMat,
    );
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.09), capMat);
    peak.position.set(0, 0.02, 0.1);
    headGroup.add(jHead, helmet, peak);
    this.jockeyTorso.add(headGroup);

    for (const side of [-1, 1]) {
      const arm = limb(silksMat, 0.025, 0.032, 0.29);
      arm.position.set(side * 0.15, 0.08, 0.27);
      arm.rotation.x = 2.16;
      this.jockey.add(arm);

      const thigh = limb(breeches, 0.036, 0.048, 0.2);
      thigh.position.set(side * 0.185, -0.08, 0.1);
      thigh.rotation.x = 2.03;
      this.jockey.add(thigh);

      const boot = limb(bootMat, 0.045, 0.052, 0.24);
      boot.position.set(side * 0.2, -0.26, 0.14);
      boot.rotation.x = 0.5;
      this.jockey.add(boot);
    }

    this.jockey.add(this.jockeyTorso);
    this.body.add(this.jockey);

    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        this.disposables.push(obj.geometry);
      }
    });
  }

  /**
   * Advances the gait.
   *
   * `metresCovered` rather than elapsed time: cadence has to come from ground
   * speed or the hooves skate, which is the single most obvious tell that a
   * running animation is fake.
   */
  update(dt: number, metresCovered: number, speed: number, effort: number): void {
    this.stridePhase = (this.stridePhase + metresCovered / STRIDE_METRES) % 1;
    const theta = this.stridePhase * TAU;

    // How hard the horse is visibly working, 0 at a walk to 1 flat out.
    const intensity = Math.min(1, Math.max(0, (speed - 6) / 10));
    const drive = Math.min(1, Math.max(0, effort));

    // A gallop has one suspension per stride, so the body rises and falls once
    // per cycle — a trot would be twice — with a matching fore/aft pitch rock.
    const airborne = Math.max(0, Math.sin(theta + 1.1));
    this.body.position.y = (0.028 * Math.sin(theta * 2) + 0.07 * airborne) * intensity;
    this.body.rotation.x = 0.05 * Math.sin(theta + 2.2) * intensity;

    for (const leg of this.legs) {
      const t = theta + leg.phase * TAU;
      // Stance sweeps the leg back and drives; swing carries it forward again.
      leg.upper.rotation.x = -1.15 * Math.cos(t) * intensity;
      // The joint only folds while the hoof is off the ground, and folds
      // backwards at the knee up front, forwards at the hock behind — which
      // is what gives a horse its cocked back legs.
      const fold = Math.max(0, -Math.sin(t));
      const rest = leg.front ? 0.12 : -0.34;
      leg.lower.rotation.x = rest + (leg.front ? 1.55 : -1.3) * fold * intensity;
    }

    // The head and neck pump in counter-phase with the body, and reach further
    // forward the harder the horse is asked — the give-away that reads as effort.
    this.neck.rotation.x =
      this.neckBase + (0.1 + 0.12 * drive) * intensity + 0.11 * Math.sin(theta + 0.4) * intensity;
    this.head.rotation.x =
      -this.neckBase + 0.32 - 0.12 * intensity - 0.08 * Math.sin(theta + 0.9) * intensity;

    // Tail streams out behind, each segment lagging the one before it.
    this.tail.forEach((seg, i) => {
      const lag = theta - i * 0.5;
      const base = i === 0 ? 0.38 + 0.44 * intensity : 0.04 + 0.025 * intensity;
      seg.rotation.x = base + 0.06 * Math.sin(lag) * intensity;
      seg.rotation.z = 0.06 * Math.sin(lag * 0.7 + i) * intensity;
    });

    // The rider rides the motion out of phase with the horse, and folds lower
    // the harder it is driving.
    this.jockeyTorso.rotation.x = 0.95 + 0.12 * drive + 0.08 * Math.sin(theta + 3) * intensity;
    this.jockey.position.y = this.seatY + 0.03 * Math.sin(theta + 2.4) * intensity;

    void dt;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
