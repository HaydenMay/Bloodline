# Bloodline Codebase Overview

## High-Level Architecture

**Bloodline** is a horse racing simulation with three main layers:

1. **Simulation Engine** (`/src/sim/`) — Race logic, AI jockeys, horse stats
2. **Rendering System** (`/src/render/`) — Canvas drawing, HUD, visuals
3. **User Interface** (`/src/ui/`) — Race screen, info boxes, player controls
4. **Game Data** (`/src/data/`) — Static data: names, traits, constants

## Folder Breakdown

### `/src/sim/` — The Race Engine
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
**What it does:** Creates interactive UI and handles user input.

**Key files:**
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
  - STAT_KEYS (speed, stamina, burst, grit, temper, consistency)

---

### `/src/main.ts` — Entry Point
**What it does:** Bootstraps the app.

**Flow:**
1. Checks URL params (`?preview` = horse preview, `?silks-demo` = color picker)
2. Generates a random field of horses
3. Picks one as player
4. Launches race screen
5. Handles "New race" button for restarting

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
