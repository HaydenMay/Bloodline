import * as THREE from 'three';
import type { Coat, Silks } from '../palette.js';

/**
 * A horse built from primitives and animated procedurally — no rigged asset,
 * no keyframes.
 *
 * Every dimension below is derived from WITHER_HEIGHT by a conformation ratio,
 * rather than being a number that looked right in a screenshot. Judging
 * proportion by eye is what produced the deer and the cow this model has
 * already been through: each fix was plausible on its own and the whole drifted
 * anyway, because nothing tied the parts to each other.
 *
 * The ratios are standard thoroughbred conformation. The two that do the most
 * work are DEPTH and FORELEG, which sum to 1: the bottom of the girth sits at
 * the elbow, so a horse is exactly half body and half leg. Get that split wrong
 * in either direction and no amount of detail rescues the silhouette.
 *
 * Metres throughout, matching the simulation. There is no conversion boundary
 * anywhere in the game (REBUILD.md §3).
 */
const WITHER_HEIGHT = 1.6;
/** Girth bottom to withers. Half the horse. */
const DEPTH = 0.48 * WITHER_HEIGHT;
/** Ground to elbow. The other half. */
const FORELEG = 0.52 * WITHER_HEIGHT;
/** Point of shoulder to point of buttock. A horse is very nearly square. */
const TRUNK = 1.02 * WITHER_HEIGHT;
/** Across the barrel at its widest. */
const BARREL_WIDTH = 0.3 * WITHER_HEIGHT;

/**
 * The elbow, and so the floor of the body. Stated, not derived.
 *
 * It used to be the sum of the leg segments, on the reasoning that this
 * guaranteed the hooves met the ground. It did not: below the cannon come a
 * fetlock, a pastern and a hoof, each placed by its own offset, and those
 * offsets were never in the sum — so the horses stood 6 cm into the turf and
 * every height measured off SHOULDER_Y was quietly short. The segments are now
 * fractions OF this height and are checked to close.
 */
const SHOULDER_Y = FORELEG;
/** Fetlock centre down to hoof centre. */
const PASTERN_DROP = FORELEG * 0.09;
const HOOF = FORELEG * 0.075;
/** What is left for the two long bones, split as forearm : cannon. */
const CANNON_AND_FOREARM = FORELEG - PASTERN_DROP - HOOF / 2;
const UPPER_LEG = CANNON_AND_FOREARM * 0.53;
const LOWER_LEG = CANNON_AND_FOREARM * 0.47;

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

/**
 * Smooth-shaded, and denser than a phone would want.
 *
 * The 3D view is gated to desktop viewports (see `supports3d`), and this is
 * what that gate is for. Flat shading on a ten-segment sphere is a style, and
 * a defensible one, but it is not the brief: a horse faceted like a gemstone
 * cannot look real however correct its proportions are. A horse is about 1.5k
 * triangles at these counts and there are eight of them — nothing, next to the
 * turf and the crowd.
 */
function mat(color: string, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function ball(material: THREE.Material, sx: number, sy: number, sz: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
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
    new THREE.CylinderGeometry(topRadius, bottomRadius, length, 16),
    material,
  );
}

/**
 * One continuous surface through a series of cross-sections down the spine.
 *
 * The torso used to be three overlapping ellipsoids — chest, barrel, rump.
 * Faceted, that reads as a horse, because the facets hide the joins. Smooth,
 * it reads as three balls in a row: the eye follows the shading and finds two
 * seams where a horse has none.
 *
 * Each station is an ellipse: a top and a bottom, so the TOPLINE and the
 * UNDERLINE are stated separately and can be shaped against each other. That
 * is the whole point — a horse's back and its belly are not offsets of one
 * centre line. The withers are the high point, the back dips behind them, the
 * croup comes back up just short; underneath, the girth hangs lowest and the
 * belly rises to the flank.
 */
interface Station {
  /** Along the spine. Positive is toward the nose. */
  z: number;
  top: number;
  bottom: number;
  halfWidth: number;
}

/** Catmull-Rom through the control values, with the ends held. */
function spline(vals: number[], t: number): number {
  const n = vals.length - 1;
  const i = Math.min(n - 1, Math.floor(t * n));
  const f = t * n - i;
  const p = (k: number): number => vals[Math.min(n, Math.max(0, k))]!;
  const [a, b, c, d] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
  return (
    0.5 *
    (2 * b +
      (c - a) * f +
      (2 * a - 5 * b + 4 * c - d) * f * f +
      (-a + 3 * b - 3 * c + d) * f * f * f)
  );
}

interface LoftOptions {
  radial?: number;
  rings?: number;
  /** Half-angle about the spine. Less than PI leaves an open strip, no caps. */
  arc?: number;
  /** Widen every ring, for a shell that sits ON the surface it was cut from. */
  inflate?: number;
}

function loft(material: THREE.Material, control: Station[], opts: LoftOptions = {}): THREE.Mesh {
  const { radial = 22, rings = 46, arc = Math.PI, inflate = 1 } = opts;
  const closed = arc >= Math.PI;
  const perRing = closed ? radial : radial + 1;
  // Straight runs between control stations leave the topline creased at every
  // one of them. Splining through instead means the stations say what shape the
  // horse is and the curve does the joining, which is the difference between a
  // back and a series of ramps.
  const zs = control.map((c) => c.z);
  const tops = control.map((c) => c.top);
  const bots = control.map((c) => c.bottom);
  const ws = control.map((c) => c.halfWidth);
  const stations: Station[] = [];
  for (let r = 0; r < rings; r++) {
    const t = r / (rings - 1);
    stations.push({
      z: spline(zs, t),
      top: spline(tops, t),
      bottom: spline(bots, t),
      halfWidth: Math.max(0, spline(ws, t)),
    });
  }
  const pos: number[] = [];
  const index: number[] = [];
  for (const s of stations) {
    const cy = (s.top + s.bottom) / 2;
    const ry = (s.top - s.bottom) / 2;
    for (let i = 0; i < perRing; i++) {
      const a = closed ? (i / radial) * TAU : -arc + (i / radial) * arc * 2;
      // A rib cage is not a tube. It is widest low through the barrel and
      // draws in to a ridge over the spine — which is what gives a horse a
      // topline you can see from behind instead of a rolling-pin back.
      const crest = Math.max(0, Math.cos(a));
      const w = s.halfWidth * (1 - 0.34 * crest ** 1.4) * inflate;
      pos.push(Math.sin(a) * w, cy + Math.cos(a) * ry, s.z);
    }
  }
  for (let k = 0; k < stations.length - 1; k++) {
    for (let i = 0; i < (closed ? radial : radial); i++) {
      const a = k * perRing + i;
      const b = k * perRing + ((i + 1) % perRing);
      index.push(a, b, a + perRing, b, b + perRing, a + perRing);
    }
  }
  // Flat caps at each end. Both sit inside something else — the tail dock
  // behind, the neck in front — so they are never actually seen.
  if (closed) {
    const capStart = pos.length / 3;
    for (const [n, s] of [stations[0]!, stations[stations.length - 1]!].entries()) {
      pos.push(0, (s.top + s.bottom) / 2, s.z);
      const centre = capStart + n;
      const ring = n === 0 ? 0 : (stations.length - 1) * perRing;
      for (let i = 0; i < radial; i++) {
        const a = ring + i;
        const b = ring + ((i + 1) % perRing);
        if (n === 0) index.push(centre, a, b);
        else index.push(centre, b, a);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
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
    const halfWidth = BARREL_WIDTH / 2;
    // z runs -TRUNK/2 at the point of buttock to +TRUNK/2 at the point of
    // shoulder; heights are above SHOULDER_Y, which is the elbow and so the
    // floor of the body. The withers are the one station at full DEPTH.
    const at = (
      z: number,
      top: number,
      bottom: number,
      w: number,
    ): Station => ({
      z: TRUNK * z,
      top: SHOULDER_Y + DEPTH * top,
      bottom: SHOULDER_Y + DEPTH * bottom,
      halfWidth: halfWidth * w,
    });
    const TORSO: Station[] = [
      at(-0.5, 0.72, 0.46, 0.2),
      at(-0.455, 0.87, 0.3, 0.58),
      at(-0.4, 0.95, 0.2, 0.86),
      at(-0.32, 0.99, 0.15, 0.97),
      at(-0.24, 0.995, 0.13, 1.0),
      at(-0.14, 0.97, 0.115, 0.96),
      at(-0.02, 0.955, 0.055, 0.97),
      at(0.14, 0.965, 0.005, 0.96),
      at(0.27, 1.0, 0.01, 0.88),
      at(0.37, 0.975, 0.09, 0.76),
      at(0.45, 0.9, 0.25, 0.54),
      at(0.5, 0.79, 0.44, 0.26),
    ];
    const torso = loft(hide, TORSO);
    this.body.add(torso);

    // Neck: short, thick at the base, and raked well forward. An upright neck
    // reads as a llama; the reference sheet carries it barely above horizontal.
    this.neckBase = 0.92;
    this.neck.position.set(0, SHOULDER_Y + DEPTH * 0.78, TRUNK * 0.343);
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

    // Tail: a short bony dock carrying a full plume of hair.
    //
    // A chain of evenly tapering cylinders reads as an aerial, because a real
    // tail is not a rod — it is a stubby dock with hide on it and then a mass
    // of hair much thicker than the dock itself, which spreads rather than
    // narrows.
    let parent: THREE.Group = this.body;
    let origin = new THREE.Vector3(0, SHOULDER_Y + DEPTH * 0.72, -TRUNK * 0.49);
    // r0 is the end nearest the horse, r1 the far end. The plume swells just
    // past the dock and then tapers to a point; a first pass had every segment
    // widening toward the tip, which gave it a club on the end.
    const TAIL = [
      { r0: 0.052, r1: 0.062, len: 0.15, hide: true },
      { r0: 0.078, r1: 0.084, len: 0.22, hide: false },
      { r0: 0.084, r1: 0.07, len: 0.22, hide: false },
      { r0: 0.07, r1: 0.05, len: 0.22, hide: false },
      { r0: 0.05, r1: 0.022, len: 0.2, hide: false },
    ];
    for (const [i, spec] of TAIL.entries()) {
      const seg = new THREE.Group();
      seg.position.copy(origin);
      const mesh = limb(spec.hide ? hide : hair, spec.r0, spec.r1, spec.len);
      mesh.position.y = -spec.len / 2 + 0.01;
      // Flattened side to side: a tail hangs as a curtain, not a sausage.
      mesh.scale.x = spec.hide ? 1 : 0.66;
      seg.add(mesh);
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
      origin = new THREE.Vector3(0, -(spec.len - 0.05), 0);
      void i;
    }

    const legSpec = [
      { x: -0.145, z: TRUNK * 0.318, front: true, phase: LEG_PHASE.foreLeft },
      { x: 0.145, z: TRUNK * 0.318, front: true, phase: LEG_PHASE.foreRight },
      { x: -0.155, z: -TRUNK * 0.282, front: false, phase: LEG_PHASE.hindLeft },
      { x: 0.155, z: -TRUNK * 0.282, front: false, phase: LEG_PHASE.hindRight },
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
      // Below the knee a horse is slim but not spindly: the cannon carries the
      // flexor tendons behind it, so it reads as a flat column, and it ends in
      // a distinct fetlock rather than tapering into the hoof. Drawn as a bare
      // taper it looks like wire.
      const lowerMesh = limb(points, 0.05, 0.072, LOWER_LEG);
      lowerMesh.position.y = -LOWER_LEG / 2;
      lower.add(lowerMesh);

      const fetlock = ball(points, 0.062, 0.055, 0.062);
      fetlock.position.y = -LOWER_LEG;
      lower.add(fetlock);

      const pastern = limb(points, 0.045, 0.05, PASTERN_DROP);
      pastern.position.y = -LOWER_LEG - PASTERN_DROP * 0.55;
      pastern.rotation.x = -0.25;
      lower.add(pastern);

      const hoof = new THREE.Mesh(
        new THREE.CylinderGeometry(0.052, 0.06, HOOF, 8),
        mat('#2a2521', 0.6),
      );
      hoof.position.y = -LOWER_LEG - PASTERN_DROP;
      lower.add(hoof);

      upper.add(lower);
      this.body.add(upper);
      this.legs.push({ upper, lower, phase: spec.phase, front: spec.front });
    }

    // ---- Tack ------------------------------------------------------------
    //
    // A racing saddle is tiny, but the number cloth under it is not, and from
    // trackside the cloth and the girth are most of what says "racehorse"
    // rather than "loose horse". Without them the rider appears to be sitting
    // directly on the animal.
    const leather = mat('#5a3a22', 0.7);
    this.disposables.push(leather);

    const clothTop = ball(silksMat, 0.25, 0.055, 0.32);
    clothTop.position.set(0, SHOULDER_Y + DEPTH * 0.937, 0.03);
    this.body.add(clothTop);

    // Cut from the torso's own cross-sections and inflated a hair, so it lies
    // ON the horse instead of near it. A shape with its own idea of the barrel
    // — a box, a lens — floats or sinks depending where you put it, because
    // the barrel changes width along its whole length and the shape does not.
    // An open strip has no inside, so it is drawn from both sides — otherwise
    // whichever way the winding came out, one flank of the horse is bare.
    const clothMat = mat(silks.primary, 0.7);
    clothMat.side = THREE.DoubleSide;
    this.disposables.push(clothMat);
    const cloth = loft(clothMat, TORSO.slice(5, 9), { arc: 2.0, inflate: 1.05, rings: 22 });
    this.body.add(cloth);

    const saddle = ball(leather, 0.16, 0.06, 0.21);
    saddle.position.set(0, SHOULDER_Y + DEPTH * 1.015, 0.06);
    this.body.add(saddle);

    // Girth, round the barrel just behind the elbow.
    const girthGeo = new THREE.TorusGeometry(0.3, 0.022, 6, 20);
    const girth = new THREE.Mesh(girthGeo, leather);
    this.disposables.push(girthGeo);
    girth.position.set(0, SHOULDER_Y + DEPTH * 0.5, 0.14);
    girth.scale.set(halfWidth / 0.3, DEPTH * 0.5 / 0.3, 1);
    this.body.add(girth);

    // ---- Jockey ------------------------------------------------------------
    //
    // Built as hips, back, shoulders and jointed limbs rather than one ovoid.
    // A single stacked pair of spheres has no shoulder line and no elbow, and
    // at any size reads as a bean in silks. Crouched in the irons: seat off
    // the saddle, back flat and forward, knees high, hands down at the withers.
    this.seatY = SHOULDER_Y + DEPTH * 1.132;
    this.jockey.position.set(0, this.seatY, 0.1);
    this.jockeyTorso.rotation.x = 0.92;

    const hips = ball(silksMat, 0.145, 0.125, 0.15);
    const back = ball(silksMat, 0.152, 0.235, 0.135);
    back.position.y = 0.2;
    // Wider than the hips — the shoulder line is what makes it read as a body.
    const shoulders = ball(silksMat, 0.19, 0.115, 0.145);
    shoulders.position.y = 0.36;
    this.jockeyTorso.add(hips, back, shoulders);

    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.49, 0.04);
    // Counter-rotates the torso's lean, so the rider looks up the track
    // instead of at the horse's shoulder.
    headGroup.rotation.x = -0.92;
    const neckStub = limb(skin, 0.045, 0.05, 0.08);
    neckStub.position.y = -0.04;
    const jHead = new THREE.Mesh(new THREE.SphereGeometry(0.1, 9, 7), skin);
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.116, 10, 7, 0, TAU, 0, Math.PI * 0.6),
      capMat,
    );
    helmet.position.y = 0.012;
    const peak = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.022, 0.1), capMat);
    peak.position.set(0, 0.012, 0.105);
    headGroup.add(neckStub, jHead, helmet, peak);
    this.jockeyTorso.add(headGroup);

    for (const side of [-1, 1]) {
      // Arm: shoulder down and forward to an elbow, forearm on to the reins.
      const upperArm = limb(silksMat, 0.044, 0.052, 0.26);
      upperArm.position.set(side * 0.165, 0.13, 0.25);
      upperArm.rotation.x = 2.25;
      this.jockey.add(upperArm);

      const forearm = limb(skin, 0.031, 0.037, 0.24);
      forearm.position.set(side * 0.145, -0.02, 0.42);
      forearm.rotation.x = 1.98;
      this.jockey.add(forearm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042, 7, 5), skin);
      hand.position.set(side * 0.14, -0.09, 0.53);
      this.jockey.add(hand);

      // Leg: thigh forward to a high knee, shin back down into a short iron.
      const thigh = limb(breeches, 0.062, 0.078, 0.3);
      thigh.position.set(side * 0.185, -0.06, 0.14);
      thigh.rotation.x = 1.85;
      this.jockey.add(thigh);

      const boot = limb(bootMat, 0.058, 0.07, 0.36);
      boot.position.set(side * 0.205, -0.27, 0.22);
      boot.rotation.x = 0.34;
      this.jockey.add(boot);

      const iron = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 5, 10), leather);
      iron.position.set(side * 0.21, -0.44, 0.15);
      iron.rotation.y = Math.PI / 2;
      this.jockey.add(iron);
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
