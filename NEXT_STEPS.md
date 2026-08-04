# Bloodline — Next Steps

**Current Status:** Phase 2 ✅ Complete. Playable race delivered and tested. Queued work items and Phase 3 planning below.

See [DESIGN.md](DESIGN.md) for complete system design and [ROADMAP.md](ROADMAP.md) for build order and known issues.

---

## Queued Work: Phase 2 Optimization (3.5 / 3.6 / 3.7)

Three optimization rounds before moving to Phase 3, in order. **None started without play-testing.**

### 3.5 — AI Kick Strategy per Archetype (~2–3 sessions)

**Problem:** All AI horses execute the same kick cadence within their Moment window, resulting in style imbalance (closer 4.3%, stalker 17.3%, midPack 18.3% versus fair 12.5%) and `late`-Moment horses at 0.0%.

**Solution:** Give each archetype a distinct kick strategy, not just a shifted window:
- **Front-Runner**: Front-loaded, decisive — kicks concentrated early to establish and hold lead
- **Stalker**: Tactical, single-move — one large kick to pass when opportunity opens
- **Mid-Pack**: Spread-it-out — current pattern stays (reasonable generalist behavior)
- **Closer**: Patient, concentrated — reserves kicks for the late window, fires 1–2 large, decisive lunges at the very end

**Also in this round:**
- **Player autopilot wrinkle** (`ui/raceScreen.ts`): Player's default ride wraps `createAiController()` but cannot override the establish-phase position correction that costs ground. Needs an explicit decision — either give the player full override control, or accept the autopilot limitation as-is.
- **Seat-label in HUD** (`ui/raceScreen.ts`): Describes a real mechanic (Style-driven position correction), but it's not actionable (player cannot change Style mid-race). Owner's reaction: "I'm not sure I want it anymore." Remove or keep — explicit call.
- **MOMENT_WINDOWS redesign**: Current `early` (0–25%), `earlyMid` (20–55%), `midLate` (55–90%), `late` (80–100%) are causing sequencing effects. Reassess window boundaries and MOMENT_WEIGHTS_BY_STYLE if the kick-strategy fixes above do not fully resolve style imbalance.

**Verification:** `npm run harness` must show all styles within 30% bar, `early` and `late` Moments above 5%.

---

### 3.6 — UI Refinements (~1 session)

Remaining HUD and results-screen polish:
- **HUD overlap on narrow widths**: Energy bar or distance countdown cropping. Test on phone-width and fix layout.
- **Drafting indicator**: Visual indicator showing when a horse is in draft and getting the regen bonus.
- **Lane/position indicator**: Show preferred slot for each style and how the horse's drift is tracked.
- **Results-screen race card**: Post-race recap layout needs refinement — currently minimal. Add:
  - Finishing position and lengths beaten
  - Jockey callout text (already implemented in code, just needs layout)
  - Key moments flagged by the recap system (consistency failures, traffic trouble, resolve activation)
- **Trait tooltip clipping**: Trait descriptions overflow on narrow screens. Add scroll or reflow.

**Verification:** Test on 375px (iPhone SE width) and 768px (tablet) viewports. All text legible, no cropping.

---

### 3.7 — Player vs. AI Parity (~2–3 sessions)

**Problem:** Player win rate is 4.7% (11/150 races with a perfectly-timed single kick) against fair share of 12.7%, beaten by 30.8L on average. Hands-off: 0/150 wins, 53.5L beaten. Spam every charge: 9/150, 35.1L beaten — spamming beats timing outright.

**Root cause:** AI horses execute a disciplined, precisely-timed multi-kick algorithm (~5–6 kicks/race at 82–83% inside-window efficiency); a human on a touchscreen working from real-time feedback cannot match this volume or timing.

**Solution approaches to explore (ownership decision needed before starting):**

1. **Cap AI kick frequency:** Reduce `MAX_KICKS_PER_MOMENT` (currently 2, counted as fixed slots) to force even AI horses to be more selective. Trade-off: removes some of the variety in AI tactics.

2. **Handicap the AI at lower divisions:** Scale AI kick strength or charge regen downward in Maiden/Novice, making those divisions genuinely winnable for a learning player. Championship stays challenging. Trade-off: less "same rules" principle.

3. **Give the player kick-banking controls:** Let the player hold to build a larger, delayed kick (costs nothing but positioning, pays off with longer duration/strength). Trade-off: adds complexity to the control scheme.

4. **Improve player feedback in real-time:** Richer HUD showing:
   - Kick-strength forecast (how strong a kick will be if fired now vs. at window peak)
   - Charging/banking status (visual indicator of how many charges are queued)
   - Position drift indicator (am I going in or out of position?)
   
   Trade-off: HUD becomes busier.

**Explicit timing loop note:** This phase must hold up at Championship level, where AI jockeys are 65–95 skill (vs. 30–60 in Maiden). The fix cannot be "the player just needs to get good" — that becomes harder as the game progresses, not easier.

**Not started without:** Owner decision on which approach to pursue, or hybrid of above.

---

## Phase 3 — Full Career (~3–4 sessions)

Once 3.5 / 3.6 / 3.7 are complete. Delivers one horse from selection through retirement, 18–20 starts.

### What's new in Phase 3:

- **Starter selection**: Six horses, guaranteed archetype spread (all 4 running styles, mixed distance aptitudes, no trait duplicates)
- **Training system**:
  - Training weeks between races: Sprint work, Long gallops, Hill work, Gate practice, Swimming, Rest
  - Session previews showing reliable stat gains with occasional breakthroughs
  - Condition system (0–100) driven by training load and rest, scales race performance
  - Form states (In Form / Steady / Off Form) visible before racing
  - Injury risk with setbacks (mostly a few weeks) and rare career-enders
  - Morale system (Placings sustain morale, 2nd and 3rd count) + Resolve meter (hidden, guarantees a comeback after bad runs)
- **Race calendar**: After each race, offered 2–3 upcoming races at different distances, divisions and dates
- **Divisions & the living world**:
  - ~70 AI horses generated with their division (Maiden ~20, Novice ~18, Open ~14, Stakes ~10, Championship ~8)
  - AI horses train, age, promote, demote and retire on their own
  - Promotion/demotion: Points-based over a rolling window (not one lucky win or one bad day)
  - Rival dossier (permanent, stable-wide) — learned traits from AI rivals persist across careers
- **Career mechanics**:
  - Age 2–5, roughly 18–20 starts across the career (~5/year)
  - Age 2–3: steep growth · Age 4: peak · Age 5: decline and eroding Legacy
  - Retirement is the player's call (trainer hints once decline sets in)
  - Legacy score impacts breeding value (retiring on top grants *Retired Champion* bonus)
- **Save/load**: Multiple slots, export/import for backup and PC ↔ mobile transfer

### Testing gates:

- **Harness verification** (`npm run harness`): Confirm no style dominates at all divisions, every division is winnable
- **Play-test 3+ careers**: Is progression felt? Do decisions matter? Is there a narrative arc?
- **AI horse behavior**: Do rivals feel like persistent, growing threats? Do familiar horses reappear as friends/enemies?

### Balance tuning scope:

- **midPack bonus** (per DESIGN §10, "midPack balance note"): Apply 1.1–1.2× stat-gain multipliers to midPack horses during training sessions. They are the generalist archetype with no specific racing-strategy advantage, so their identity comes from superior stats earned through training.
- **Ability scaling by division**: AI horses in higher divisions have higher stats and Consistency (confirms elite racing should be more predictable emergently, not by handcoding)

### Deliverable:

One complete horse career from starter selection through retirement, saved, loaded, and verified winnable at multiple divisions with different starting abilities.

---

## Phase 4 — The Stable (~2–3 sessions)

Careers connect: Run 2 opens stronger than run 1. Permanent progression layer.

### What's new:

- **Cash currency**: From purses (paid down to 3rd, so 1st and 2nd-place finishers diverge)
- **Reputation currency**: From wins and titles. Unlocks elite sires, higher divisions, rarer starters.
- **Facilities** (7 types, 5 levels each):
  - Training Track · Hill Course · Swimming Pool · Veterinary Wing · Feed Program · Bloodstock Office · Stable Grounds
  - Bloodstock Office: Progressively sharpens uncertainty (potential ranges, foal projection ranges, pace projections)
- **Staff**:
  - Trainer (better gains in a specialty)
  - Jockey (positioning, traffic avoidance, in-race handling)
  - Both level up and persist across careers
  - Hire cheap and develop, or pay more for pre-levelled (time vs. money trade-off)
  - **Staff level capped by Reputation** (cash alone never buys a top jockey permanently)
- **Consumables**: Feed, supplements, treats bought with cash, applied after training for larger gains or reduced injury risk
- **Cosmetics** (purely visual, never mandatory):
  - Stable colours picked from palette; propagate to jockey silks, tack, grooming
  - Everything worn or applied is freely changeable; genetic appearance is not
- **Retirement & Legacy**:
  - Legacy score peaks at retirement, erodes if you keep running a declining horse into losses
  - Retiring on top grants *Retired Champion* bonus to breeding value
  - At retirement: three choices — race the foal you bred, breed again, or start a new line
  - Hall of Fame: Retired horses persist in the stable permanently

### Deliverable:

Multiple careers with persistent progression. Facilities, staff and reputation matter. Run 2 is visibly stronger than run 1.

---

## Phase 4.5 — Re-balance & Physics (~2–3 sessions)

**Note:** This is a **correction pass**, not a feature phase. It ships no new systems.

All known defects and tuning passes are:
- ✅ Speed scale corrected (real-world timing via `TIME_SCALE`)
- ✅ Energy floor fixed (establish double-charge removed, misfit relief added, AI reserve clause softened)
- ✅ Noise cut and re-balanced (Consistency and daily-form variance reduced by 1/3, `PHASE_PROFILES` re-tuned)
- ✅ Harness re-verified (style balance, pace-collapse, dominance curve all passing)
- ✅ Animation synchronized (gallop sheet stride length and sim speed aligned)

### Known issues still open (tracked, not blocking):

- **Winning margins still too wide** (~3.7L between 1st and 2nd; real racing is 1–3). Tail is worse (~60L between 1st and 8th; real racing ~20L). Likely needs another iteration of the same loop: cut noise further, re-verify style balance, re-check the tail.
- **Moment win-rate asymmetry** (after 3.5 work resolves AI kick strategy imbalance, revisit if this persists). Current harness: `midLate` 34.2%, `early` ~17%, `late` 0.0%.

### Deliverable:

Finishes you would believe. Photo finishes at the front, a beaten field that's beaten rather than distanced. Harness run proves it.

---

## Phase 5 — Breeding (~3–4 sessions)

The payoff. **This is the title of the game.**

### What's new:

- **Inheritance budget**: Retired horse's career (wins, divisions reached, titles, Legacy, final stats & potentials) converts to a **point pool** that distributes into the foal, not rolled fresh. This makes rerolling non-inflationary.
  - Floor: Guarantees no worthless foal ever
  - Budget: Career achievement + first-cross bonus (declining per repeat)
  - Variance: Genetic diversity of pairing × freshness (fresh outcross = wide roll; inbred line = narrow, predictable roll)
- **First-cross bonus (heterosis)**: Parents breeding for the first time contribute a bonus on top of base budget, tapering with repeats
- **Coat genetics**: Real equine colour genetics (base black/bay/chestnut + modifiers + white patterns), dominant/recessive pairs. Recessive can hide three generations.
- **Foal development phase**: Skippable but significant — a pool of development points spent on stat growth, aptitude nudges, or coaxing a latent trait (modeled on Pokémon EVs)
- **Pairing UI**: Show only the foal's **projected potential ranges** — wider for unrelated pairs, narrower for close family. No relatedness lecture, mechanic is *felt*.
- **Pedigree archive**: CK3-style family tree with portrait cards, connecting lines, click for detail. Full horse record, trait & gene inheritance map.
- **Naming**: Procedural, derived from parents, always editable. Safeguards: curated word pools, per-save registry for uniqueness, blocklist for accidents.
- **Rejected foals**: Sold for cash and released into the world as rivals carrying your bloodline's name.

### Testing gates:

- **Inheritance balance** (`npm run harness` with bred horses): Is budget-driven variance balanced? Do fresh outcrosses produce genuine booms and busts? Does the floor hold?
- **Pedigree narrative**: Three generations back — do you feel linebreeding paying off? Do families develop recognizable traits?
- **Play-test 3–5 generations**: Is building a stable identity over time rewarding? Do rejected foals ever surprise you as rivals?

### Deliverable:

The loop closes. Retire, breed, race the foal. Your stable's bloodline is now the story layer.

---

## Phase 6 — Polish (~3+ sessions, open-ended)

Everything that makes it ship-ready and delightful.

### Audio & Atmosphere:
- Full race-day soundscape: hoofbeats shifting with gait and pack density, crowd noise swelling with position and crowd size, race caller on key moments
- Calm ambient music in the stable
- Music and SFX toggles in settings

### Venues & Atmosphere:
- **Five tracks** (one per division), visibly escalating from scrappy country oval to floodlit championship stadium
- **Weather, going and time of day**: Forecast before race, may shift during training, lock a week out with warning
- **Crowd density scaling**: By race hype and division (cheap with instanced sprites)

### Accessibility (built in from the start):
- Colourblind-safe palettes
- Reduced motion option
- Adjustable race speed and pause
- Scalable text and large tap targets
- Independent music and SFX toggles

### UX:
- **Opening sequence**: Short camera pan across the stable, then straight into selection (revisit before this phase)
- **In-game codex**: Racing manual and breeding manual (depth available to read, never imposed)
- **Difficulty tiers**: Selectable affecting AI quality, purses, injury rates. Plus optional assist toggle.
- **Naming customization**: Procedural suggestions are editable

### PWA & Mobile:
- Portrait-first, safe-area aware, touch-native
- Installable as PWA, playable offline
- Target 60fps on mid-range phones
- PC ↔ mobile save transfer via export/import (cloud saves deliberately deferred)

### Deliverable:

Production-ready release. Ship to itch.io with a polished, accessible experience.

---

## If We Need to Cut (Priority Order)

In order of what goes first:
1. Five tracks → one track with varied conditions
2. Wagering
3. Consumables
4. Foal development phase → automatic allocation
5. Difficulty tiers → ship Standard only

**Never cut:** The balance harness, the energy economy, the pedigree archive. Those are the spine.

---

## Summary of Work Ahead

| Phase | Sessions | Status | Gate |
|---|---|---|---|
| 0 · Foundation | ~1 | ✅ Complete | |
| 1 · Race sim + harness | ~2–3 | ✅ Complete | 🚦 Is the model sound? |
| 2 · Playable race | ~3–4 | ✅ Complete | 🚦 Is it fun? |
| **3.5 · AI Kick Strategy** | **~2–3** | ⏳ Queued | Play-test verified |
| **3.6 · UI Refinements** | **~1** | ⏳ Queued | Phone/tablet tested |
| **3.7 · Player vs. AI Parity** | **~2–3** | ⏳ Queued | Owner decision needed |
| 3 · Full career | ~3–4 | ⏳ Next | |
| 4 · The stable | ~2–3 | ⏳ After Phase 3 | |
| 4.5 · Re-balance & physics | ~2–3 | ⏳ After Phase 4 | |
| 5 · Breeding | ~3–4 | ⏳ After Phase 4 | |
| 6 · Polish | ~3+ | ⏳ After Phase 5 | |
| **Total estimate** | **~20–25** | | |

---

## Art & Asset Pipeline

### Current Status (as of Phase 2):
- ✅ Skeletal horse rig with layered, tintable parts (body, legs, head, mane, tail)
- ✅ Material mask system for precise color-region identification
- ✅ Coat genetics system with HSL-based tinting
- ✅ Runtime color tinting (no pre-rendered variants per coat)
- ✅ Silks (jockey colors) tinting system

### Phase 3+ Asset Needs:
1. **Starter horse variants** (6 starter designs, different styles/aptitudes, each coat-able)
2. **Track environments** (5 tracks, each with variation for weather/going)
3. **Crowd sprites** (instanced, varying poses, large fields without duplication)
4. **UI elements** (facility icons, staff portraits, trait icons, training session graphics)
5. **Cosmetics** (tack/equipment variants for different stable colors, optional grooming styles)

### Workflow (hybrid AI + manual cleanup + Aseprite trial):
1. Generate base asset via AI image generation (Midjourney, etc.)
2. Screenshot result, open in Aseprite (trial version)
3. Manual cleanup: remove unwanted artifacts, adjust proportions, refine colors
4. Export as PNG, apply material mask system for tinting
5. Test in-game at multiple coats to verify clean tint behavior

### Sprite Sheet (Racer.png):
- Current: 24-frame gallop sheet (single gait)
- Phase 3+: May need additional poses if foal development or other features require varied animation
- **Deferred decision:** New art for different coat colors, or runtime tinting only?

---

## Open Decisions (Awaiting Owner Input)

| Item | Status | Impact |
|---|---|---|
| **3.5 — Player autopilot override** | ⏳ Design decision needed | How much control should player have over the AI's default ride? |
| **3.5 — Seat label in HUD** | ⏳ Design decision needed | Keep Style indicator, remove it, or make it contextual? |
| **3.7 — Player parity approach** | ⏳ Design decision needed | Which approach (AI cap, AI handicap, player controls, richer feedback) to pursue? |
| **6 — Track count** | ⏳ Scope trade-off | Five tracks (vision) or one track (MVP)? |
| **Asset — Sprite sheet refresh** | ⏳ Scope trade-off | New art per coat, or runtime tinting only? |

---

## Session Checklist

**Before each session:**
- [ ] Run `npm run check` (lint + build + test)
- [ ] Run `npm run harness` if touch racing constants
- [ ] Run `npm run ride-probe` if testing player controls

**Before committing:**
- [ ] Update this document if roadmap changes
- [ ] Link any relevant code sections in commit message

**Before closing session:**
- [ ] Commit all work with descriptive message
- [ ] Push to branch
- [ ] Note progress against current phase estimate

---

## Navigation

- **DESIGN.md** — Complete system design. Start here for the "why" behind every decision.
- **ROADMAP.md** — Build order, known issues, and the detailed history of everything tried and learned.
- **TRAITS.md** — Trait catalogue, design rules, training-acquisition table.
- **REBUILD.md** — Current race simulation specification (replaces old sections in ROADMAP.md).
- **ART_BRIEF.md** — Visual style, animation, UI tone, accessibility.
- **SHIELD_BADGE_IMPLEMENTATION.md** — Color-region mask system for badge tinting (reference for runtime color work).

---

**Last updated:** 2026-08-04  
**Current branch:** `main` (ready for Phase 3 work)
