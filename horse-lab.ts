/**
 * Horse proportion lab — dev only, not part of the build.
 *
 * Vite's default input is index.html, so this page is served by `npm run dev`
 * and never lands in dist. Open /horse-lab.html?speed=16&phase=0.3.
 *
 * It exists because judging a horse by eye in a race screenshot does not work:
 * at trackside scale a horse that is wrong by 10% still looks like a horse, and
 * every correction made that way drifted something else. This puts one horse
 * against a 10 cm grid and reads the real landmarks off the scene graph, which
 * is how the SHOULDER_Y bug — hooves 6 cm under the turf, every height short —
 * was found after surviving several rounds of screenshots.
 */
import * as THREE from 'three';
import { Horse3d } from './src/render/three/horse3d.js';
import { coatFor, RIVAL_SILKS } from './src/render/palette.js';

const q = new URLSearchParams(location.search);
const W = 1200;
const H = 760;
const VIEW = 3;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#11151b');
const cam = new THREE.OrthographicCamera(-VIEW, VIEW, (VIEW * H) / W, (-VIEW * H) / W, 0.1, 60);
const front = q.get('view') === 'front';
cam.position.set(front ? 0 : 12, 0.85, front ? 12 : 0);
cam.lookAt(0, 0.85, 0);

scene.add(new THREE.HemisphereLight('#cfe6ff', '#3a4a30', 1));
const sun = new THREE.DirectionalLight('#fff4e0', 2);
sun.position.set(6, 9, 4);
scene.add(sun);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

// A 10 cm grid, so a proportion can be read rather than felt.
const grid = new THREE.Group();
const line = (a: THREE.Vector3, b: THREE.Vector3, colour: string): void => {
  grid.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([a, b]),
      new THREE.LineBasicMaterial({ color: colour }),
    ),
  );
};
for (let i = 0; i <= 20; i++) {
  const y = i * 0.1;
  line(new THREE.Vector3(0, y, -3), new THREE.Vector3(0, y, 3), i % 5 ? '#243040' : '#4a5a6e');
}
for (let i = -30; i <= 30; i++) {
  const z = i * 0.1;
  line(new THREE.Vector3(0, 0, z), new THREE.Vector3(0, 2, z), i % 5 ? '#243040' : '#4a5a6e');
}
grid.position.x = front ? 0 : -0.6;
if (front) grid.rotation.y = Math.PI / 2;
scene.add(grid);

const horse = new Horse3d(coatFor('bay'), RIVAL_SILKS[0]!);
scene.add(horse.root);
const speed = Number(q.get('speed') ?? 0);
horse.stridePhase = Number(q.get('phase') ?? 0);
horse.update(1 / 60, speed / 60, speed, 0.5);
renderer.render(scene, cam);

// ---- Landmarks, read off the built scene rather than off the constants -----
horse.root.updateMatrixWorld(true);
const box = (o: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(o);
const parts = (horse.root.children[0] as THREE.Group).children;
const chest = box(parts[0]!);
const barrel = box(parts[1]!);
const rump = box(parts[2]!);
const legs = [5, 6, 7, 8].map((i) => box(parts[i]!));

const withers = chest.max.y;
const girth = chest.min.y;
const ground = Math.min(...legs.map((b) => b.min.y));
const trunk = chest.max.z - rump.min.z;
const width = chest.max.x - chest.min.x;

(window as unknown as { measurements: unknown }).measurements = {
  'wither height': withers,
  'croup height': rump.max.y,
  'back dip': barrel.max.y,
  'girth bottom (= elbow)': girth,
  'ground (lowest hoof)': ground,
  'trunk length': trunk,
  'barrel width': width,
  'depth / H — want 0.47-0.50': (withers - girth) / withers,
  'leg / H — want 0.50-0.53': (girth - ground) / withers,
  'trunk / H — want ~1.02': trunk / withers,
  'width / H — want ~0.30': width / withers,
  'croup below withers — want ~0': (withers - rump.max.y) / withers,
};
(window as unknown as { ready: boolean }).ready = true;
