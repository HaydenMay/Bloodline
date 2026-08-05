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
| `src/assets/racer-id.png` | generated. The same regions in the KEY colours — the editable copy. See §5.9. |
| `src/assets/racer.json` | generated. Grid dimensions and per-frame bounding boxes. |
| `tools/bake-sprites.ts` | generates the mask and the registration for `racer.png`. |
| `tools/bake-flat.ts` | masks any FLAT asset by colour alone — see §11. |
| `tools/check-art.ts` | reports whether an asset can be masked at all — see §11. |
| `tools/material-key.ts` | the shared palette, bands and colour maths. |
| `material-key.gpl` | the key as a palette file LibreSprite can load. |
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

> A second convention used to exist — `horse-reference-mask.png` stored the raw
> id (1–6) rather than ×40 — and it was a live bug for as long as it lasted:
> nothing in `tools/` could write it and `check-art` could not read it. That
> asset is gone. **Every mask in the repo is now ×40.** Keep it that way; two
> conventions is one more than any project needs.

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
- `racer-id.png` — the same labels in the key colours, as an ordinary image.
- `racer.json` — grid and frame boxes.

**The ID sheet is the escape hatch.** Everything in §5 infers a material from a
shaded render, and inference is fragile: seven geometric rules, each measured
against the poses in the *current* sheet. `racer-id.png` is that inference
painted flat, in colours you can bucket-fill. Correct a region in LibreSprite,
then

```
npm run bake-flat -- src/assets/racer-id.png --out src/assets/racer-mask.png
```

reads it by colour alone. Verified: the untouched ID sheet round-trips to a
byte-identical mask, so anything that changes is a change you made. The rules
in §5.3 stop being the source of truth and become a first draft, which is the
right job for them — and correcting labels is bucket work, not brush work, so
frames need only be *correctly labelled*, never artistically consistent.

Nothing else. Both bakers used to emit an SVG trace of the mask alongside the
PNG, on the theory that a vector version would be the natural place to correct
a region by hand. Nobody ever did; what actually gets corrected is the ART, and
then the mask is rebaked. A second generated file that has to stay in step with
the first and never earns its keep is a liability, so it is gone.

---

## 6. Masking flat assets

`racer.png` is the hard case. Everything from §5.1 to §5.7 exists because it is
a shaded render whose mane, tail, cannons, boot and saddle are all the same
black, so the difference has to be recovered from geometry.

Assets painted to the **material key** (§11) need none of that.
`tools/bake-flat.ts` is the whole pipeline for them:

```
npm run bake-flat -- src/assets/shield-badge.png
```

1. Classify every solid pixel with `classifyByKey` — chroma picks the axis, then
   hue or lightness picks the material.
2. Grow those labels into the anti-aliasing and the soft edge, each blend pixel
   taking whichever *labelled neighbour* it is closest to in colour.
3. Smooth away single strays **in the grown fringe only**.

Writes `<asset>-mask.png`. That is the entire tool: no geometry, no frame
layout, nothing to re-measure when the art changes.

**Seed by the key's bands, never by RGB distance to its hex values.** These
sound equivalent and are not. `shield-badge.png` shades its blue across
`#3360A8`, `#1F346A` and `#153171` — all three unambiguously silks, chroma over
75, hue within six degrees of each other — yet the nearest of them is 55 away
from the key's `#1E6FD9` in plain RGB. A version of this tool that seeded by
distance let every one of them fall through to `fixed`, and the badge lost its
border. Shading moves a colour a long way in RGB while leaving its hue and
chroma where they were, which is the whole reason the bands are defined the way
they are.

**Blends are deliberately not seeded.** A pixel halfway between a white field
and a navy border is a mid blue-grey that can sit nearer the *body* band than
to either of its actual neighbours, so classifying it by colour alone draws a
grey line around every border. Left blank and filled from what surrounds it, it
is right by construction.

**A solid pixel is never overruled by its neighbours.** Its own colour decided
its material, exactly, and no vote can know better. The smoothing pass runs
only over the grown fringe, where the labels came from a neighbour rather than
from the pixel. Running it over solid pixels too — which is what §5.6 does,
because there every label is an inference — quietly eats one-pixel detail: a
bridle strap or an outline drawn a single pixel wide has six or more neighbours
of another material BY CONSTRUCTION, so the majority overrules it and the strap
comes out coat-coloured. It cost the shield badge 50 pixels, scattered exactly
where the art was finest. `check-art --mask` now asserts the invariant.

There is no sidecar and no per-asset palette file. An asset that does not match
the key is not a case to configure around, it is a repaint — `check-art` says
which material is off and by how many degrees.

---

## 7. Verifying a bake

Never trust the summary counts alone. Run all of these.

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

### 7.3 Coverage against the art

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

### 7.4 And the ordinary checks

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

Neither is required — the pipeline works on the current sheet. §11 gives the
full key and the two tools that go with it.

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

---

## 11. Authoring new art against the material key

Everything in §5.3 through §5.7 exists because `racer.png` is a shaded render
whose mane, tail, cannons, boot and saddle are all the same black. None of that
is inherent to masking — it is the cost of art that was not painted for it.

`tools/material-key.ts` defines one palette that any new asset can be authored
against. Paint each material's base colour from it and masking collapses to a
colour lookup: no geometry, no blob analysis, no per-asset tuning, nothing to
re-measure when a pose changes.

### The colours to paint with

Every one of these is asserted by `tools/material-key.test.ts` to classify as
its own material, so the table cannot drift away from the rules it came from.

| id | material | what it is on a horse | **paint it** | shading ramp, dark → light |
|----|----------|------------------------|--------------|-----------------------------|
| 1 | `body` | coat: barrel, neck, head, upper legs | **`#8C8C8F`** | `#55555A` `#70707A` `#8C8C8F` `#A0A0A4` |
| 2 | `hair` | mane and tail | **`#A032D0`** | `#5A1C75` `#7B26A2` `#A032D0` `#C070E8` |
| 3 | `points` | cannons and hooves | **`#1A1A1C`** | `#101012` `#1A1A1C` `#26262A` `#2E2E33` |
| 4 | `silks` | jacket, cap, saddle cloth, shield | **`#1E6FD9`** | `#12447F` `#1857AB` `#1E6FD9` `#6BA6F0` |
| 5 | `trim` | breeches, collar, secondary accent | **`#F0F0F2`** | `#C8C8CC` `#DCDCE0` `#F0F0F2` `#FAFAFC` |
| 6 | `fixed` | tack, boots, saddle — never tinted | **`#12B36A`** | `#0B6B40` `#12B36A` `#3FD693` |
| 6 | `fixed` | skin, leather — never tinted | natural warm tones | `#8A5A3C` `#C98A5E` |
| 0 | `none` | not drawn at all | **fully transparent** | — |

Two ways to say "leave this alone", and they differ: `fixed` is **drawn but
never recoloured**, which is what skin, leather and hoof horn want. Alpha 0 is
**not drawn at all**. Reach for `fixed` unless the pixel should genuinely not
exist.

`hair` and `points` are separate materials with separate genes — a horse can
have a flaxen mane over black legs — so give them separate colours even on a
badge that only shows one of them.

The rules those colours satisfy, if you need to check a shade of your own:

| material | must satisfy |
|----------|--------------|
| `body` | chroma < 28, L 0.28–0.68 |
| `hair` | chroma ≥ 28, hue 260–325 |
| `points` | chroma < 28, L < 0.22 |
| `silks` | chroma ≥ 28, hue 185–250 |
| `trim` | chroma < 28, L > 0.72 |
| `fixed` | anything else |

Three neutrals separated on the **lightness** axis, two saturated separated on
the **hue** ring, and `fixed` as the fall-through — which is what lets skin and
leather keep the colours they were painted, since they are the only thing the
player ever sees unmodified.

`material-key.gpl` at the repo root is every ramp above as a GIMP palette file,
which LibreSprite and Aseprite both open — 23 swatches, grouped and labelled.
Regenerate it from `tools/material-key.ts` with
`npm run check-art -- --write-palette material-key.gpl`.

### Shade by moving lightness, never hue

Two limits fall out of the layout above, and both bite in practice.

**A saturated material must stay between L 0.20 and L 0.85.** Chroma is
`max − min`, so it collapses toward zero at both ends of the lightness range.
Shade the violet mane down to L 0.10 and its chroma drops under 28, the hue
test stops applying, and it reads as `points`.

**Do not blur across a material boundary.** Blur is the opposite of what makes
art maskable: it manufactures a wide band of intermediate colours between two
materials, and every pixel in that band is a coin flip. A two-pixel
anti-aliased edge is handled; a ten-pixel blurred one is a ten-pixel error.

If flat art looks too flat, the fix is **shading, not blurring** — two or three
extra lightness steps of the *same* hue, painted as their own flat regions. To
soften something inside a single material, select that region first so the blur
cannot reach across the boundary.

### `npm run check-art`

Answers "can this be masked?" before anything is built on the answer.

```
npm run check-art -- src/assets/shield-badge.png
npm run check-art -- src/assets/racer.png --mask src/assets/racer-mask.png
npm run check-art -- --write-palette material-key.gpl
```

Four blocks:

- **PALETTE** — the flat colours the art is built from, each with the material
  it currently reads as, and whether the art is flat or shaded. Flatness is
  measured by **how much of the art its top sixteen colours cover**, not by how
  many colours exist: `racer.png` is a photoreal render with only 201 distinct
  colours, because it was compressed, but its top sixteen cover 20.7% of it.
  The badge's five cover 100%. Only flat art can be masked by lookup, and only
  flat art is held to the key.
- **BANDS** — every pixel classified by the key, with lightness, chroma and hue
  spread per material. Compare against §4 when art is replaced.
- **MARGINS** — how close each material sits to the threshold that would flip
  it, in risk units (1 unit = 6 chroma, 0.03 lightness, or 8° of hue). *This is
  the real verdict.* Two materials can both classify correctly today and still
  be one regeneration away from colliding.
- **VERDICT** — plain-language pass/warn. The warning that matters most: a
  large, tight, saturated cluster that matches no hue window. That is a material
  painted off-key which will silently never be tinted, and the report says which
  window it is nearest and by how many degrees.

With `--mask` it also checks coverage — every visible pixel labelled, nothing
outside the art, no partial alpha — and that **every solid pixel is masked as
its own colour says**.

That last one is an error on flat art and expected on shaded art, so it is
reported differently for each. `racer.png` paints its mane, tail and cannons in
one identical black; the key physically cannot separate them, and §5.3 does it
by geometry instead. Every pixel of mane recovered that way is a deliberate
disagreement with colour — 51,912 of them, about a fifth of the sheet. On a
shaded asset that number is information, not a defect, and there is nothing to
hand-fix. On flat art it should be zero.

### `npm run bake-flat`

The whole masking pipeline for art that was painted for it — see §6 for the
three passes and the two traps. Writes `<asset>-mask.png` and nothing else.

There is no sidecar and no per-asset palette file, on purpose. Pinning a mask
to one set of hex values puts the art's palette in two places at once, and the
next edit silently invalidates the copy nobody looked at. If an asset does not
match the key, `check-art` names the material and the number of degrees, and
the fix is a repaint that helps every tool at once.

---

## 12. Working in LibreSprite

The one setting that changes everything: **`Sprite → Color Mode → Indexed`.**

In indexed mode every pixel stores a palette index rather than a colour, so
editing a palette entry recolours every pixel of that material at once. That is
the find-and-replace you want, and it is exact — no tolerance, no missed
anti-aliased pixels, no drift.

The workflow:

1. `Sprite → Color Mode → Indexed`.
2. In the Palette panel, **Load Palette** → `material-key.gpl`.
3. Paint each material with its key entry. Add extra entries for shading, but
   only ones that keep the hue and move the lightness (§11).
4. Export as PNG. Indexed PNG is fine — `pngjs` expands it on read.
5. `npm run check-art -- <file>`, then `npm run bake-flat -- <file>`.

Other things worth knowing:

- **Replace a colour without indexed mode:** `Edit → Replace Color`. Set
  tolerance to 0 for an exact swap; raise it only to sweep up anti-aliasing,
  and check the result, because tolerance in RGB space does not respect the
  material bands.
- **Select every pixel of one colour:** magic wand with *Contiguous* turned off,
  tolerance 0. Useful for selecting a region before blurring inside it.
- **Keep materials on separate layers** while working. Merging is a one-way
  door, and a layer per material means the mask can be exported directly if the
  colour route ever gets awkward.
- **Turn off any anti-aliasing option on the pencil and bucket.** Hard pixel
  edges bake perfectly; soft ones cost a growth pass and some guessing.
- **Do not scale the art with a smooth filter.** Nearest-neighbour only —
  bilinear scaling invents intermediate colours everywhere, which is the blur
  problem applied to the entire image at once.

### Undoing a blur

A blur cannot be reversed, but it can be **snapped away**, because flat art only
ever wanted a handful of colours in the first place. Converting to indexed
against a palette that holds only those colours rounds every smeared pixel to
its nearest legal neighbour, and the gradients collapse back into hard edges:

1. Build a palette of just the colours this asset uses — the ramp steps from
   §11 for each material present, and nothing else. Fewer entries is better;
   every extra one is somewhere a blurred pixel can land wrongly.
2. `Sprite → Color Mode → Indexed`. Take the plain one, **not the Ordered
   Dither variant** — dithering is the opposite of what is wanted here, it
   spreads a smeared pixel into a pattern of two colours instead of committing
   to one.
3. `npm run check-art` and look at the mask. Five seconds, and it catches a
   boundary that snapped to the wrong side.

Indexed sprites carry one transparent index rather than an alpha channel, so
this hardens the outer silhouette as well. For anything shown small that is a
gain, not a loss: the browser re-softens it on the way down, and a hard edge
downscales more predictably than a pre-blurred one.

### Adding an outline

LibreSprite has no Outline command — that is Aseprite's `Edit → FX → Outline`,
and one of the better-known gaps between the two. **`Select → Modify → Border`
does the job instead**, and does it better than any layer trick:

1. Magic-wand the region you want outlined.
2. `Select → Modify → Border`, and give it a width in pixels.
3. Fill with the outline colour.

That is the whole thing, and it works on any region — the shield rim, the
horse, one shape inside another — because the selection decides the scope
rather than the layer does.

Border produces a band **around the selection edge**, so at width 2 it will
generally eat a pixel back into the shape as well as adding one outside. That is
usually what you want for pixel art and it keeps the silhouette the same size.
When the shape must not lose a pixel, use `Select → Modify → Expand` by the
same amount instead, and fill it on a layer BELOW the art: the outline then sits
entirely outside and the art covers the overlap.

**Pick the outline's colour from a material, not from the ink jar.** It is
tinted like everything else, so the choice decides what the line follows:

| outline colour | material | what it does |
|---|---|---|
| `#12447F` | `silks` | shield rims — darkens with the runner's silks |
| `#55555A` | `body` | horse silhouettes — stays related to the coat |
| `#1A1A1C` | `points` | line art. On the race sprite this is the leg colour, but a badge has no legs, so `shieldBadge.ts` maps `points` to a constant ink and this is the outline to reach for |
| `#0B6B40` | `fixed` | never tinted at all, and renders the green you painted — only for lines that should genuinely stay that colour |

The trap worth knowing: an outline drawn in a material whose target can be
light stops being an outline. The shield badge outlined in the silks' SECONDARY
came out white on five of the eight rival silks, and a white line around a
white mane is not a line. Either use a material that is always dark, or map it
to a constant in the renderer, which is what the badge now does.

An outline is the most valuable pixel in an icon: at 40px it is close to the
only thing that survives, which is exactly why blurring one away costs so much
more than it looks like it should.
