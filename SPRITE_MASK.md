# Sprite mask — how `racer.png` becomes a recolourable horse

How the gallop sheet is split into materials, why each rule in
`tools/bake-sprites.ts` is the shape it is, and what to do when the art is
replaced. Written so someone who has never seen this pipeline can regenerate
the mask from scratch and verify it is right.

---

## 1. The problem

Bloodline breeds its horses. A foal's coat comes from its genes, so there are
hundreds of possible coats, and eight runners in a field each need their own
silks or you cannot tell which one is yours. We ship **one** sprite sheet — a
grey horse in blue silks — and recolour it at runtime.

Recolouring needs to know *what each pixel is*. That is the mask: a second
image, pixel-aligned with the art, carrying one **material id** per pixel.

The renderer keeps the art's luminance and takes hue and saturation from the
material's target colour, so the modelling in the original survives the tint —
a lit flank stays lit whatever colour it becomes. If the mask is wrong, the
wrong region takes the wrong colour, and because the sheet is a 24-frame
animation, a region misread in only some frames *flickers* as the gallop
cycles. That is the failure mode to hunt for.

### Materials

| id | name | what it is | tinted by |
|----|--------|-----------------------------------|--------------------------|
| 0 | none | background | — |
| 1 | body | the coat: barrel, neck, head, upper legs | coat `body` gene |
| 2 | hair | mane and tail | coat `hair` gene |
| 3 | points | cannons and hooves | coat `points` gene |
| 4 | silks | jacket, cap, saddle cloth | runner's primary silks |
| 5 | trim | breeches and collar | runner's secondary silks |
| 6 | fixed | skin, leather, boots, saddle, tack | **never tinted** |

Defined in `tools/bake-sprites.ts` and mirrored in `src/render/spriteHorse.ts`.
Both copies must agree.

---

## 2. Files

| path | role |
|---|---|
| `src/assets/racer.png` | the delivered art, 1280×1280, 5×5 grid of 256px cells, 24 frames. **Never modified.** |
| `src/assets/racer-mask.png` | generated. One material id per pixel. This is what the game loads. |
| `src/assets/racer-mask.svg` | generated. The same regions as editable vector paths. Nothing loads it; it is for humans. |
| `src/assets/racer.json` | generated. Grid dimensions and per-frame bounding boxes. |
| `src/assets/racer-mask-old.png` | the previous mask, kept as a reference. Not loaded. |
| `tools/bake-sprites.ts` | generates all three outputs. |
| `src/render/spriteHorse.ts` | loads the sheet + mask and does the runtime tint. |

Run with:

```
npm run bake-sprites
```

It reads only `racer.png` and takes about three seconds. It is deterministic —
same input, byte-identical output.

---

## 3. The wire format

`racer-mask.png` stores **material id × 40 in the red channel**. Green and blue
are zero; alpha is 255 where there is a material and 0 elsewhere.

```
id 1 body   → red 40      id 4 silks  → red 160
id 2 hair   → red 80      id 5 trim   → red 200
id 3 points → red 120     id 6 fixed  → red 240
```

The renderer decodes with `Math.round(red / 40)`. The ×40 spread exists so the
file is legible by eye in any image viewer — brighter red means further down
the list — and so a stray ±1 from a resave cannot change an id.

Three rules that are easy to get wrong:

- **The red channel is authoritative.** `spriteHorse.ts` never looks at the
  mask's alpha. Alpha is set only so the file looks sane when opened.
- **The mask must be fully opaque or fully transparent, never partial.**
  Canvas `getImageData` un-premultiplies, so a red value under partial alpha
  comes back shifted and decodes to the wrong id.
- **Do not resave the mask through a lossy or colour-managed pipeline.** No
  JPEG, no ICC conversion, no rescaling with a smooth filter. Nearest-neighbour
  only.

> **Gotcha:** `src/assets/horse-reference-mask.png`, used by
> `src/render/horsePreview.ts`, stores the **raw** id (1–6) in red, *not* ×40.
> Two assets, two conventions. Do not bake one with the other's tool.

---

## 4. What the art has to look like

The whole pipeline rests on one property: **every material occupies its own
region of colour space.** An earlier delivery had a bay horse in red silks, and
a bay coat *is* a dark red — no rule could separate coat from silks, and the
sheet was regenerated specifically to avoid that.

The current sheet satisfies it. Measured over all 224,855 opaque pixels:

| material | lightness p5..p95 | chroma p5..p95 | hue (where chroma > 30) |
|-----------|-------------------|----------------|-------------------------|
| coat | 0.25 .. 0.63 | 3 .. 16 | — (neutral grey) |
| mane/tail | 0.03 .. 0.22 | 2 .. 10 | — |
| points | 0.01 .. 0.20 | 1 .. 11 | — |
| silks | 0.22 .. 0.59 | 50 .. 185 | 200–230 |
| breeches | 0.75 .. 0.94 | 5 .. 13 | — |

"Lightness" is HSL L. **"Chroma" is `max(r,g,b) − min(r,g,b)` on the 0–255
scale** — not HSL saturation.

### Why chroma and not saturation

The breeches are `(246, 244, 248)`. That is an HSL saturation of **0.22** —
high enough to trip any saturation threshold set low enough to catch the blue
silks — but a chroma of **4**. HSL saturation is unstable near white and near
black: it divides by a term that goes to zero, so a two-point difference
between channels becomes a large number. Chroma does not do that. Every colour
test in the baker is a chroma test.

This was the single largest error in the mask that this pipeline replaced.

### The one thing colour cannot do

Mane, tail, cannons, hooves, boots, saddle and bridle are **all the same
black**. No colour rule will ever separate them. They are separated by
geometry, in §5.3 — which is the most fragile part of the pipeline, and the
part to re-verify hardest if the art changes.

---

## 5. The pipeline

Nine passes. Order matters; each note says why.

### 5.0 Frame boxes

Scan each of the 25 grid cells for pixels with `alpha > 100` and record the
bounding box. 24 of the 25 cells are non-empty. Written to `racer.json`, and
used throughout as the coordinate system for the geometric rules: every
position below is expressed as a fraction of its own frame's box, so a rule
holds regardless of where in the cell the horse sits or how much it gathers.

`racer.json` is also what `spriteHorse.ts` uses for registration, so if it
changes, the horse's footfall changes. Diff it after every bake.

### 5.1 Denoise — 3×3 median

The sheet is a compressed render and carries **chroma speckle**: stray violet
and orange pixels along every black/grey boundary, tens of thousands of them.
Classified raw, they scatter `hair` and `fixed` ids through the coat and the
result looks like a horse with mange.

A 3×3 per-channel median removes it without moving an edge more than a pixel.
It is computed for every pixel with `alpha ≥ 1`, but **only pixels with
`alpha ≥ 200` contribute to the window** — otherwise the median is dragged
toward the background all round the silhouette.

**The median is used only to choose a label.** The renderer still reads its
luminance from the untouched art, so no shading is lost.

### 5.2 Colour pass — seeds only

Runs on the median image, for pixels with `alpha ≥ 200` only. Half-transparent
edge pixels are a blend of the art and nothing, so their colour is a lie — a
black cannon fades through grey on its way out. They are filled in at 5.8.

Constants, all in the file's header block:

```
CHROMA_TINTED = 40      L_BLACK  = 0.235     HUE_SILKS = [190, 250]
CHROMA_WARM   = 22      L_WHITE  = 0.68      HUE_SKIN  = [-25, 55]   (wraps 0)
```

In order, first match wins:

| test | result |
|---|---|
| `chroma ≥ 40` and hue in `HUE_SILKS` | **silks** |
| `chroma ≥ 22` and hue in `HUE_SKIN` | **fixed** (face, hands) |
| `chroma ≥ 40` | **fixed** (anything else strongly coloured) |
| `L < 0.235` | **DARK** — placeholder, resolved in 5.3 |
| `L > 0.68` | **trim** — provisional, filtered in 5.4 |
| otherwise | **body** |

Each threshold sits in a measured gap: 0.235 is between the blacks' p95 of 0.22
and the coat's p5 of 0.25; 0.68 is between the coat's p95 of 0.63 and the
breeches' p5 of 0.75; 40 is between the coat's chroma p95 of 16 and the silks'
p5 of 50. None is close to a boundary.

### 5.3 Resolve the blacks by blob

Because the coat is grey, each black region is a **separate 4-connected
component**. A component can be placed by where it sits in the frame even when
its individual pixels cannot.

Measured across all 24 frames — this table is the justification for every
number in the rule, and is what must be re-measured if the art changes:

| region | size (px) | left | cx | top | bottom | width |
|---|---|---|---|---|---|---|
| tail | 575–670 | 0.00–0.03 | 0.11–0.13 | 0.30–0.40 | 0.61–0.70 | ~0.22 |
| mane | 320–550 | 0.60–0.64 | 0.72–0.75 | 0.06–0.15 | 0.22–0.34 | 0.20–0.29 |
| boot + stirrup | 340–440 | 0.44–0.49 | 0.50–0.56 | 0.29–0.31 | 0.62–0.69 | ~0.11 |
| cannons | 200–830 | varies | varies | varies | 0.79–1.00 | varies |
| goggles | 55–105 | 0.60–0.68 | 0.61–0.68 | 0.07–0.24 | ≤ 0.37 | 0.03–0.11 |
| bridle straps | 30–105 | — | 0.70–0.85 | — | ≤ 0.70 | small |

The rule, in order:

```
n < 150                                        → fixed   (goggles, straps, buckles)
width > 0.14 and top < 0.20 and cx > 0.55
                 and bottom < 0.45             → hair    (mane)
left < 0.12 and top < 0.45 and bottom < 0.75   → hair    (tail)
bottom > 0.75                                  → points  (cannons and hooves)
otherwise                                      → fixed   (boot, saddle, stirrup)
```

**Two traps this rule exists to avoid.**

*The boot.* It starts at `top = 0.29` and sits right of centre — the old rule
tested `top < 0.32 && cx > 0.45` for the mane and therefore claimed the boot,
tinting a whole stirrup leather as mane colour. The separator is **width**: the
mane spans 0.20–0.29 of frame width, the boot 0.11, the goggles 0.05.

*The tail versus a trailing hind leg.* In frames 6, 14, 21 and 22 a hind leg
swings out to `left = 0.03`, into the tail's corner. `top` separates them
cleanly: the tail's top is never below 0.40, the leg's never above 0.48.

### 5.4 Filter the whites

Only the jockey wears white. Per frame: the breeches (~270 px, every frame) and
the collar under the chin (47–97 px, in frames where the head is not over it).
Both sit in the top 45% of the frame, because that is where the rider is. Every
other white is a specular pop — on a hoof, a buckle, the cap — of 1–29 px.

```
n ≥ 20 and top < 0.45  → stays trim
otherwise              → reverts to body
```

Both tests are needed: size alone keeps the pop on a boot buckle, position
alone keeps the shine on the cap.

**It reverts to `body`, not `fixed`, and that ordering is deliberate.** The
shine on a hoof is white sitting on grey horn; sending it back to grey lets it
rejoin the hoof as one component in 5.5. Marking it `fixed` here instead
strands the horn as its own island and the hooves come out untinted in about a
third of the frames — a visible flicker.

### 5.5 Grey islands are not coat

A hoof is pale horn ringed by the black cannon, so it reads as plain grey and
lands on `body`. Left there, every runner gets four coat-coloured hooves. The
mask this pipeline replaced did exactly that.

The coat is one or two large components per frame — the jockey cuts the barrel
off from the neck — and the measured split is:

- coat components: **1579 – 2918 px**
- every other grey island: **13 – 97 px**

so `ISLAND_MAX = 400` separates them with an order of magnitude to spare.

What an island *is* comes from what surrounds it. Tally the labels of the
4-neighbours just outside the component, ignoring `body` and background:

```
majority is points  → points   (a hoof: the leg tints as one piece to the ground)
anything else       → fixed    (a highlight on a boot; a speed line, whose ring is empty)
```

### 5.6 Majority smoothing, twice

Pixels part-way between a black leg and the grey coat land on `body` and show
as coat-coloured freckles inside a cannon. Any pixel whose 8-neighbours mostly
disagree with it (**≥ 6 of 8** agreeing on one other label) takes theirs. Two
passes, so a two-pixel fringe closes as well as a one-pixel one.

Both numbers are load-bearing. A threshold below 6 starts eating genuine
one-pixel detail; a third pass starts rounding off the mane's tips.

### 5.7 Tack drawn on the coat goes back to the coat

The bridle, noseband and reins are dark leather lines one or two pixels wide
lying across the neck and cheek. Most dissolve in 5.6; what survives is a
scatter of untinted flecks that read as dirt on a tinted horse — worse than the
strap reading as a shadow would.

```
component of fixed, n ≤ 200, and ≥ 80% of its non-fixed ring is body  → body
```

Deliberately narrow. The saddle, boot and stirrup leather are also tack and
they stay `fixed`: they are large, and they border silks and background as much
as coat, so neither test lets them through.

### 5.8 Grow into the soft edge

The art is anti-aliased: about 24,000 pixels around the silhouettes have
`0 < alpha < 200` and were never seeded. Left unlabelled, `spriteHorse.ts`
passes them through untinted and **every recoloured horse wears a grey halo.**

A breadth-first flood from every labelled pixel gives each unlabelled pixel
with `alpha ≥ 1` the label of the nearest seeded one. Result: 242,009 of the
242,090 visible pixels carry a material. The 81 that do not are isolated
single pixels with no labelled neighbour at any distance within their island.

### 5.9 Write

- `racer-mask.png` — red = id × 40, alpha 255/0.
- `racer.json` — grid and frame boxes.
- `racer-mask.svg` — see below.

---

## 6. The SVG

`racer-mask.svg` is the same regions traced as vector paths, one `<g>` per
material:

```xml
<g id="body"   fill="#280000" fill-rule="evenodd"><path d="…"/></g>
<g id="hair"   fill="#500000" …>
<g id="points" fill="#780000" …>
<g id="silks"  fill="#a00000" …>
<g id="trim"   fill="#c80000" …>
<g id="fixed"  fill="#f00000" …>
```

The fills are the same red values as the PNG, so **rasterising the SVG at
1280×1280 with nearest-neighbour reproduces `racer-mask.png` exactly** — this
is asserted in §7 and currently gives zero differing pixels out of 1,638,400.
That round-trip is what makes hand-editing the SVG a safe way to correct a
region: fix it in a vector editor, rasterise, done.

The tracer is crack following on the corner lattice. Vertices are the corners
*between* pixels; a crack is on the boundary when the material is on exactly
one side. Every crack is walked with the material kept on the left:

```
up     needs the material west of the crack, open air east
down   needs it east,  open air west
left   needs it south, open air north
right  needs it north, open air south
```

Outer contours come out anticlockwise and holes clockwise, so
`fill-rule="evenodd"` punches the holes out for free. At a corner where two
diagonal pixels are in and the other two out, both a left and a right turn are
legal; going back the way we came is always excluded, and where both remain we
turn left. Either choice fills correctly — being *consistent* is what
guarantees the walk terminates. Collinear midpoints are dropped, so a straight
40-pixel run is two points, which is why the file is 350 KB rather than
several MB.

The previous `racer-mask.svg` was a potrace silhouette of the whole horse, in a
single black fill, with no material information. It was unloadable and unused.

---

## 7. Verifying a bake

Never trust the summary counts alone. Run all four.

Scripts assume `NODE_PATH=./node_modules` and are run from the repo root.

### 7.1 Look at it in colour

The mask is near-black in a viewer. Recolour it so the ids are legible:

```js
// colorize.js <src.png> <out.png> [left top w h zoom]
const { PNG } = require('pngjs');
const fs = require('fs');
const COL = {
  0: [255, 255, 255], 1: [90, 200, 90],  2: [230, 40, 220], 3: [255, 150, 0],
  4: [40, 90, 255],   5: [250, 230, 60], 6: [0, 210, 220],
};
const [src, out, left, top, w, h, zoom] = process.argv.slice(2);
const png = PNG.sync.read(fs.readFileSync(src));
const L = +left || 0, T = +top || 0;
const W = +w || png.width, H = +h || png.height, Z = +zoom || 1;
const o = new PNG({ width: W * Z, height: H * Z });
for (let y = 0; y < H * Z; y++) for (let x = 0; x < W * Z; x++) {
  const p = (T + ((y / Z) | 0)) * png.width + L + ((x / Z) | 0);
  const id = png.data[p * 4 + 3] > 0 ? Math.round(png.data[p * 4] / 40) : 0;
  const c = COL[id] || [0, 0, 0], q = (y * W * Z + x) * 4;
  o.data[q] = c[0]; o.data[q + 1] = c[1]; o.data[q + 2] = c[2]; o.data[q + 3] = 255;
}
fs.writeFileSync(out, PNG.sync.write(o));
```

`node colorize.js src/assets/racer-mask.png /tmp/all.png` gives the whole sheet.
Check **every frame**: green coat, one magenta tail and one magenta mane,
orange legs *including hooves*, blue jacket/cap/saddle cloth, yellow breeches,
cyan for boot, saddle, goggles and speed lines. A region that is right in 23
frames and wrong in one is the failure this catches — that one frame flickers.

### 7.2 Render it the way the game will

Replicate `tintedSheet()` from `src/render/spriteHorse.ts` offline and draw a
few frames in several coats and silks. Chestnut, bay, palomino and black over
the four `RIVAL_SILKS` entries covers the range: a pale coat exposes anything
wrongly labelled `body`, a dark one exposes anything wrongly labelled `points`.

Look specifically at: hooves (should read as horn, not coat), breeches (clean
secondary silks, no dark speckle), the mane along the crest (present, not
absorbed into the coat), boots (black, not mane-coloured), and the silhouette
edge (no grey halo).

### 7.3 Round-trip the SVG

Must be zero.

```js
const sharp = require('sharp');
const { PNG } = require('pngjs');
const fs = require('fs');
(async () => {
  const buf = await sharp('src/assets/racer-mask.svg')
    .resize(1280, 1280, { kernel: 'nearest' }).png().toBuffer();
  const a = PNG.sync.read(fs.readFileSync('src/assets/racer-mask.png'));
  const b = PNG.sync.read(buf);
  let diff = 0;
  for (let p = 0; p < 1280 * 1280; p++) {
    const ia = a.data[p * 4 + 3] ? Math.round(a.data[p * 4] / 40) : 0;
    const ib = b.data[p * 4 + 3] > 127 ? Math.round(b.data[p * 4] / 40) : 0;
    if (ia !== ib) diff++;
  }
  console.log('round-trip mismatches:', diff);   // expect 0
})();
```

### 7.4 Coverage against the art

Every visible pixel of art should carry a material, and the mask should never
extend past the art.

```js
const { PNG } = require('pngjs');
const fs = require('fs');
const base = PNG.sync.read(fs.readFileSync('src/assets/racer.png'));
const mask = PNG.sync.read(fs.readFileSync('src/assets/racer-mask.png'));
let covered = 0, uncovered = 0, stray = 0;
for (let p = 0; p < 1280 * 1280; p++) {
  const art = base.data[p * 4 + 3] > 0, m = mask.data[p * 4 + 3] > 0;
  if (art && m) covered++; else if (art) uncovered++; else if (m) stray++;
}
console.log({ covered, uncovered, stray });
```

Current: `covered 242009, uncovered 81, stray 0`. Uncovered in the low hundreds
is fine — they are isolated alpha-1 specks. Uncovered in the thousands means
5.8 did not run or the alpha thresholds are wrong, and the horse will have a
grey halo. `stray` above zero means the mask claims pixels the art does not
have; the previous mask had 1,720 of them.

### 7.5 And the ordinary checks

```
npm run lint && npx tsc --noEmit && npm test
git diff --stat src/assets/racer.json     # expect empty
```

A non-empty `racer.json` diff means frame registration moved and the horse's
footfall will change. That is legitimate only if the art's silhouette actually
changed.

---

## 8. Replacing the art

When a new `racer.png` arrives:

1. **Check the grid.** 1280×1280, 5×5, 256px cells is hard-coded as `COLS`,
   `ROWS` in the baker. A different layout means editing those.
2. **Re-measure the colour bands.** Do not assume. Label pixels with the
   previous mask (if it still aligns) or by hand-picking regions, then print
   p5/p50/p95 of lightness and chroma per material and a hue histogram for
   chroma > 30. Compare against the table in §4. If two materials now overlap,
   the art needs repainting — no rule will fix it.
3. **Re-measure the blob geometry.** Threshold at `L < L_BLACK`, take
   4-connected components, print `n`, `left`, `cx`, `top`, `bottom` and width
   normalised to each frame box, for every frame. Rebuild the §5.3 table and
   check the rule still separates tail from mane from boot from cannon in *all*
   frames. This is where a new pose breaks things.
4. **Re-measure the grey island sizes** so `ISLAND_MAX` still sits in the gap.
5. Bake, then run all of §7.

If the silhouette changed at all, expect `racer.json` to change and check the
horse still plants its feet on the ground in-game.

---

## 9. Making the art easier to mask

### 9.1 There is no "convert any image to the reference scheme" command

It is tempting to want a tool that takes an arbitrary racer sheet — a bay horse
in red silks, say — and recolours it into the grey/black/blue reference scheme
so this baker can run on it. That tool cannot exist in general, and the reason
is worth stating plainly:

> To recolour the coat grey and the silks blue, something has to already know
> which pixels are coat and which are silks. That knowledge **is** the mask.
> Normalising the colours and building the mask are the same problem.

So a converter is only ever as good as the classifier behind it. If the source
art's materials are already separable, the baker can read it directly and the
conversion step buys nothing. If they are not separable — a bay coat and red
silks occupy one hue band, and no rule distinguishes them — then no converter
can untangle them either.

**What actually matters is separability, not the specific hexes.** The baker's
thresholds are tuned to this sheet, but the requirement on new art is only:

1. the coat is neutral (chroma < 40) and mid-toned;
2. mane, tail and lower legs are much darker than the coat;
3. the silks sit in one hue band, well away from grey and from skin tones;
4. the breeches are much lighter than the coat;
5. the four bands do not touch.

Blue silks satisfy (3), but so would green or violet. What fails is a warm coat
against warm silks, a near-white coat against white breeches, or red/orange
silks against skin.

If you are generating sheets rather than hand-painting them, the practical
workflow is: generate → measure the bands (§8 step 2) → regenerate if two
materials overlap. Measuring is cheap and catches an unmaskable sheet before
any time goes into it.

### 9.2 Two repaints that would make this substantially more robust

Neither is required — the pipeline works on the current sheet.

**Give the mane and tail their own colour.** They are currently the same black
as the cannons, which is the only reason §5.3's geometry exists — and geometry
is the one thing that breaks when a pose changes. Painting mane and tail
`#7B2FF2` (hue 270, chroma 195: outside the silks window at 190–250, outside
the skin window) would let §5.3 be deleted and replaced with a colour test.

**Give the tack its own colour.** Bridle, reins, saddle and boots painted
`#00C853` (hue 145, chroma 200) land on `fixed` by colour alone, removing the
need for §5.7 and the boot's special case in §5.3.

Bands to stay inside for anything else:

| material | example | must satisfy |
|---|---|---|
| coat | `#8C8C8F` | chroma < 40, L 0.24–0.68 |
| mane/tail, cannons | `#141414` | L < 0.235 |
| silks | `#1E6FD9` | chroma ≥ 40, hue 190–250 |
| breeches/collar | `#F4F4F6` | chroma < 40, L > 0.68 |
| tack, skin | `#00C853` | chroma ≥ 40, hue outside 190–250 |

Keep flat fills. Gradients that cross a threshold split a region in two.

---

## 10. Known failure modes

Symptoms seen in real bakes, and where to look.

| symptom on screen | cause | section |
|---|---|---|
| horse speckled with wrong-coloured freckles | classifying the raw art instead of the median | 5.1 |
| breeches take the coat or mane colour | saturation test instead of chroma | 5.2 |
| a whole boot / stirrup tints as mane | mane rule missing the width test | 5.3 |
| hooves are coat-coloured | grey islands left as `body` | 5.5 |
| hooves flicker between horn and coat across frames | white filter ran before the island pass | 5.4 |
| coat-coloured freckles inside a black cannon | smoothing threshold too high, or one pass | 5.6 |
| tinted horse looks grubby around the bridle | tack remnants left as `fixed` | 5.7 |
| grey halo around every recoloured horse | soft edge never labelled | 5.8 |
| horse appears to sink into the track | `racer.json` regenerated with different frame boxes | 5.0 |
| all ids wrong / everything reads as `body` | mask saved with partial alpha, or the ×40 encoding dropped | 3 |
