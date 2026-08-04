# Shield Badge Implementation — Historical Horse Display

## Overview

The shield badge design provides a static UI element for displaying historical horses in pedigree trees, retired-horse archives, and other contexts where a detailed gallop sheet is unnecessary. The design is compatible with the existing sprite/color tinting pipeline, using the same material-ID masking and HSL-based recoloring system.

## Design Assessment

### Why This Works

1. **Clean Color Separation**: The badge design uses distinct, flat colors that separate trivially into independent colorable regions — identical to the gallop sheet's approach.

2. **Existing Pipeline**: The badge recoloring can use the exact same HSL-based tinting system in `spriteHorse.ts`:
   - Extract each colored region as a separate layer (body, mane/legs, outline)
   - Apply coat genetics tinting to the body (grey → chestnut, bay, palomino, etc.)
   - Apply accent colors to mane/legs and shield outline
   - Preserve luminance offsets and shading through the `meanL` calculation

3. **Scalability**: One base badge design + the existing coat/genetics system = unlimited variants:
   - Use the exact same `coatFor()` function and `Coat` interface
   - Apply the same `tintedSheet()` caching strategy (keyed by color scheme)
   - Reuse `hexToHsl()` and `hslToRgb()` color conversion functions

4. **Static vs. Animated**: Unlike the gallop sheet (24-frame animation), the badge is a single static image:
   - Simpler rendering: draw once, cache by scheme
   - No frame-interpolation complexity
   - Can render as PNG or canvas depending on context

### Considerations

**Style Consistency**: The badge is pixelated/low-detail compared to the gallop sheet. This is intentional for a UI badge (similar to profile icons in most games), but establishes a separate visual language for "static references" vs. "in-race animation."

**Mane/Leg Color**: Currently red/magenta. Three options:
1. **Fixed accent** (recommended): Keep as a stylistic constant, like racing silks colors. Simpler, cleaner UI.
2. **Genetic inheritance**: Derive from sire/dam genetics. Adds visual richness but increases schema/rendering complexity.
3. **Secondary trait system**: Map to temperament, bloodline, or other horse attribute. Requires design decision on which attribute.

**Decision**: Recommend option 1 (fixed accent) for Phase 0. It's simple, unambiguous, and can be overridden per-horse if needed later (e.g., for a player's personal touches).

## Implementation Phases

### Phase 0 — Core Rendering (Minimal)

**Goal**: Render a badge with coat genetics, caching by color scheme.

**Files to Create**:
- `src/render/shieldBadge.ts` — Badge rendering (parallel to `spriteHorse.ts`)

**Implementation**:
```typescript
// shieldBadge.ts structure
export interface BadgeScheme {
  coat: string;           // e.g., 'bay', 'chestnut'
  accentColor?: string;   // e.g., '#E63946' for mane/legs/outline
}

export function tintedBadge(scheme: BadgeScheme): HTMLCanvasElement | null {
  // Load badge asset (PNG or SVG)
  // Create mask layer (material IDs per pixel)
  // Apply HSL tinting identical to spriteHorse.ts
  // Cache by scheme key (like tintedSheet does)
  // Return canvas
}

export function drawShieldBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scheme: BadgeScheme,
  scale: number = 1,
): boolean {
  // Draw the tinted badge onto the given canvas context
}
```

**Asset Requirements**:
- Base badge PNG (grey body, red/magenta mane/legs, blue outline)
- Mask PNG (material IDs per pixel, same encoding as `racer-mask.png`)
  - Material 1: body (tinted with coat color)
  - Material 2: mane/legs (tinted with accent color or kept fixed)
  - Material 3: outline (fixed or tinted)
  - Material 0 or 6+: transparency/fixed elements

**Integration Points**:
- `src/data/index.ts`: Export badge-related types (already has `CoatId`)
- `src/render/palette.ts`: Reuse `Coat`, `coatFor()`, HSL functions
- `src/render/spriteHorse.ts`: Borrow `hexToHsl()`, `hslToRgb()`, caching pattern

### Phase 1 — UI Integration (Context-Specific)

Once rendering works, integrate into specific UI contexts:

1. **Pedigree Trees**: Render badges as nodes, clickable to view full horse details
2. **Retired Horse Archive**: List/grid view with badges and stats
3. **Hall of Fame**: Display championship-winning horses with badges
4. **Breeding Prospects**: Show sire/dam with badges and genetic preview

Each context has its own rendering needs (hover states, click handlers, layout). The badge rendering itself stays isolated in `shieldBadge.ts`.

### Phase 2 — Advanced Features (Optional)

- **Mane/Leg Inheritance**: If decided later, add a genetics system to compute accent colors
- **Animated Variants**: Badges for in-race display (if ever needed) with frame support
- **Performance Tuning**: Profile cache hit rates, consider WebWorker offloading if needed

## Technical Details

### Color Tinting Algorithm

Identical to `spriteHorse.ts`:

1. **Load assets**: Base badge PNG + mask PNG
2. **Calculate mean luminance per material**: Average brightness of each colored region
3. **For each pixel**:
   - Read material ID from mask
   - If tinted (material 1-3): preserve luminance offset from mean, apply new hue/saturation
   - If fixed (material 0, 6+): pass through unchanged
4. **Cache by scheme**: Key = `${coat}|${accentColor}`

### Caching Strategy

Reuse the `tintedSheet` pattern from `spriteHorse.ts`:
- LRU cache (capped at 10-20 entries)
- Keyed by color scheme
- Collapses canvas immediately on eviction to free memory

**Why this works**:
- Badges are far smaller than full sprite sheets (single frame vs. 24 frames)
- Memory footprint per badge ≈ 512×512×4 bytes ≈ 1 MB
- LRU cap of 20 = 20 MB worst-case, vs. 6.25 MB per full sheet
- Same race never renders more than ~10 unique schemes (1 player + 7 AI + spares)

### Asset Format

**Base Badge PNG**:
- Dimensions: 512×512 (scaled down in UI as needed)
- Transparency: Yes (RGBA)
- Color Space: sRGB
- Format: PNG (lossless, for crisp pixels)

**Mask PNG**:
- Dimensions: 512×512 (exact match to base)
- Grayscale, 8-bit per channel
- Encoding: `material_id = Math.round(pixelValue / 40)`
  - Same as `racer-mask.png`: 0=transparent, 1-3=tinted, 4-6=fixed
  - Allows 8 materials per pixel (0-7), encoded as 0, 40, 80, ..., 280

## Unanswered Design Decisions

1. **Mane/Leg Inheritance**: Fixed accent (recommended) vs. genetic vs. trait-based?
2. **Outline Color**: Always blue (silks-like), or derived from something?
3. **UI Contexts**: Which screens use badges first? (Pedigree trees are the obvious start.)
4. **Click Behavior**: Badges → full horse detail view, or just hover tooltip?

## Open Questions for Implementation

1. Where should the badge asset live? (`src/assets/shield-badge.png` + `src/assets/shield-badge-mask.png`)
2. Should `BadgeScheme` use `Silks` too, or keep accent color separate?
3. Cache size: 10, 20, or dynamic based on available memory?
4. Performance target: "load and render 1 badge in <5ms" or more aggressive?

## References

- `src/render/spriteHorse.ts` — The full tinting pipeline; badge rendering mirrors this
- `src/render/palette.ts` — Coat definitions, HSL functions, Silks colors
- `tools/bake-sprites.ts` — How the current mask is generated (for understanding, not reuse)
- `src/sim/types.ts` — Horse type, Stats, Coat type definitions

## Recommendation

Implement Phase 0 (core rendering) first. It's a complete subsystem in isolation — test and verify that the tinting works before moving to UI integration. The badge rendering code should look almost identical to `spriteHorse.ts`'s `tintedSheet()` function, just without frame animation.
