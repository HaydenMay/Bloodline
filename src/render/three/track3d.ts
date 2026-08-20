import * as THREE from 'three';

/**
 * A stadium-shaped racecourse — two straights joined by two semicircles —
 * parametrised by distance travelled along the centreline.
 *
 * The simulation only ever deals in metres run, with no notion of a shape. The
 * 2D view spends that on a straight scrolling track; this one wraps the same
 * number around an oval, so turns, the run to the post and the grandstand all
 * come for free from a number the sim already produces.
 *
 * Sized to a real one-mile course: 1600 m round, which puts a 1400 m race at a
 * shade under one full lap and a 2400 m route at a lap and a half.
 */
const STRAIGHT = 266;
const RADIUS = 170;
export const TRACK_HALF_WIDTH = 11;

export interface TrackSample {
  position: THREE.Vector3;
  /** Y rotation for an object whose local forward is +Z. */
  heading: number;
  /** 0 on the straights, 1/RADIUS through the turns. */
  curvature: number;
}

const ARC = Math.PI * RADIUS;
const SEG_A = STRAIGHT;
const SEG_B = SEG_A + ARC;
const SEG_C = SEG_B + STRAIGHT;
export const PERIMETER = SEG_C + ARC;

/**
 * The winning post, as a distance along the centreline. Sits midway down the
 * home straight so there is a real run to the line in front of the stand.
 */
export const FINISH_DISTANCE = STRAIGHT / 2;

export function wrap(distance: number): number {
  return ((distance % PERIMETER) + PERIMETER) % PERIMETER;
}

/** `laneOffset` is lateral, positive being outward, away from the infield. */
export function sample(distance: number, laneOffset = 0): TrackSample {
  const s = wrap(distance);
  let x: number;
  let z: number;
  let dirX: number;
  let dirZ: number;
  let curvature = 0;

  if (s < SEG_A) {
    x = -STRAIGHT / 2 + s;
    z = -RADIUS;
    dirX = 1;
    dirZ = 0;
  } else if (s < SEG_B) {
    const a = -Math.PI / 2 + (s - SEG_A) / RADIUS;
    x = STRAIGHT / 2 + RADIUS * Math.cos(a);
    z = RADIUS * Math.sin(a);
    dirX = -Math.sin(a);
    dirZ = Math.cos(a);
    curvature = 1 / RADIUS;
  } else if (s < SEG_C) {
    x = STRAIGHT / 2 - (s - SEG_B);
    z = RADIUS;
    dirX = -1;
    dirZ = 0;
  } else {
    const a = Math.PI / 2 + (s - SEG_C) / RADIUS;
    x = -STRAIGHT / 2 + RADIUS * Math.cos(a);
    z = RADIUS * Math.sin(a);
    dirX = -Math.sin(a);
    dirZ = Math.cos(a);
    curvature = 1 / RADIUS;
  }

  // Outward normal is the heading rotated -90 degrees in the XZ plane.
  return {
    position: new THREE.Vector3(x + dirZ * laneOffset, 0, z - dirX * laneOffset),
    heading: Math.atan2(dirX, dirZ),
    curvature,
  };
}

/**
 * Mown turf.
 *
 * A single flat green fills a third of the frame in the side-on view and reads
 * as a painted backdrop. Real courses are cut in alternating bands, which is
 * both what the eye expects and free depth cueing as the ground recedes.
 */
function mownTurf(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#4f7f3f';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#55873f';
  ctx.fillRect(0, 0, size, size / 2);

  // Speckle, so the bands do not read as flat paint up close.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, y, 2, 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Flat ribbon spanning two lane offsets — the dirt, and the painted lines. */
function ribbon(inner: number, outer: number, y: number, segments = 320): THREE.BufferGeometry {
  const positions: number[] = [];
  const step = PERIMETER / segments;

  for (let i = 0; i < segments; i++) {
    const a = sample(i * step, inner).position;
    const b = sample(i * step, outer).position;
    const c = sample((i + 1) * step, inner).position;
    const d = sample((i + 1) * step, outer).position;
    // Wound counter-clockwise seen from above so the face points up.
    positions.push(a.x, y, a.z, d.x, y, d.z, b.x, y, b.z);
    positions.push(a.x, y, a.z, c.x, y, c.z, d.x, y, d.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function laneCurve(offset: number, points = 220): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < points; i++) {
    pts.push(sample((i / points) * PERIMETER, offset).position);
  }
  return new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
}

/** Everything that does not move: turf, dirt, rails, stand, the post. */
export function buildCourse(scene: THREE.Scene): { dispose(): void } {
  const owned: { dispose(): void }[] = [];
  const track = (geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
    owned.push(geo, m);
    return new THREE.Mesh(geo, m);
  };

  const turfTexture = mownTurf();
  owned.push(turfTexture);
  turfTexture.repeat.set(60, 60);
  const turf = track(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshStandardMaterial({ map: turfTexture, roughness: 1 }),
  );
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = -0.02;
  turf.receiveShadow = true;
  scene.add(turf);

  // The dirt is a hand-built ribbon with no UVs, so it stays flat-shaded
  // colour rather than textured; at trackside distance the horses and the
  // rails are what the eye reads anyway.
  const dirt = track(
    ribbon(-TRACK_HALF_WIDTH, TRACK_HALF_WIDTH, 0),
    new THREE.MeshStandardMaterial({ color: '#a87048', roughness: 1 }),
  );
  dirt.receiveShadow = true;
  scene.add(dirt);

  // Infield, drawn just above the turf so it reads as a different surface.
  const infieldShape = new THREE.Shape();
  const steps = 180;
  for (let i = 0; i <= steps; i++) {
    const p = sample((i / steps) * PERIMETER, -TRACK_HALF_WIDTH).position;
    // ShapeGeometry lives in XY before it is rotated flat, so Z maps to -Y.
    if (i === 0) infieldShape.moveTo(p.x, -p.z);
    else infieldShape.lineTo(p.x, -p.z);
  }
  const infield = track(
    new THREE.ShapeGeometry(infieldShape),
    new THREE.MeshStandardMaterial({ color: '#5b8f45', roughness: 1 }),
  );
  infield.rotation.x = -Math.PI / 2;
  infield.position.y = 0.01;
  infield.receiveShadow = true;
  scene.add(infield);

  for (const offset of [-TRACK_HALF_WIDTH, TRACK_HALF_WIDTH]) {
    const railMat = new THREE.MeshStandardMaterial({ color: '#f2f2f0', roughness: 0.6 });
    const railGeo = new THREE.TubeGeometry(laneCurve(offset), 240, 0.07, 5, true);
    owned.push(railGeo, railMat);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.y = 1.05;
    scene.add(rail);

    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.05, 5);
    const postMat = new THREE.MeshStandardMaterial({ color: '#e8e8e4', roughness: 0.7 });
    owned.push(postGeo, postMat);
    const posts = new THREE.InstancedMesh(postGeo, postMat, 120);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 120; i++) {
      const p = sample((i / 120) * PERIMETER, offset).position;
      m.makeTranslation(p.x, 0.52, p.z);
      posts.setMatrixAt(i, m);
    }
    scene.add(posts);
  }

  // The finish: a white line painted across the track, and nothing else.
  //
  // It used to carry a pair of tall red posts as well, standing right where
  // the grandstand does — so the stand read as the finish marker and the line
  // underneath it went unnoticed. One unambiguous mark is clearer than three
  // competing ones. Run a little wider than the track so it visibly crosses
  // the whole running surface rather than stopping short of the rails.
  const line = track(
    new THREE.PlaneGeometry(TRACK_HALF_WIDTH * 2 + 3, 1),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }),
  );
  const at = sample(FINISH_DISTANCE);
  line.position.set(at.position.x, 0.03, at.position.z);
  line.rotation.x = -Math.PI / 2;
  line.rotation.z = -at.heading;
  scene.add(line);

  buildStand(scene, owned);

  return {
    dispose() {
      for (const d of owned) d.dispose();
    },
  };
}

/**
 * The grandstand, set well back and running the length of the home straight.
 *
 * Sat close to the rail at the winning post it read as the finish line itself.
 * Pushed back and stretched out it becomes what it should be — the wall the
 * crowd sits along behind the straight — leaving the painted line to mark the
 * finish on its own.
 */
function buildStand(scene: THREE.Scene, owned: { dispose(): void }[]): void {
  const anchor = sample(FINISH_DISTANCE, TRACK_HALF_WIDTH + 62).position;
  const heading = sample(FINISH_DISTANCE).heading;

  const stand = new THREE.Group();
  stand.position.copy(anchor);
  // `heading` aligns local +Z with the direction of travel, which is what a
  // runner wants. The stand's length is its local X, so it needs the extra
  // quarter turn — without it the whole structure runs ACROSS the course and
  // 300 m off into the country instead of lining the straight.
  stand.rotation.y = heading + Math.PI / 2;

  const add = (geo: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
    owned.push(geo, m);
    const mesh = new THREE.Mesh(geo, m);
    stand.add(mesh);
    return mesh;
  };

  // Kept low and long. A tall block this close to the rail becomes a grey
  // wall across the sky and the seating ends up stranded on top of it, so the
  // structure is short and the crowd is banked up its front face where it can
  // actually be seen.
  const base = add(
    new THREE.BoxGeometry(300, 6, 26),
    new THREE.MeshStandardMaterial({ color: '#e8e2d6', roughness: 0.9 }),
  );
  base.position.y = 3;
  base.castShadow = true;
  base.receiveShadow = true;

  const roof = add(
    new THREE.BoxGeometry(306, 0.9, 30),
    new THREE.MeshStandardMaterial({ color: '#3f5d78', roughness: 0.7 }),
  );
  roof.position.y = 13.5;
  roof.castShadow = true;

  // Terraced crowd, instanced so a few thousand spectators stay cheap. Local
  // -Z is trackward once the group is turned, so the tiers step back and up
  // away from the running rail, the way real banked seating does.
  const crowdGeo = new THREE.BoxGeometry(0.45, 0.75, 0.45);
  const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  owned.push(crowdGeo, crowdMat);
  const rows = 9;
  const perRow = 300;
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, rows * perRow);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < perRow; c++) {
      const x = -146 + (c / (perRow - 1)) * 292 + (r % 2) * 0.45;
      matrix.makeTranslation(x, 6.4 + r * 0.72, -12 + r * 1.5);
      crowd.setMatrixAt(i, matrix);
      color.setHSL(Math.random(), 0.55, 0.45 + Math.random() * 0.25);
      crowd.setColorAt(i, color);
      i++;
    }
  }
  stand.add(crowd);
  scene.add(stand);
}

/**
 * Sky and the country beyond the rails.
 *
 * A flat background colour meets the turf in a hard seam that reads as a
 * cardboard cut-out the moment the camera sits low, which is exactly where the
 * side-on view sits. A graded dome plus a treeline gives the horizon something
 * to be.
 */
export function buildSky(scene: THREE.Scene): { dispose(): void } {
  const owned: { dispose(): void }[] = [];

  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3f7fc4');
  grad.addColorStop(0.45, '#8fc4e8');
  grad.addColorStop(0.78, '#cfe4f2');
  grad.addColorStop(1, '#e8eef0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  owned.push(texture);

  const domeGeo = new THREE.SphereGeometry(1200, 24, 16);
  const domeMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false });
  owned.push(domeGeo, domeMat);
  scene.add(new THREE.Mesh(domeGeo, domeMat));

  // A ring of low-poly trees well outside the course. Instanced, so several
  // hundred of them cost two draw calls.
  const COUNT = 260;
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3.4, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3626', roughness: 1 });
  const leafGeo = new THREE.ConeGeometry(4.2, 9, 6);
  // No `vertexColors` here: setColorAt drives instanceColor, and asking for a
  // vertex colour attribute the geometry lacks renders every tree black.
  const leafMat = new THREE.MeshStandardMaterial({ roughness: 1 });
  owned.push(trunkGeo, trunkMat, leafGeo, leafMat);

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, COUNT);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, COUNT);
  const m = new THREE.Matrix4();
  const colour = new THREE.Color();

  for (let i = 0; i < COUNT; i++) {
    const angle = (i / COUNT) * Math.PI * 2 + Math.random() * 0.2;
    const radius = 430 + Math.random() * 300;
    const x = Math.cos(angle) * radius * 1.35;
    const z = Math.sin(angle) * radius;
    const scale = 0.75 + Math.random() * 0.9;

    m.makeScale(scale, scale, scale);
    m.setPosition(x, 1.7 * scale, z);
    trunks.setMatrixAt(i, m);

    m.makeScale(scale, scale, scale);
    m.setPosition(x, 3.4 * scale + 4.5 * scale, z);
    leaves.setMatrixAt(i, m);
    colour.setHSL(0.26 + Math.random() * 0.06, 0.45, 0.3 + Math.random() * 0.16);
    leaves.setColorAt(i, colour);
  }
  scene.add(trunks, leaves);

  return {
    dispose() {
      for (const d of owned) d.dispose();
    },
  };
}
