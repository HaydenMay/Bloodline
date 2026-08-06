# Bloodline Next Phase Plan

## Phase Completed ✓
**Visual Polish & Color System** — All colors consolidated to single source of truth
- Centralized color definitions (40+ UI variants, horse details, environment)
- Updated all canvas rendering (race screen, track, horse, UI screens)
- Extended CSS variables for consistent theming
- Default color definitions for backward compatibility

---

## Phase Next: Screen Transitions & Visual Flow

### 1. **Race Intro Screen** (Priority)
Create a loading/intro screen that plays before the race starts, replacing the immediate jump from calendar→race.

**Features:**
- Fade-in animation for race name
- Display race details: distance, going, field size, prize
- Optional: Brief horse profile or silks preview
- Smooth transition to race controls

**Implementation:**
- New component: `mountRaceIntro()` in `src/ui/raceIntro.ts`
- Add to race flow before `mountRaceScreen()`
- Reuse centralized UI colors for consistency
- Use canvas or CSS transitions for fade effects

**Files to modify:**
- `src/main.ts` — add intro before race screen in both demo and career flows
- New file: `src/ui/raceIntro.ts`

**Timeline:** Low complexity, 1-2 hours

---

### 2. **Idle Horse Animation on Training Screen** (High Priority)
Add a relaxed, looping horse animation to the training screen to break static layout.

**Design Options:**
- **Option A**: Walk/stand cycle — horse paces slowly side-to-side or shifts weight
- **Option B**: Fidget cycle — tail sway, ears rotate, head bob
- **Option C**: Both — walk + fidget combined

**Implementation:**
- Add canvas element to training screen
- Use existing horse rig with low-intensity pose
- Procedural animation loop (no frame-based keyframes)
- Keep lightweight — doesn't block training UI

**Files to modify:**
- `src/ui/trainingScreen.ts` — add canvas and animation loop
- Reuse `drawHorse()` from `src/render/horse.ts`

**Timeline:** 1-2 hours depending on animation complexity

---

### 3. **Visual Hierarchy & Polish** (Medium Priority)
Refine UI spacing, typography, and visual feedback across key screens.

**Focus areas:**
- **Training Screen**: Better separation of stats, actions, and animation
- **Race Results**: Clearer placement of recap vs. placings
- **Career Summary**: Balance data density with readability
- **Starter Carousel**: Enhance stat block clarity and contrast

**Implementation:**
- CSS refinements in `src/style.css`
- Adjust padding, margins, font sizes
- Use UI color variables for emphasis/hierarchy
- Test on mobile (42m width constraint)

**Timeline:** 2-3 hours, iterative

---

## Phase After: Horse Sprites & Content (Deferred)

### 4. **Expand Horse Sprite Usage** (Low Priority)
Add animated horse sprites to training screen preview and other UI locations.

- Training screen: Show player's horse animated during training
- Career summary: Display horse sprite alongside recap
- Results screen: Show finishers' sprites in results visualization

**Rationale**: Deferred because:
- Sprites already work in race and starter screens
- Foundation for reuse is solid
- Not critical for core gameplay loop
- Can be batched with future content updates

---

## Technical Debt & Maintenance

### Quick Wins (1-2 hours each)
- [ ] Add default focus/keyboard navigation to race controls
- [ ] Test audio integration (audio not yet present in codebase)
- [ ] Verify mobile viewport constraints across all screens
- [ ] Check accessibility: color contrast ratios, screen reader hints

### Medium Tasks (2-4 hours)
- [ ] Add loading spinners for sprite decode delay
- [ ] Implement screen shake during dramatic race moments
- [ ] Add pause/resume for long races
- [ ] Cache sprite sheet in IndexedDB for offline play

---

## Recommended Sequence

**Week 1:**
1. Race intro screen + fade transition
2. Idle horse animation on training screen
3. Test both in demo and career flows

**Week 2:**
1. Visual hierarchy polish (CSS refinements)
2. Mobile testing across all new screens
3. Accessibility pass (contrast, keyboard nav)

**Week 3+:**
1. Horse sprite expansion (if time permits)
2. Advanced animations (screen shake, transitions)
3. Content: more race types, training strategies

---

## Success Criteria

- ✓ Race intro plays smoothly before every race
- ✓ Training screen horse animation loops without stuttering
- ✓ All new screens follow color system and visual hierarchy
- ✓ Mobile layout holds at 42m width (no horizontal scroll)
- ✓ Zero color hardcoding outside dev-only features
- ✓ Feature works in both demo (?test-race) and career flows
