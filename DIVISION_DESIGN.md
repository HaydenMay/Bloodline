# Division System Design - Phase 3

## Overview

The division system creates a structured career progression where both player and AI horses advance/demote through five tiers based on performance. Divisions affect race difficulty, opponent quality, and create narrative checkpoints in the career.

**Divisions (Bottom to Top):**
1. Maiden (entry level)
2. Novice
3. Open (middle tier, reference point)
4. Stakes
5. Championship (elite)

---

## Player Division Progression

### Points System

Players accumulate **division points** within their current division. Each race result modifies points:

- **1st Place (Win)**: +3 points
- **2nd-3rd Place (Top 3)**: +1 point
- **4th-6th Place (Mid-field)**: 0 points (no change)
- **7th-8th Place (Outer)**: -1 point

### Promotion (Reaching +5 Points)

When a player reaches +5 points in their current division:

1. The race calendar shows ONE special **Promotion Race** (instead of 3 regular races)
2. This race features horses from the NEXT division up
3. **Field composition** (see "Race Field Population" section below)
4. **Finishing placements:**
   - **1st-4th**: Player PROMOTES to next division, divisionPoints reset to 0
   - **5th-8th**: Player STAYS in current division, divisionPoints reset to 2 (not harshly punished for attempting above their weight class)
5. Cannot promote above Championship division

### Demotion (Reaching -3 Points)

When a player reaches -3 points in their current division:

1. A warning popup appears: "You are at risk of demotion. Place top 4 or you will be demoted."
2. The race calendar shows ONE special **Demotion Race** (instead of 3 regular races)
3. This race features horses from the DIVISION BELOW
4. **Field composition** (see "Race Field Population" section below)
5. **Finishing placements:**
   - **1st-4th**: Player STAYS in current division, divisionPoints reset to 0
   - **5th-8th**: Player DEMOTES to previous division
6. Cannot demote below Maiden division

### Division Points Persistence

Division points are stored in `career.horse.divisionPoints` and saved with the career. They carry over between sessions.

---

## AI Division Progression

### Points Tracking

AI horses track division points the same way as the player:
- Win = +3 points
- Top 3 (2nd-3rd) = +1 point
- 4th-6th = 0 points
- 7th-8th = -1 point

Points are stored in the dossier (`career.stable.dossier[rivalId]`) and persisted.

### Promotion/Demotion Logic

AI horses follow the same thresholds as the player:
- **+5 points**: Promote to next division (cannot promote above Championship)
- **-3 points**: Demote to previous division (cannot demote below Maiden)

When an AI horse changes divisions, update their `dossier.division` field.

### Base Stats and Division Multipliers

AI horses are generated with **base stats** that never change. These stats are then multiplied by a **division modifier** to determine their actual race performance.

**Why this design:**
- Avoids stat drift from repeated multiplications
- Clean representation of "natural ability" vs "division placement"
- Easy to adjust difficulty by tweaking multipliers

**Generation Process:**
1. Generate AI horse with base stats (as if at Open tier, 1.0x reference)
2. Randomly assign to starting division
3. Display stats = baseStats × divisionMultiplier[division]

**Division Multipliers:**
- Maiden: 0.6x
- Novice: 0.8x
- Open: 1.0x (reference)
- Stakes: 1.2x
- Championship: 1.5x

**Example:**
```
Generated baseStats: Speed 60, Stamina 55, Burst 52, Grit 58, Temper 61, Consistency 59

Assigned to Maiden division (0.6x):
Display stats: 36, 33, 31, 35, 37, 35

Later promotes to Novice (0.8x):
Display stats: 48, 44, 42, 46, 49, 47

Later promotes to Open (1.0x):
Display stats: 60, 55, 52, 58, 61, 59
```

### AI Horse Storage

Add to Horse type:
- `baseStats?: Stats` - Only for AI horses (players use regular `stats`)
- `divisionLevel: number` - 0 to 4 (Maiden to Championship)

Add to RivalDossier entry:
- Already tracks `division: Division` - keep this in sync with divisionLevel

---

## Race Field Population

The opponent pool for ANY race (regular, promotion, demotion) is populated by the same rules. The rules differ based on race type.

### Promotion Race Field (Division X → X+1)

**Scenario:** Player in Division X with +5 points. Racing against Division X+1 horses.

**Field population in order:**
1. Add all Division X horses with +5 points (other promotion candidates trying to advance)
2. If < 8 total, add Division X+1 horses with -3 points (horses at risk of demotion from next tier)
3. If < 8 total, add any remaining Division X+1 horses (healthy/mid-tier horses from next division)
4. If < 8 total, add other Division X horses (non-promotion-eligible horses from current division as fallback)

**Narrative effect:**
- Race your peers (fair test)
- See struggling horses from next tier (shows you might belong)
- Face healthy horses from next tier (realistic field strength)
- Fallback ensures you always race 8 opponents

### Demotion Race Field (Division X → X-1)

**Scenario:** Player in Division X with -3 points. Racing against Division X-1 horses.

**Field population in order:**
1. Add all Division X horses with -3 points (other horses also at risk of demotion)
2. If < 8 total, add Division X-1 horses with +5 points (promotion candidates from lower tier trying to move up)
3. If < 8 total, add other Division X horses (your stable-mates not at risk, doing OK)
4. If < 8 total, add any other Division X-1 horses (random lower division horses as fallback)

**Narrative effect:**
- Race other horses fighting to survive (your direct competition for staying in division)
- Face hungry lower-tier horses moving up (show you can beat promotion candidates)
- Race your stable-mates for context (fallback)
- Final fallback to random lower division (worst case)

### Regular Race Field

For non-promotion/non-demotion races, field is populated from horses in the player's current division. (Implementation can use similar pool logic or simpler approach—same rules apply.)

---

## Data Structure Changes

### Horse Type (`src/sim/types.ts`)

Add fields:
```typescript
interface Horse {
  // ... existing fields ...
  
  /** Division level (0=Maiden, 1=Novice, 2=Open, 3=Stakes, 4=Championship) */
  divisionLevel: number;
  
  /** Points accumulated toward promotion/demotion in current division */
  divisionPoints: number;
  
  /** Base stats for AI horses. For player, use regular stats field. */
  baseStats?: Stats;
}
```

### RivalDossier Entry

Already tracks `division` - keep this in sync with `divisionLevel`:
```typescript
export interface RivalDossier {
  [rivalId: string]: {
    wins: number;
    places: number;
    shows: number;
    starts: number;
    division: Division;          // Keep in sync with divisionLevel
    lastSeen: number;
  };
}
```

### Career

No changes needed - divisionPoints and divisionLevel live on the horse object.

---

## Race Results Processing

After each race completes:

1. **Calculate finishing placement** (1st-8th place)
2. **Calculate division points change** based on finishing
3. **Update player horse divisionPoints**
4. **Check for promotion/demotion:**
   - If divisionPoints >= 5: Trigger promotion race next calendar
   - If divisionPoints <= -3: Trigger demotion warning + demotion race next calendar
5. **Update AI horses:**
   - Calculate placement points for each AI horse
   - Update their divisionPoints in dossier
   - Check for AI promotion/demotion
   - If demoting, apply 0.8x multiplier to baseStats
   - If promoting, apply 1.2x multiplier to baseStats (one-time per division change)

**Important:** AI stat multipliers happen when divisionLevel changes, not from divisionPoints accumulation. Only divisionLevel determines displayed stats.

---

## Race Calendar Integration

### Regular Races

When generating the weekly race calendar for the player's current division:
- Show 3 random race options from the division
- Each race has a randomized opponent pool

### Promotion Race

When player has +5 points:
- Show 1 Promotion Race option (no regular races this week)
- Race name: e.g., "Championship Qualifier" or "Promotion Test"
- Field: Follow "Promotion Race Field" rules above

### Demotion Race

When player has -3 points:
- Show warning popup: "You are at risk of demotion. Place top 4 or you will be demoted."
- Show 1 Demotion Race option (no regular races this week)
- Race name: e.g., "Division Qualifier" or "Demotion Test"
- Field: Follow "Demotion Race Field" rules above

---

## UI Elements

### Division Display

- Show player's current division prominently (race intro, career stats, etc.)
- Show division points progress (e.g., "3/5 to promotion" or "1/3 to safety from demotion")

### Promotion Alert

After placing top 4 in promotion race:
```
🎉 PROMOTION! 🎉
You've been promoted to [Next Division].
Your division points reset to 0.
```

### Demotion Alert

After placing 5th-8th in demotion race:
```
📉 DEMOTION 📉
You've been demoted to [Previous Division].
```

### Promotion Race Readiness

When reaching +5 points:
```
🏆 You're ready for the next division! 🏆
This week's race calendar features a Promotion Test.
Race the next tier and finish top 4 to advance.
```

---

## Examples

### Example 1: Player Promotion Path

**Week 1-3:** Player in Maiden division, accumulates points
- Week 1: Win race → +3 points (3/5 to promotion)
- Week 2: Place 3rd → +1 point (4/5 to promotion)
- Week 3: Place 2nd → +1 point (5/5 - ready for promotion!)

**Week 4:** Promotion Race triggers
- Race calendar shows: "Championship Qualifier" (1 race only)
- Field includes: 2 other Maiden horses at +5, 2 Novice horses at -3, 3 random Novice horses
- Player places 2nd → **PROMOTION to Novice!**
- divisionPoints reset to 0
- Next week: race in Novice division

### Example 2: AI Horse Division Change

**Generated:** AI horse "Blazing Spirit"
- baseStats: Speed 72, Stamina 68, Burst 70, Grit 75, Temper 72, Consistency 71
- Random assignment: Novice division (0.8x multiplier)
- Display stats: 58, 54, 56, 60, 58, 57 (1.2x multiplier)

**Over several races:** Accumulates +5 points
- Promotes to Open division (1.0x multiplier)
- Display stats: 72, 68, 70, 75, 72, 71 (baseStats × 1.0)
- divisionPoints reset to 0

**Later:** Accumulates -3 points, demotes back to Novice
- divisionPoints reset to 0
- Display stats: 58, 54, 56, 60, 58, 57 (0.8x multiplier again)

### Example 3: Demotion Risk

**Scenario:** Player in Open division with -2 points
- Week 1: Place 7th → -1 point (now -3 points, at demotion risk)
- Demotion warning appears
- Race calendar shows: "Division Qualifier" (demotion race only)
- Field includes: 2 other Open horses at -3, 2 Maiden horses at +5, 3 random Maiden horses

**Outcomes:**
- If place 1st-4th: Stay in Open, divisionPoints reset to 0
- If place 5th-8th: Demote to Novice, start fresh there

---

## Edge Cases

1. **At Championship (can't promote further)**
   - At +5 points: No promotion race, points cap at 5, stay in Championship
   - Continue racing Championship division races normally

2. **At Maiden (can't demote further)**
   - At -3 points: No demotion race, points cap at -3, stay in Maiden
   - Continue racing Maiden division races normally

3. **Insufficient opponents for race field**
   - Rare but possible: e.g., no promotion candidates in current division
   - Fall back to next pool tier, fill remaining with any horses in division

4. **AI horse at boundary divisions**
   - Same rules as player: can't promote above Championship, can't demote below Maiden

---

## Testing Checklist

- [ ] Player accumulates points correctly
- [ ] Promotion race triggers at +5 points
- [ ] Demotion warning + race triggers at -3 points
- [ ] Promotion/demotion UI alerts display
- [ ] Division points reset correctly after promotion/demotion
- [ ] Can't promote above Championship
- [ ] Can't demote below Maiden
- [ ] AI horses track points in dossier
- [ ] AI horses promote/demote correctly
- [ ] AI stat multipliers display correctly
- [ ] Race field populates with correct opponents
- [ ] Career saves/loads with division state intact
