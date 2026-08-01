# Bloodline — Build Roadmap

Companion to [DESIGN.md](DESIGN.md) and [TRAITS.md](TRAITS.md).

**Unit of estimation is a *work session*, not a calendar day** — pace depends entirely on how often
we sit down with it. Sizes are honest, not optimistic.

**🚦 = hard gate.** Work stops and you judge before we continue. Two of them, both early and both
deliberate.

---

## Phase 0 — Foundation ✅ COMPLETE
**~1 session** · live at https://haydenmay.github.io/Bloodline/

Delivered: Vite + TS scaffold, ESLint-enforced `sim/` isolation (verified against a
deliberate violation), seeded deterministic RNG, versioned save schema with migrations and
export/import, GitHub Actions deploy gated on lint + test + build, LICENSE and CREDITS.
16 tests passing, 0 vulnerabilities. Production build confirmed serving from `/Bloodline/`.

- Vite + TypeScript scaffold, strict mode, the `sim` / `render` / `ui` / `data` / `save` layout
- The architectural constraint enforced from commit one: **`sim/` may never import from `render/`
  or `ui/`** — a lint rule, not a good intention
- Save schema with versioning and a migration path, before any real saves exist
- `git init`, `.gitignore`, `CREDITS.md`, licence policy in place

### Hosting, set up now rather than later

| | |
|---|---|
| **Source** | GitHub, **public**, with an `All Rights Reserved` licence — public means readable, not reusable |
| **Live + phone testing** | **GitHub Pages**, auto-deployed on push via Actions. HTTPS on `github.io`, so PWA install and offline both work |
| **Fast iteration** | Vite `--host` over local wifi during a working session |
| **Distribution** | itch.io at Phase 5–6 — the shop window, not the venue |

**⚠️ Configure `base: '/bloodline/'` in `vite.config.ts` from the first commit.** Pages serves from
a subpath, so any asset path written as `/images/x.png` works perfectly on localhost and silently
404s in production. Cheap to set up now, an afternoon lost if discovered at Phase 2.

itch.io runs HTML5 games in an **iframe**, which blocks PWA installability — which is why Pages
stays the real home and itch is only the storefront pointing at it.

**Deliverable:** repo builds, deploys, and loads on your phone. Nothing to look at yet.

---

## Phase 1 — The race simulation, headless
**~2–3 sessions** · *the most important phase in the project*

- Horse model: 6 stats, hidden potentials, running style, aptitude grades, traits
- **The energy economy** — drain and recovery scaled by position vs. style, drafting
- Pace model, 8-horse fields, AI riding logic per style
- Kick as a function of remaining energy × Grit
- Consistency failures, Temper-driven daily form, jockey-gated traffic trouble
- Fully seeded and deterministic
- **The balance harness** — ten thousand races per run, reporting win rate by style, by division,
  and the shape of the dominance curve

**Deliverable:** numbers you can trust. Still nothing to look at.

### 🚦 Gate 1 — Is the model sound?
I show you harness output. We're checking: no running style dominates, every division is winnable,
the dominance curve is flat in the middle and steep at the ends, and **pace collapses actually
produce upsets**. If closers win 70% of races, we fix it here — where it costs hours instead of
weeks.

---

## Phase 2 — One playable race
**~3–4 sessions** · **Milestone 1** · *all deliverables landed; awaiting Gate 2*

- ✅ Skeletal horse rig, layered parts, clean vector art
- ✅ Coat genetics driving runtime tinting
- ✅ Track, scrolling camera, oval minimap, crowd
- ✅ HUD: energy bar with the style safe-zone, distance countdown, phase call-outs
- ✅ **DRIVE** input — touch and keyboard — plus the kick
- ✅ Post-race recap with the narrative explanation of what happened

**Deliverable: you can play a race on your phone.**

Racing now runs on a commissioned 24-frame gallop sheet, split into materials
by `tools/bake-sprites.ts` and recoloured per runner at load — so a bred coat
and a rival's silks both come out of one grey sheet. The drawn rig stays behind
it for the poses the sheet does not contain, and as the reference the sheet was
measured against.

**Phase 2 is not ticked off until you have played it and answered Gate 2.**

### 🚦 Gate 2 — Is it fun?
The one that matters. Everything after this is built on the assumption that racing feels good. If
it doesn't, we change it now, and we will have spent five sessions finding out instead of twenty.

---

## Phase 3 — A full career
**~3–4 sessions**

- Starter selection — six horses, guaranteed archetype spread
- Training weeks: sessions, condition, form states, injury, breakthroughs
- Race calendar — choose from 2–3 upcoming races
- Divisions, points-based promotion and demotion
- **The living world** — ~70 AI horses generated to match their division, training, ageing,
  promoting and retiring on their own
- Save, load, slots, export/import
- Auto-race and skip

**Deliverable:** one horse, start to retirement, 18–20 starts.

---

## Phase 4 — The stable
**~2–3 sessions**

- Cash and Reputation as separate currencies
- Seven facilities, five levels each
- Trainer and Jockey, levelling, **capped by Reputation**
- Consumables
- Retirement, Legacy scoring, Hall of Fame
- The permanent **rival dossier**
- Wagering on your own horse

**Deliverable:** careers connect. Run 2 opens stronger than run 1.

---

## Phase 5 — Breeding
**~3–4 sessions** · *the payoff*

- Inheritance budget: career achievement → points → distribution
- First-cross bonus, diversity-driven variance, the floor guarantee
- Coat genetics with real dominant/recessive inheritance
- Foal development phase (the EV-style allocation)
- **CK3-style pedigree archive**
- Procedural naming with the dedupe and quality safeguards
- Rejected foals sold, and released into the world as rivals

**Deliverable: the loop closes.** Retire, breed, race the foal.

---

## Phase 6 — Polish
**~3+ sessions, open-ended**

- Full race-day soundscape and stable ambience
- Five tracks, weather, going, crowd density scaling
- Accessibility pass — colourblind palettes, reduced motion, text scaling, speed controls
- PWA, offline, mobile performance tuning
- Codex: racing manual and breeding manual
- Opening sequence
- Difficulty tiers verified through the harness

---

---

## Known issue — winning margins are too wide

**Currently 6–7 lengths between first and second.** Real racing is decided by
1–3, and 5+ is a rout. Long term this needs to be much closer, with genuine
photo finishes — that is where the drama of a race actually lives.

Deliberately shelved, not forgotten: it is reported on every harness run so it
cannot quietly persist.

**The diagnosis, so it does not have to be rediscovered.** Margins and style
balance are coupled through variance:

- The dominant driver is **daily form** (±4.7% per horse at Temper 50), which is
  fixed for the whole race and so compounds directly into the finishing gap.
  The consistency band and the effort-to-speed range matter less than expected —
  narrowing the speed range actually made margins *worse*.
- Cutting that variance does tighten finishes (6.4L → 5.2L when tried) **but
  lets systematic style advantages dominate**: with less noise to wash them out,
  closers jumped to 22% and stalkers collapsed to 5.7%.

So this is not a one-constant fix. It needs a **full re-balance at a lower noise
level** — reduce daily form and the consistency band together, then re-tune the
phase profiles and position costs against the quieter baseline. Best done as its
own focused pass, ideally with a parameter sweep rather than by hand.

---

## Summary

| Phase | Sessions | Gate |
|---|---|---|
| 0 · Foundation | ~1 | |
| 1 · Race sim + harness | ~2–3 | 🚦 Is the model sound? |
| 2 · Playable race | ~3–4 | 🚦 Is it fun? |
| 3 · Full career | ~3–4 | |
| 4 · The stable | ~2–3 | |
| 5 · Breeding | ~3–4 | |
| 6 · Polish | ~3+ | |
| **Total** | **~18–22** | |

---

## Why this order

**Both gates are in the first five sessions.** Racing is the load-bearing wall — if it isn't fun,
no amount of breeding depth rescues the game. So the plan front-loads the risk and puts your
judgement in front of it as early as possible.

**Phase 1 has no visuals on purpose.** A headless, deterministic sim is the only way to verify
balance by evidence rather than by feel, and it's far cheaper to fix a broken energy model in
spreadsheet form than after the art is wired to it.

**Breeding comes late despite being the title.** It depends on career achievement producing an
inheritance budget, which requires careers to exist first. Building it earlier would mean building
it twice.

---

## If we need to cut

In order of what goes first:

1. Five tracks → one track with varied conditions
2. Wagering
3. Consumables
4. Foal development phase → automatic allocation
5. Difficulty tiers → ship Standard only

**Never cut:** the balance harness, the energy economy, the pedigree archive. Those are the spine.
