# Bloodline Codebase Overview

## High-Level Architecture

**Bloodline** is a horse racing simulation with three main layers:

1. **Simulation Engine** (`/src/sim/`) — Race logic, AI jockeys, horse stats
2. **Rendering System** (`/src/render/`) — Canvas drawing, HUD, visuals
3. **User Interface** (`/src/ui/`) — Race screen, info boxes, player controls
4. **Game Data** (`/src/data/`) — Static data: names, traits, constants

## Folder Breakdown

### `/src/sim/` — Pure Simulation
**The one architectural rule:** `sim/` and `data/` must never import from `render/`, `ui/` or
`save/`, and must never touch the DOM. Lint enforces it. This is what lets the measurement tools run
the whole simulation headlessly.

**Beyond the race engine:**
- **`breeding.ts`** — the inheritance budget. Two retired careers become a foal: a floor from the
  parents, a budget from what they banked, and variance from how unrelated they are. Also
  `relatedness` (Wright's coefficient, two generations) and the breeding-age taper
- **`coat.ts`** — real coat genetics. Five loci expressing the eight coats, so a recessive can hide
  for generations
- **`growth.ts`** — training gains, ceilings, and the age arc
- **`injury.ts`**, **`upkeep.ts`**, **`division.ts`** — the rest of a career's mechanics

### The race engine
**What it does:** Simulates horse racing. One tick = one frame of the race.

**Key files:**
- **`race/engine.ts`** — Core race loop. Every tick:
  - Reads player/AI input
  - Updates horse speeds, positions, fatigue
  - Tracks kicks, pulls, drafting
  - Returns snapshot of current state
  
- **`race/rider.ts`** — Jockey logic. Decides how input (kicks/pulls) modifies the base ride
  
- **`race/tank.ts`** — Fatigue system. Horses recover when pulling, drain when kicking/racing
  
- **`race/charges.ts`** — Kick charge system. Tracks when kicks are ready to fire
  
- **`race/pace.ts`** — Pace curve logic. How fast the leader is going affects the whole field
  
- **`race/recap.ts`** — Post-race analysis. Builds results summary and finish order
  
- **`horse.ts`** — Horse generation. Creates random horses with stats, traits, preferred distances
  
- **`types.ts`** — TypeScript interfaces for race data (Horse, RaceConfig, PlayerInput, etc.)

**Data flow in a race:**
```
Player/AI Input → Engine reads it → Rider applies it → Horse speed updated → New snapshot → UI reads snapshot
```

---

### `/src/render/` — Drawing & Visuals
**What it does:** Takes simulation state and draws it on canvas.

**Key files:**
- **`canvas.ts`** — Canvas setup, frame loop management (TICK_HZ = 60fps)
  
- **`horse.ts`** — Draws individual horse body/legs (used for preview)
  
- **`spriteHorse.ts`** — Sprite-based horse rendering (fast, used in races).
  Reads the material mask baked by `tools/bake-sprites.ts`; see
  [SPRITE_MASK.md](SPRITE_MASK.md) for how that mask is built and verified.
  
- **`track.ts`** — Draws the racetrack background, distance markers, minimap
  
- **`palette.ts`** — Horse coat colors, jockey silks color system
  
- **`shieldBadge.ts`** — Draws the shield badge (horse head with silks)

**How it works:**
1. Race screen calls `draw()` every frame
2. Draw function gets current snapshot from engine
3. Renders each horse sprite at its position
4. Draws HUD (race bar, results, stats)

---

### `/src/ui/` — User Interface
**What it does:** Screens, menus and the state that outlives a race.

**The career and the yard:**
- **`career.ts`** — `Career` and `Stable`, and everything that saves them. The yard outlives every
  horse: cash, facilities, staff, prestige, and `bloodstock` (every horse ever retired). Retiring a
  horse banks its legacy, ages the stud book four years, and pays stud influence
- **`stableHub.ts`** — the between-races hub for the horse in training
- **`trainingScreen.ts`**, **`raceCalendar.ts`**, **`raceDayScreen.ts`** — the career loop
- **`legacyScreen.ts`**, **`dossierScreen.ts`**, **`rivalDossierScreen.ts`** — the records
- **`facilitiesScreen.ts`**, **`staffScreen.ts`**, **`consumablesScreen.ts`** — spending

**Breeding (Phase 5):**
- **`studBook.ts`** — the layer between the yard and `sim/breeding.ts`: who can be bred to, how often
  a pair has bred, what a pairing projects, selling a foal into the world. **DOM-free**; it lives in
  `ui/` only because the `Stable` type does. `pedigreeOf(stable)` is how anything walks a pedigree
- **`breedingScreen.ts`** — the pairing screen. Projected potential ranges and nothing else (§10)
- **`foalDevelopmentScreen.ts`** — the foal's first year: set a rearing plan, see what the year did
- **`yearlingScreen.ts`** — the sale ring, for buying instead of breeding

**Shared pieces:**
- **`statDisplay.ts`** — the one way stats are shown. Grades first, numbers on tap (§3). Also renders
  *ranges*, which is what the pairing screen's projections use
- **`noticeModal.ts`** — every modal in the game. Notices, choices, prompts
- **`badgeLoader.ts`** — tinted portrait badges. What a pedigree tree's cards will want

- **`raceScreen.ts`** — Main race screen component
  - Owns the render loop and game state
  - Handles player input (taps, holds, keyboard)
  - Runs autopilot AI
  - Draws race and results
  - Manages info box for rivals
  
- **`infoBox.ts`** — Horse info card (stats, traits, distance preferences)
  - Appears on hover/click
  - Shows detailed horse information
  - Can be pinned open to read tooltips
  
- **`horsePreview.ts`** — Development view for drawing/testing horses at large scale
  
- **`silksDemo.ts`** — Color picker for testing badge/silk colors
  
- **`roadmap.ts`** — Roadmap/menu system

---

### `/src/data/` — Game Constants & Data
**What it does:** Static game data and generation helpers.

**Key files:**
- **`names.ts`** — Horse name generator (procedural name generation)
  
- **`traits.ts`** — Trait definitions (names, descriptions, effects)
  - "Needs Room" — prefers running room
  - "Turn of Foot" — accelerates well
  - "Badly Affected" — struggles in certain conditions
  
- **`index.ts`** — Game constants:
  - FIELD_SIZE (how many horses per race)
  - RUNNING_STYLES (front-runner, stalker, mid-pack, closer)
  - COAT_IDS (the eight coats, which the genetics in `sim/coat.ts` express)

- **`legacy.ts`** — the prestige economy. A horse's legacy rises and falls with results; retiring
  banks it to the yard. Exponential by division, so the ladder is what a career is worth
- **`purse.ts`** — what a race pays, by division and difficulty
- **`facilities.ts`**, **`staff.ts`**, **`consumables.ts`** — the yard's spending and its effects
- **`wagering.ts`** — backing your own horse. ⚠️ The odds are known-broken; see ongoing-decisions.md
- **`studFee.ts`**, **`foalSale.ts`**, **`foalDevelopment.ts`** — Phase 5's economics: what an outside
  stud costs, what a rejected foal fetches, and what a foal's first year is worth

---

### `/src/main.ts` — Entry Point
**What it does:** Bootstraps the app and owns the screen flow. It is large; navigate it by function
name rather than reading top to bottom.

**The career loop:**
1. Main menu → continue a career, take a new horse, or open the Bloodstock door
2. Stable hub → training, race calendar, facilities, staff, supplies, records
3. Race day → items and a bet, then the race, then the result
4. Retirement → banks legacy, ages the stud book, pays stud influence

**Taking on a new horse** (`nextHorseRoute` → `showNextHorse`) is a crossroads once the yard has
bloodstock: **breed** (`showBreeding`), **buy a yearling** (`showYearlings`), or **start a brand-new
line** (`showStarterSelection`). A bred foal passes through `showFoalDevelopment` before racing.

**Demo routes** still exist behind URL params (`?preview`, `?silks-demo`).

---

## Key Concepts to Understand

### Player Input (`PlayerInput`)
```typescript
{
  kickPending: boolean,    // User tapped to kick
  takingBack: boolean      // User holding to take a pull
}
```
The player (or AI in autopilot) feeds this to the engine every tick.

### Race Snapshot (`RaceSnapshot`)
```typescript
{
  elapsed: number,              // Race time in seconds
  progress: number,             // Leader's progress 0-1
  runners: RunnerSnapshot[],    // State of each horse
  fresh: RaceEvent[]           // New events this tick
}
```
The engine returns this every tick. UI reads it to draw current state.

### Horse Stats
- **Speed** — Top speed ability
- **Stamina** — How long they can race hard
- **Burst** — Kick acceleration power
- **Grit** — Ability to fight when tired
- **Temper** — Consistency (higher = more stable)
- **Consistency** — Repeatability across distances

### Running Styles
- **Front-runner** — Wants to lead early
- **Stalker** — Sits just off the pace
- **Mid-pack** — Settles in the middle
- **Closer** — Comes from behind late

### Moment (When Horse Spends)
- **Early** — Goes early in the race
- **EarlyMid** — Goes before halfway
- **MidLate** — Goes off the turn
- **Late** — Goes late in the race

---

## Data Flow Summary

```
User Action (tap/hold)
    ↓
Input handler → input object updated
    ↓
Tick loop (60fps)
    ↓
Engine reads input → Calculates new state → Returns snapshot
    ↓
Draw function reads snapshot → Renders horses, HUD, results
    ↓
Display on screen
```

---

## The measurement tools

Balance work here is done by **measuring, never by reasoning about the code** — every real defect
this project has shipped passed the unit tests and was visible only by running the thing many times.

| Command | Answers |
|---|---|
| `npm run harness` | Is a race believable? Invariants plus style balance |
| `npm run bloodline` | Is a bloodline believable? Real careers, bred across generations |
| `npm run odds` | Is the betting market honest? Implied against actual win rates |
| `npm run probe` | Why did *this* race happen? A tick-by-tick trace |

README.md documents all of them. Start narrow, widen with env vars once something looks wrong.

---

## Where to Explore Next

1. **Understand the race loop**: Start with `/src/sim/race/engine.ts`
   - Read the `step()` function to see how one tick works
   
2. **Learn horse generation**: `/src/sim/horse.ts`
   - See how horses are created with random stats and traits
   
3. **Trace player input**: `/src/ui/raceScreen.ts` → `/src/sim/race/engine.ts`
   - Follow how a tap becomes a kick in the race
   
4. **Explore AI logic**: `/src/ui/raceScreen.ts` `makeAIDecision()` function
   - See how autopilot makes tactical decisions
   
5. **Study rendering**: `/src/render/track.ts` and `/src/render/spriteHorse.ts`
   - Understand how the visual race is drawn

---

## Debugging Tips

- **Race state**: Check `curr` snapshot in `raceScreen.ts` tick loop
- **Horse stats**: Look at `RunnerSnapshot` in engine.ts for current state
- **Input handling**: Trace input handlers (tap, down, up, key) in raceScreen.ts
- **AI decisions**: Check `makeAIDecision()` output in aiInput object
- **Drawing**: The draw loop happens after `race.step()` in tick
