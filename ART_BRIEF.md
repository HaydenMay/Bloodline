# Art brief — the horse

A spec for an artist drawing the racehorse for **Bloodline**, a browser horse
racing game. Hand this over as-is.

The game already has a working animation rig, gait system and colour genetics.
**We are not asking for animation.** We need one horse, drawn once, in separated
pieces, so the existing rig can move it and tint it.

---

## The short version

One side-on racehorse, facing right, delivered as a **layered SVG** with each
body part on its own named layer, drawn in **flat single colours** with no
shading baked in.

---

## Why it must be layered and flat

Two hard constraints, both non-negotiable:

**1. The pieces move independently.** Legs bend at the joints, the neck swings,
the tail streams. Anything drawn as one merged shape cannot be animated.

**2. Coat colour is generated, not chosen.** Horses are bred in this game, and a
foal's colour comes from its parents' genes — so there could be hundreds of
shades. The game recolours the art at runtime. That only works if each part is a
**flat fill of one colour**, with no gradients, textures, or baked-in shadows.
The game adds all shading and outlines itself.

If it helps: think of it as a puppet cut from coloured card, not a painting.

---

## Layers required

Each on its own layer, named exactly as below.

| Layer | Notes |
|---|---|
| `body` | Barrel, chest, quarters as ONE shape. Include where the legs and neck tuck under. |
| `neck-head` | Neck and head as one piece, including the jowl. No mane. |
| `ear` | Single ear. |
| `mane` | Along the crest. Separate because it is a different colour from the body. |
| `tail` | From the dock. Separate colour again. |
| `foreleg-upper` | Shoulder to knee. |
| `foreleg-lower` | Knee to fetlock. |
| `hindleg-upper` | Hip to hock. Noticeably heavier than the foreleg. |
| `hindleg-lower` | Hock to fetlock. |
| `hoof` | One hoof; reused for all four. |

Only **one** of each leg piece is needed — the game draws each four times and
darkens the far side for depth.

---

## Colours to use

Use these exact flat fills so the code can identify each material. The actual
colours in game are replaced at runtime; these are only labels.

- **Body parts** (`body`, `neck-head`, `ear`, both `upper` leg pieces) — `#8C5A32`
- **Hair** (`mane`, `tail`) — `#221509`
- **Points** (both `lower` leg pieces, `hoof`) — `#2A1A0E`

No gradients. No outlines. No drop shadows. No texture.

---

## Pose and proportions

**Pose: standing square, neutral, side on, facing right.** Legs straight down,
head level, neck at a natural angle. The rig poses it from there — a horse drawn
mid-gallop cannot be un-galloped.

Proportions matter more than style here. Against height at the withers:

| Measurement | Ratio |
|---|---|
| Body length, point of shoulder to point of buttock | 1.0 |
| Barrel depth | 0.33 |
| Ground to elbow | 0.55 |
| Neck length | 0.40 |
| Head length | 0.28 |

It should read as a **thoroughbred**: long-bodied, fine-boned, deep girth,
tucked-up flank, long sloping shoulder. Not a cob, not a cartoon pony.

---

## Style

Clean flat vector. Bold readable shapes, correct anatomy, no fine detail — the
horse is often only 40 pixels tall on screen, so anything delicate is lost.

The nearest reference is the simple flat style used in stock vector horse-racing
illustrations: confident silhouette, no rendering, no linework.

---

## Joint positions

Where each piece pivots. Mark these as small dots on a separate layer named
`pivots`, or just tell us — either is fine.

- Shoulder (top of foreleg)
- Elbow / knee (between foreleg pieces)
- Hip (top of hind leg)
- Hock (between hind leg pieces)
- Fetlock (top of hoof)
- Base of neck, where it meets the body
- Dock, where the tail meets the quarters

Pieces should **overlap generously** at every joint. Butt-jointed parts show
gaps the moment they rotate.

---

## Delivery

- **SVG**, layers named as above, one artboard.
- Any canvas size — it is scaled in code. Around 1000px long is comfortable.
- Paths only. No embedded rasters, no clipping masks, no filters.
- Source file too (`.ai`, `.afdesign`, `.svg`) in case something needs adjusting.

---

## Rights

We need **full commercial rights, exclusive**, with the right to modify. The game
may be released commercially. Please confirm the work is original and does not
trace or derive from existing artwork or stock images.

---

## Where to find someone

Roughly in order of cost:

- **Fiverr** — search "vector game character" or "flat vector illustration".
  Cheapest, most variable. Insist on the layered-and-flat requirement up front;
  many will deliver a merged, pre-shaded image otherwise.
- **Reddit** — r/gameDevClassifieds, r/HungryArtists. Post the brief directly.
- **itch.io** — many pixel and vector artists list commissions on their profiles.
- **ArtStation / Upwork** — more professional, higher rates, more reliable.

This is a small job for an experienced vector artist — one figure, no animation,
no colour work. Expect it to be quoted accordingly.

**Ask for a rough silhouette sketch before they commit to final art.** The
proportions above are the part most likely to go wrong, and they are much
cheaper to fix at the sketch stage.
