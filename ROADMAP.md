# Bloodline — Build Roadmap

Companion to [DESIGN.md](DESIGN.md) and [TRAITS.md](TRAITS.md).

---

> ## ⛔ EVERYTHING IN THE NEXT FOUR SECTIONS IS HISTORY, NOT INSTRUCTIONS
>
> The race simulation described below **no longer exists** — AI, movement, constants,
> the charge economy and the Moment system were all deliberately removed (commit
> `ace33f2`) after three failed redesigns.
>
> **[REBUILD.md](REBUILD.md) is the current specification.** Read it before touching
> anything under `src/sim/race/`.
>
> Keep the sections below. They are the most valuable thing in this repository: a
> measured record of what was tried, what it did to the numbers, and why it failed.
> REBUILD.md's §17 "Do-not list" is drawn directly from them. Read them as evidence,
> never as a description of the code.

---

## 📚 HISTORY — the energy economy was replaced with kick charges

**Superseded by [REBUILD.md](REBUILD.md). Kept as a measured record.**

The kick-charge rebuild itself is DONE and
compiles/lints/tests clean. On top of it, WHEN a horse kicks has been split out from running style
into its own independent `Moment` attribute (see the Moment history section further down) — that
part is NOT yet balanced: style balance and pace-collapse both currently fail the harness, after a
serious structural bug (effort commitment never coming back down) was found and fixed. Start there,
not from scratch — the fix is done, the retune on top of it is not. Elsewhere still open: elite
divisions no longer visibly tightening up. The owner's own words, kept for context — these
supersede anything below in this doc that still describes the old model:

> Stamina should be like a gas tank. It doesn't provide more power the more gas is in the tank.
> It's the amount of how far the effort can go. It should allow for maximum kicks and urges rather
> than how much power there [is].
>
> I don't want urges. I want to only be able to tap... I don't think I want the stamina bar and I
> think I want a number of kicks available (kick charges is fine terminology) that regenerate
> ALWAYS but regenerate quicker in good positioning. Tapping anytime should use one kick. Then have
> it regenerate.
>
> [Holding should] boost charge regen. Kick strength tied to Grit and jockey skill — not banked
> energy. If it's tied to Grit already, leave it like that.

**The target design, in full:**
- **No continuous 0–100 energy value at all.** Not just hidden from the player — removed from the
  simulation. This affects every runner, AI included, since there is no separate resource left for
  AI riders to have either.
- **Kick charges are the only resource.** A small integer bank per horse. Tapping — any time, no
  separate "urge" — spends one charge and fires the existing kick mechanic (a temporary speed
  multiplier, `speedCap *= 1 + kickStrength`, lasting `KICK_BASE_DURATION`).
- **Kick strength = Grit × jockey skill.** Deliberately NOT scaled by how full the bank is — a
  horse with 3 charges banked and one with 0.2 kick equally hard; the bank only gates whether you
  can fire at all, never how hard.
- **Charges regenerate always**, never stuck, never negative — faster in a good spot for the
  horse's running style, slower out of it. Reuse the position-quality math already built this
  session (`frontPenalty`/`misfit`/`fit`/`RECOVERY_FLOOR` and friends in `engine.ts` — the whole
  "how fast do you refill" computation) — just retarget it at charge-regen rate instead of energy.
- **Holding (take a pull)** still settles the horse back (costs ground, as before) and now ALSO
  gives an extra boost to charge regen on top of the position bonus — a deliberate "bank a charge"
  move.
- **Stamina (the stat) sets REGEN RATE, continuously — not tank size.** Reversed from the first
  reading of "gas tank" above: capacity as an integer breakpoint (every N Stamina points = +1
  charge) makes training feel dead everywhere except the breakpoint itself. Regen rate is
  continuous instead, so every point of Stamina always pays off immediately — same shape as
  `STAMINA_CHARGE_REGEN_INFLUENCE` used to scale `BASE_DRAIN`. Capacity (`CHARGE_CAPACITY`) is a
  **fixed constant for every horse**, set to 5 rather than 3 — races run 45–75s+ and scale with
  distance, so a field needs enough charges across establishing position, a mid-race response, and
  the finish without exhausting the resource early in a long route. Both numbers are first-pass and
  named explicitly in "Known issue" below for retuning.
- **No more "fade."** `FADE_THRESHOLD`/`FADE_FLOOR`/`GRIT_FADE_RELIEF` (speed collapsing on low
  energy) have no meaning without a continuous energy value — remove them, don't repurpose them.
- **Aptitude needs a new home.** It used to cost energy ("a sprinter over a route runs out, not
  slower"). With no energy, the cleanest replacement is a direct `maxSpeed` penalty for a badly
  suited distance — untested, just the obvious mapping.

**What's done now, matching the target design above:** the continuous energy value is gone entirely
— `MAX_ENERGY`/`BASE_DRAIN`/`BASE_RECOVERY`/`REST_RECOVERY_BASE`/`FADE_*`/`APTITUDE_DRAIN_PENALTY`
all removed from `constants.ts`. `Runner.energy`/`drainRate`/`recoveryRate`/`fadeRelief`/
`energyRate`/`energyFactor` are gone from `engine.ts`; `stepRunner`'s energy section is rewritten
around `chargeProgress` (a 0–1 float per horse that converts into a `kicksRemaining` integer at 1,
capped at `CHARGE_CAPACITY`). `EnergyFactor` is removed from `types.ts` entirely — no HUD "why is it
moving" reporting in a charges-only model. `ai.ts`'s energy-reserve effort throttle is gone (the
establish/hold position-correction logic stays — it is navigational, not a budget, now).
`recap.ts`'s `energyLeft` narrative became `kicksLeft`, same "banked but unspent" idea.
`raceScreen.ts` dropped the energy bar/chevrons/cause-tags and the whole urge mechanic — **every tap
now spends a kick charge, at any point in the race**, exactly as the owner specified; hold still
takes a pull. The five traits that referenced drain/recovery (**Iron Lungs**, **Quick Recovery**,
**Thirsty**, **Cruiser**, **Alert**) plus **Gate Rusher**'s early cost got charge-regen equivalents
— see TRAITS.md, "The charge economy". Aptitude is now a direct `maxSpeed` penalty
(`APTITUDE_SPEED_PENALTY`) rather than an energy cost.

Found and fixed along the way: the AI's kick condition (`race.progress >= kickAt`) stayed true every
tick once crossed, with no "already kicked" guard in the engine — every AI horse would have burned
its whole charge bank in a fraction of a second on entering its kick window rather than spending
one. Fixed with a one-shot guard in `ai.ts`'s closure. The player side was never affected — the UI
already consumed `kickPending` immediately per tap.

### Known issue — style balance broke with the charge rebuild

✅ **Fixed.** `npm run harness`, first run against the new model: frontRunner **FAILED**, 7.7%
against a fair 12.5% (-39% relative, the bar is 30%).

The first hypothesis here (charge regen's "restraint" bonus rarely engaging for a front-loaded
style) did not hold up — traced with `tools/probe.ts`'s effort table and it turns out EVERY style
rides at or above its own `cruiseEffort` almost the whole race under default AI control
(`HOLD_EFFORT` = 0.55 sits above every style's `cruiseEffort`), so the restraint bonus barely
engages for anyone, not just frontRunner. Not the cause.

The real cause: `PHASE_PROFILES.frontRunner.late` was `-0.013`, tuned back in the original Phase 4.5
pass when a continuous energy fade ALSO existed to reinforce a front-runner's late-race slowdown.
Removing fade entirely (this rebuild) left that `-0.013` as an uncompensated penalty with nothing
backing it up anymore, while every other style's positive late number went on working unopposed. A
fast proxy sweep (a standalone copy of `tools/harness.ts`'s own `styleBalance()`, same seed prefix,
at `RACES=250` — same method Phase 4.5 used) showed how sharp the lever is: `+0.02` overshot to
22.2%, `late: 0` — not a bonus, just removing the now-unbacked penalty — landed at 12.2% against
the full 1200-race harness, with every other style still inside the 30% bar (worst is midPack at
+12%, stalker -10%, closer +1%). `tools/margin-profile.ts` unchanged by this fix (27.9L vs 28.2L at
8th) — a style-balance-specific fix, not a tail-margin one.

### Known issue — elite divisions no longer tighten up

Surfaced by the same harness run, separate from the style-balance fix above: division sanity now
**FAILS** on "elite racing is tighter" (championship margin 8.3L vs maiden 8.2L — essentially flat,
where the harness wants tighter). This check passed before this rebuild (7.4L → 5.2L). Average
winning margin is 8.5L across divisions, wider than the pre-rebuild 6.3L — both numbers are already
inside the pre-existing "winning margins are too wide" known issue below, which the harness treats
as informational rather than gating, but the elite-tightens-up check specifically regressed from a
pass to a fail and has not been diagnosed yet. Likely related to removing the fade mechanic (which
was where elite fields' higher Consistency used to visibly pay off — no fade left to be spared from
means less separation between a clean elite field and a division that has more genuine trouble).
Not traced to a specific cause the way the style-balance issue above was — that is next.

### Known issue — the player's own ride never committed in the stretch

✅ **Fixed.** `npm run ride-probe` surfaced this: the player's own controller (`ui/raceScreen.ts`)
rode at a FLAT `cruiseEffort` for the entire race, never ramping into the stretch commitment AI
riders get (`ai.ts`'s `commitment = 0.82 + ...`). Effort feeds speed via
`effortSpeed = MIN_EFFORT_SPEED + (1 - MIN_EFFORT_SPEED) * effort` — at `MIN_EFFORT_SPEED = 0.78`,
riding the stretch at `cruiseEffort` (~0.5) versus an AI's commitment (~1.0) cost roughly 11% of top
speed, which `KICK_MAX_BONUS` (8.5% at full strength) could not fully buy back regardless of timing.
Measured before the fix: even "kick in window" (a single well-timed tap) won only 4/150 races
against a fair share of 19/150 — barely above "hands off" doing nothing at all. This flat-cruise
shape predates the charge rebuild (it was `PLAYER_CRUISE_CAP` in the old energy model), so it was
not something this rebuild introduced, just something it never re-verified.

Fixed by giving the player's default ride the AI's own establish/hold/commit curve (`baseRide`'s
`effort`, not a flat constant) — input still MODULATES it (hold caps it down, tap fires a kick) but
no longer replaces it outright. There was never a design reason pace commitment should be the one
piece withheld from an otherwise-competent default ride, when lane-seeking already was not. Verified
with `npm run ride-probe`: "kick in window" now wins 18/150, right at the 19/150 fair share, clearly
ahead of "hands off" (8/150) and "kick mistimed" (7/150) — riding well beats doing nothing, and
timing beats mistiming. `npm run harness` re-run afterward: unaffected, since the harness never uses
the player-specific controller — style balance, pace-collapse and dominance curve numbers are
identical to before this fix.

### Known issue — spamming every charge out-earned a well-timed one

✅ **Fixed.** Found right after the fix above: "spam every charge" (tap the instant one is
available, no timing at all) won 23/150 in `ride-probe`, MORE than "kick in window" (18/150) —
spamming beat timing outright, which contradicts the owner's stated intent: save charges for the
window, land them there, then spend what's left afterward as needed. A mistimed kick's STRENGTH was
already discounted by `windowFit` (`KICK_MIN_FIT` floor, `KICK_WINDOW_FALLOFF`), but its DURATION
(`kickRemaining = KICK_BASE_DURATION`) was not — so a stream of weak mistimed kicks, refired the
instant a new charge arrived, still covered most of the race at reduced strength and out-earned one
strong kick held for its ~13s window on raw TIME COVERED, not strength.

Fixed with two changes: `KICK_MIN_FIT` lowered 0.35 → 0.05 (a badly mistimed kick is now genuinely
weak, not a guaranteed 35% floor), and a new `KICK_MISTIMED_DURATION_FLOOR` (0.3) scales a kick's
DURATION by the same `windowFit` its strength already used — a mistimed kick is now shorter as well
as weaker, which is what actually stops spam from covering the whole race. Verified with
`ride-probe`: "kick in window" 18/150 now clearly beats "spam every charge" 15/150, with "kick
mistimed" (6/150) and "hands off" (8/150) both well behind either. Re-verified against the full
harness and `margin-profile` afterward — both unchanged, since neither AI riders nor style balance
were ever mistimed enough for this to matter to them; it only bites naive/lazy play.

### 📚 HISTORY — Moment: WHEN a horse kicks, split out from Style

**New independent attribute**, `Horse.moment` (`'early' | 'earlyMid' | 'midLate' | 'late'`,
`data/index.ts`), added because the kick window used to be a fixed function of running style —
every frontRunner peaked at the same point, every closer at another — which read as flat once you
noticed it (the owner: "why do all my horses have the same window?"). Style (`STYLE_PROFILES`) now
governs WHERE a horse sits in the pack only; Moment (`MOMENT_WINDOWS`, `MOMENT_PROFILES`,
`sim/race/constants.ts`) governs WHEN its kick window opens and its passive phase-bonus curve peaks
— independent, but weighted per style so archetypes stay sensible
(`MOMENT_WEIGHTS_BY_STYLE`): frontRunner rolls heavily `early` (asserts the lead, then holds it —
Derby Owners Club's "Quick Start"), midPack is the flat generalist (roughly a third each across the
back three), stalker and closer both lean hard `late` (closer almost entirely so — "Last Spurt"),
distinguishing "reads like a closer" from "is one" by degree, not by a different shape. Windows:
`early` 0-25%, `earlyMid` 20-55%, `midLate` 55-90%, `late` 80-100% — deliberately wide and
overlapping at the edges, not a narrow point: "during your entire moment, your horse should be
getting full-strength kicks" (the owner). `ai.ts`, `engine.ts` and `raceScreen.ts`'s HUD all read
the window from the horse's own Moment now, not a per-style constant.

**A serious structural bug was found and fixed while building this, not yet fully retuned after.**
First harness run against Moment: frontRunner 39.7% against a fair 12.5%, closer 0.4% — far worse
than any single-lever balance miss this project has hit before. Traced directly (not asserted):
the actual cause was `effort = Math.max(effort, commitment)` in `ai.ts` never coming back down once
a horse commits. Under the old style-keyed system every style's commit point clustered together
late (0.7-0.82), so nobody benefited much from committing "early" — the race was nearly over either
way. Splitting Moment out spread commit points across the WHOLE race (0-80%), so an `early`-moment
horse could commit at t=0 and simply stay at ~max effort for the entire race — confirmed by tracing
a single race directly: a closer fell 60 lengths behind by 75% of the race while riding a perfectly
normal ~0.55 hold effort, because an earlyMid-moment rival had been at effort ~1.0 since ~10%. No
phase bonus or kick strength tuning could have fixed this; the mechanism itself was wrong. Fixed
with `UNIVERSAL_FINAL_STRETCH` (0.9): commitment now holds only through a horse's own window
(reached early via `MOMENT_RAMP_LEAD`, 0.15, so full effort arrives BY the window's start rather
than merely beginning there), then EASES BACK to normal hold effort until this universal threshold,
where every style commits together regardless of its own Moment.

That fix alone took frontRunner from 39.7% to 8.9% and closer from 0.4% to 5.4% — the death spiral
is gone. **Style balance still fails the harness** (stalker now overperforms at 21.2%, closer still
under at 5.4%), and **pace-collapse regressed to failing too** ("a contested lead wrecks
front-runners" no longer holds, 9.2% → 8.5% barely moves) — frontRunner's real advantage moved
early, so contesting it late (the mechanic this suite gates on) matters much less than it used to.
Both are normal, tunable imbalances now, not a structural break, but neither is fixed yet.

**Second round — a new harness suite (`momentBalance`, `momentDistribution`) surfaced a much bigger
problem than style balance:** win rate BY MOMENT ALONE (all styles pooled) was wildly uneven —
`midLate` 34-48% against a fair 12.5%, `early` and `late` both near 0%, depending on exact retune.
This is a different bug from the style-balance one above and needed its own diagnosis chain, run
directly against the harness's own numbers rather than guessed at:

1. **Position-correction asymmetry (fixed).** `ai.ts`'s HOLD effort applied a proportional drift
   correction continuously, halved for `drift < 0` — closer (preferred 0.85) sits in that halved,
   suppressed case almost permanently, frontRunner (preferred 0.06) almost never does. Traced via a
   direct effort readout (all styles forced onto the same Moment, so timing was held constant):
   closer's effort sat at 0.33-0.63 continuously vs frontRunner's 0.79-0.89 — a real, continuous,
   compounding speed deficit, matching the owner's own playtesting report ("after a couple horses
   take the lead there is no chance of catching them"). Fixed by making HOLD cruise flat at the
   style's own `cruiseEffort` once `|drift| <= tolerance` ("established"), only correcting for the
   excess drift beyond tolerance rather than the whole raw drift, and — the owner's own framing —
   giving established position no further throttle at all.

2. **AI allowed more than one kick, deliberately, then a regression from it (fixed).** The owner:
   "that isn't fair to an AI to give them handcuffs." Removed the single-kick-per-race guard, but a
   naive real-time cooldown let WIDE Moment windows (`midLate`, 35% of the race) fit far more repeat
   kicks than narrow ones (`late`, 20%, ending at the finish with no room for a second) — `midLate`
   spiked to 48%, `late` collapsed to 0%. Fixed with `MAX_KICKS_PER_MOMENT` (2): kicks are capped to
   a fixed COUNT inside `[kickAt, momentHi]`, evenly spaced, and never fire past the window at all
   (previously a horse could burn its whole bank on mistimed post-window kicks for near-zero gain).
   Verified this removed the width-driven spike, but barely moved the underlying win-rate skew
   (48.1% → 46.6%) — proof that kicks were never the primary driver.

3. **Charge economy is provably inert for AI (confirmed, not a bug to fix).** Draft bonus, charge
   regen rate, and charge capacity were all tuned per the owner's request (bigger kick for catch-up
   styles, draft more relevant, faster stamina/more charges, less front-of-pack double-taxing), then
   directly falsified: slashing `BASE_CHARGE_REGEN` by 100x produced BYTE-IDENTICAL win-rate output.
   AI never spends more than `MAX_KICKS_PER_MOMENT` (2) out of `CHARGE_CAPACITY` (5), so it is never
   actually regen-gated — every charge-economy lever is cosmetically present but structurally inert
   for AI-vs-AI balance (still meaningful for the player's own manual kicks, which aren't capped the
   same way). `KICK_STYLE_BONUS` (a real per-style kick-strength multiplier, closer highest,
   frontRunner none) and `PRESS_COST_RELIEF` (frontRunner no longer double-taxed by both the
   baseline lead-cost AND the full contested-lead cost) were kept regardless — legitimate, correct
   changes even though they don't move the AI harness numbers.

4. **Leader-relative vs self-relative progress (fixed, real inconsistency, not the main driver).**
   `race.progress` is the LEADER's distance over the total, but Moment timing (kick window, phase
   bonus, window-lift, `ai.ts`'s commit timing) was being compared against it for EVERY horse — a
   horse running behind hasn't covered as much of ITS OWN race as the leader has of theirs, so its
   own Moment window was opening/closing off the leader's clock, not its own. Fixed by switching all
   Moment-timing comparisons to each horse's own `distance / totalYards`. Verified this is real and
   correct, but confirmed (before/after, byte-comparable win rates) that it was not the dominant
   effect — a needed consistency fix, not the headline bug.

5. **Effort has no cost in this economy — the actual root cause.** A distance-only "who's ahead"
   check across many seeds appeared to show near-ties (final distances within ~1 yard regardless of
   Moment/style) — which turned out to be a measurement artifact: a runner's `distance` FREEZES the
   instant its own `finishTime` is set (mid-race snapshots were meaningful; the post-finish "final"
   ones were not, since everyone converges to `totalYards + whatever overshoot they had in their own
   last tick` regardless of how early or late they actually crossed). Reading real `finishTime`
   margins instead showed the true picture: 65-length blowouts, not ties. Tracing effort directly
   through one such race found the mechanism: frontRunner's preferred slot (0.06, tolerance 0.18) is
   narrow and actively contested by every other forward-leaning entry, so it spends roughly half the
   race in the "drifted" position-correction branch — running 0.63-0.86 effort, well above its own
   0.5 cruise baseline, purely from fighting for position. Since AI is never charge-gated (point 3
   above), that elevated effort is completely FREE — nothing in the current economy makes sustained
   high effort cost anything. closer, whose rear slot is uncontested, settles into cheap 0.46 cruise
   almost immediately and stays there. The result is frontRunner effectively getting THREE separate
   high-effort windows (free position-scrambling + its own Moment commit + the shared universal
   final stretch) against closer's ONE. Fixed two ways: lowered the non-committing effort ceiling
   (`NON_COMMIT_EFFORT_CAP`, 0.86 → 0.65) and lowered `POSITION_CORRECTION_GAIN` (0.5 → 0.22) so
   drifted correction costs far less free speed. Verified: frontRunner/midLate's dominance in a
   fixed-pairing test roughly halved (56.7% → 27.2%), and `earlyMid` (previously ~0-2.5%) rose to
   15-20%.

**Where this leaves the harness, after all five fixes:** `midLate` win rate fell from 46.6% to
34.2% and `earlyMid` rose from 2.4% to 15.2% — real, verified, substantial progress — but `early`
and `late` remain near 0%, and style balance still fails (closer 4.3%, frontRunner 10.0%, stalker
17.3%, midPack 18.3%). Tested and ruled out as the explanation: total time-at-high-effort is
actually EQUAL between `early` and `midLate` on paper (both ≈0.41 of the race, split between their
own commit and the universal final stretch) — yet `early` still loses badly, and removing the
universal final stretch entirely changed nothing measurably. The remaining asymmetry looks like a
genuine sequencing effect (whichever Moment's commit window lands with the SHORTEST gap before the
shared final stretch is hardest to catch, independent of total duration) rather than anything a
single constant can retune away — closing it fully likely needs a redesign of the commit/valley
model itself, not another tuning pass. Flagged for the owner rather than guessed at further.

**Not yet done, deliberately left rather than guessed at now:** the elite-division issue above is
still open. `MOMENT_WEIGHTS_BY_STYLE` and/or `MOMENT_WINDOWS` may still need a retune pass once the
sequencing issue above is actually fixed — retuning weights against a broken underlying mechanism
risks re-guessing on top of a bug. Pace-collapse remains failing at essentially its prior magnitude
(8.8% vs the prior 8.5%) — unrelated to this round's changes, not yet revisited.

`npm run check` (lint + build + test) passes clean. Full harness: Determinism ✓, Style balance ✕
(closer 4.3%), Moment assignment matches weight table ✓, Moment win rate ✕ (midLate 34.2%), Pace
collapse ✕ (pre-existing), Dominance curve ✓, Division sanity ✓.

### 📚 HISTORY — full redesign: HOLD / CRUISE / KICK replaces the effort dial

**Why a redesign, not another tuning pass.** After the fifth fix above, the owner asked directly:
"are we bandaid-ing issues rather than fixing the roots?" Yes — `ai.ts`'s effort formula was fusing
two things that should never have shared one number: fighting for pack position, and how hard a
horse is actually running. Every fix leaked from one into the other. Agreed with the owner to
regroup and rebuild the effort model from the ground up rather than keep patching it.

**The new model (constants.ts, "Effort: HOLD / CRUISE / KICK").** A horse is in exactly one of
three states, never a continuous dial:
- **CRUISE** — top speed. The default. Nothing to manage.
- **HOLD** — deliberately below top speed, for a large regen payoff. The owner's framing:
  "holding should lower top speed by an amount in order to greatly improve regen." A horse fighting
  for its pack slot can't afford this; one that's comfortable, or banking for a Moment still well
  off, can.
- **KICK** — the ONLY thing that ever exceeds top speed. The owner: "a horse should only increase
  speed higher during a kick... then return back to cruising." A bounded lunge, not a sustained
  gear.

Position is no longer a speed lever past a short, tightly bounded opening scramble (sorts rank
order only, `ESTABLISH_UNTIL` cut from 0.28 to 0.15, gain cut and clamped to never exceed CRUISE).
A style's identity now comes from WHEN it can afford to hold (naturally correlated with its Moment
— frontRunner's window opens almost immediately, so it barely gets to hold; closer's is far off, so
it holds early and drifts back to exactly where it wants to sit) and from the existing charge-regen
mechanics, not from a drift-correction dial. `MOMENT_PROFILES` (the passive per-Moment phase-bonus
curve) and `MOMENT_COMMIT_DURATION`/`UNIVERSAL_FINAL_STRETCH`/`MOMENT_RAMP_LEAD` (the old commit-ramp
machinery) are gone entirely — Moment's whole identity now lives in the kick: when it fires, and how
strong.

Kick strength gained Burst as a factor (Grit x Burst x Jockey Skill, the owner: "tied to burst and
grit"), and `KICK_MAX_BONUS` was raised sharply (0.085 → 0.22) since it's now the only speed lever
that exists at all.

**The kick-eligibility model, reworked in parallel per the owner's own framing ("a player would see
the small window and use all their kicks").** Kicks inside a horse's own Moment window are bounded
only by charges and a window-width-proportional spacing (`KICK_IN_WINDOW_SLOT_FRACTION`) — no
"N per window" count cap (tried and rejected: it favoured whichever Moment happened to be widest).
Outside the window, capped at `MAX_KICKS_OUTSIDE_MOMENT` (1) — a little impatience is realistic,
spending the whole bank on kicks that do almost nothing is not.

**A deep investigation into a stubborn `late`-Moment failure, most of it now resolved but one piece
still open.** Once the redesign landed, `early` went from ~0% to a genuinely fair 17.4% and style
balance improved across the board — but `late` sat at an unmoving 0.0% through FIVE separate,
individually-verified fixes:
1. **Own-progress vs leader-progress** (`MAX_MOMENT_LAG`): a horse that's fallen behind has its own
   distance-based clock lag the leader's, pushing its kick window open later in real time than it
   should — traced directly, a `late` horse's first kick not firing until 91.7% of the way through a
   race it was already losing. Fixed with a floor: Moment timing can't lag the leader's clock by more
   than `MAX_MOMENT_LAG` (0.06).
2. **`KICK_MOMENT_BONUS`**: narrower windows (`early` 25%, `late` 20%) get proportionally less real
   time and fewer regen opportunities than wide ones (`earlyMid`/`midLate`, 35% each) — both strength
   and duration are now boosted for narrow windows, derived directly from window width so it can't
   drift out of sync (`early` +40%, `late` +75%).
3. **The comeback mechanic** (`KICK_COMPLACENCY_PENALTY`): the owner's framing — "the first place
   racer is cocky and not catching back up," a nerf to the leader's own follow-up kicks rather than a
   handout to whoever's behind. Discounts a horse's kick strength the more clear it already is of the
   field. Iterated three times: nearest-rival-based contest (didn't trigger — a front pack mutually
   boxing each other in never reads as individually "clear"), then a hard threshold against the
   back-marker (barely moved anything — a gap builds gradually across many kicks, and a cutoff only
   discounts the LATE kicks in that build-up), then a smooth exponential ramp from the first yard of
   separation (`CLEAR_FIELD_SCALE`) — the current form.
4. **Kick duration also scaled by `KICK_MOMENT_BONUS`**: traced directly that `late`'s kicks, once
   firing, genuinely closed real ground (180yd gap → 98yd in the final 10% of one race) — just not
   over enough total TIME to finish the job, since repeat kicks fired close together mostly just
   refresh the duration timer rather than stacking.

None of 1-4 fully closed it. **The actual root cause, found by direct measurement**: every archetype
— not just `late` — fires its entire charge bank (5-6 kicks) every single race (verified: 82-83%
land inside the horse's own window, so this isn't mistiming), and because repeat kicks fired close
together overlap in duration, this reads as one continuous boosted state for nearly the whole
window rather than discrete lunges — exactly the "sustained commit" problem this whole redesign was
built to eliminate, recreated through repeated kicks instead of an effort dial. Traced the actual
gap this produces: by the time a `late` horse's window opens, the other 7 horses have collectively
built a 150-200 yard lead through this continuous-boost volume, which no reasonable strength/duration
adjustment to `late`'s own kick can close in the ~10-20% of the race it has left (the arithmetic
doesn't work: closing 150+ yards in a ~200-yard remaining stretch requires roughly double the
leader's speed for the whole stretch).

**Explicitly ruled out as the fix**: capping kicks per window for everyone. The owner: "I don't like
capping windows. If a player wants to use their kicks [effectively/ineffectively] then let them" —
a hard cap removes player agency over a mechanical choice that should stay theirs, good or bad. The
uniformity problem is specifically in the AI'S decision logic (`ai.ts`), which currently runs the
identical algorithm for every archetype, just shifted by Moment window boundaries — confirmed by the
kick-count-by-persona data above showing near-identical volume (5.3-6.0) regardless of style OR
moment. Fixing that needs each archetype's AI to have a genuinely distinct kick STRATEGY (frontRunner
front-loaded and decisive, closer patient and concentrated into one or two large late kicks, stalker
a single tactical move, midPack closest to today's spread-it-out behavior) — a real rework, not a
numeric tweak. **Deliberately deferred as its own item (task list: "3.5") to keep session momentum**
— not started without a fresh design pass first.

**Where this leaves the harness right now:** Determinism ✓, Moment assignment matches weight table
✓, Dominance curve ✓, Division sanity ✓ (genuinely improved as a side effect: margins tightened
17.6L → 9.9L, "elite racing is tighter" flipped from failing to passing). Style balance ✕ (midPack
20.6%, furthest outlier — closer improved a lot, 4.3% → 16.8%). Moment win rate ✕ (`late` 0.0%,
`early`/`earlyMid`/`midLate` all within a reasonable band, 13-19.5%). Pace collapse ✕, unchanged
from its pre-existing state, not caused by this round.

`npm run check` passes clean.

---

### 📚 HISTORY — small UI wins landed; a bigger player-parity problem found

Three small, low-risk fixes landed straight away (no design conversation needed, unlike the items
below): a pre-race countdown (3-2-1, then "And they're off!" fires through the existing call-out
system as the sim starts) instead of snapping straight into motion; the race bar's Style "seat" text
folded together with the Moment text instead of duplicating it in two places on screen (and dropped
entirely on narrow widths where it had nothing left in it); and a 1-3 arrow regen indicator next to
the kick-charge dots, since the charge bank was visible but whether it was currently filling well
never was — backed by a new `regenMult` field surfaced on `RunnerSnapshot` (the position/drafting/
holding multiplier already existed internally, it just was never shown).

**A real wrinkle surfaced discussing whether the Style seat text still earns its place.** The
player's own horse is not purely hand-driven: `raceScreen.ts`'s player controller wraps
`createAiController(playerHorse)` as its base, and manual input only overrides two things — forcing
HOLD while actively taking a pull, and injecting a kick on tap. Everything else (the opening-gate
position scramble, default lane changes, and automatic hold/regen-banking whenever the player isn't
actively pulling and hasn't reached their Moment window) runs through the exact same Style-driven
`preferred`/`tolerance` logic as every AI opponent. Concretely: during the first `ESTABLISH_UNTIL`
(15%) of the race, if a horse is sitting further forward than its Style prefers, cruise effort is
eased down automatically (up to ~40% below full) to let the field settle it back — and the player
currently has no override for this; taps only add MORE pullback or fire a kick, nothing forces full
effort back up. Past that opening window the correction disappears entirely (deliberately, per the
redesign above), so a horse out of position later just doesn't get the passive hold/regen bonus
instead of being actively slowed. Filed as an open discussion point on 3.5, since any archetype-
distinct AI rework there changes the player's own autopilot too, not only opponents' — that needs an
explicit decision, not an accidental side effect. Whether the seat-text label itself is worth keeping
is filed alongside it: it's not decorative (it describes a real, active mechanic per the above), but
it's also not actionable — the player can't change their horse's Style mid-race, so today it only
explains autopilot behavior after the fact rather than informing a decision the way the Moment window
does. The owner's own reaction: "I'm not sure I want it anymore."

**A bigger, more foundational problem, found while investigating the above.** The owner's real play
history: roughly 50 manual race attempts, zero wins, best result 2nd by 2.75L, "lost by a distance"
(a blowout, not a close loss) roughly 80% of the time. Ran the existing `tools/ride-probe.ts` (its
own header: "Gate 2 asks whether racing is fun, and the answer depends entirely on whether the
player's input matters") to check this against real numbers rather than guess:

```
ride                    avg place   wins   top-3   avg beaten   charges left   kicks fired
hands off                  7.55     0      3       53.5L          5.0        0.00
kick mistimed              7.01     4     13       47.0L          5.0        1.00
kick in window              5.65    11     34       30.8L          4.6        1.00
spam every charge          5.67     9     33       35.1L          0.0        9.71
(fair share of wins is 19/150 ≈ 12.7%)
```

Every tested strategy loses far below a fair share, including "kick in window" (a single, perfectly-
timed kick — about as good as a simple strategy gets): 7.3% win rate, beaten by 30.8L on average.
"Hands off" is a total blowout: 0/150 wins, beaten by 53.5L every single race. None of these tested
strategies even attempt the AI's own multi-kick cadence (`baseRide` fires 5-6 kicks/race at ~82-83%
inside-window, per the 3.5 diagnostics above) — they're deliberately simple, human-plausible
strategies, and every one gets crushed by a full field of AI horses each executing that disciplined,
precisely-timed algorithm. Reads less like "the AI is too good" in isolation and more like: a human
tapping a touchscreen, working from limited real-time feedback, is competing against seven opponents
that never mistime a kick and never forget to hold. This is a different, more foundational question
than 3.5's archetype-vs-archetype fairness work — 3.5 asks "is AI vs AI fair", this asks "can a human
compete with the AI at all" — tracked separately as its own item (task list: "3.7"), sequenced after
3.5 per the owner ("do it after 3.5 at some point").

**Related note for later, not the cause of the current losing streak** — today's demo hardcodes every
horse, including the player's, to the `open` division (a uniform field; no career/division-
progression system exists yet). But `DIVISION_BANDS` (`src/sim/horse.ts`) scales both core stats and
jockey skill upward with division (maiden jockey 30-60 vs championship jockey 65-95, same shape for
core stats and consistency) — so "AI gets better as division goes up" is correct and by design. Once
career/division progression exists (Phase 3/4, not yet built), the 3.7 parity problem will compound
at higher divisions unless it's fixed first; whatever fix 3.7 lands on needs to still hold up at
championship level, not just at `open`.

Three items now queued for the next interactive session, in the owner's stated order: **3.5**
(archetype-distinct AI kick logic, the style x Moment stacking exploit, the MOMENT_WINDOWS redesign,
plus the player-autopilot wrinkle and seat-label discussion above), **3.6** (remaining UI items:
HUD overlap on narrow widths, drafting indicator + lane logic, results-screen race card, trait
tooltip clipping), **3.7** (player-vs-AI parity, above). None started without the owner at a computer
able to play-test, per their own instruction.

---

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

## Phase 4.5 — Re-balance and physics
**~2–3 sessions** · *a correction pass, not a feature*

Numbered 4.5 deliberately. It ships no new systems, and renumbering the phases
after it would strand every `Phase 5` reference already written into the code.

Everything below is a known, **measured** defect. This phase is where the bill
comes due for shipping a race that felt good before it was calibrated.

- **The speed scale.** ✅ **Done.** A winning 8f ran 64.4s against a real ~96s —
  25.0 yd/s where a thoroughbred tops out near 17.5. Every constant measured in
  real seconds (`BASE_SPEED`, `BASE_ACCEL`, drain, recovery, kick/fumble/green
  durations, the escape rate) now derives from one `TIME_SCALE = 1.43` lever in
  `constants.ts`, rather than the render layer dividing the error back out —
  which it no longer needs to. `npm run harness`: style balance and margins
  unchanged from baseline (within the harness's own fixed-seed noise), clock
  now 87–97s across divisions.
  <br><br>
  **This did NOT shrink margins**, correcting what this line originally
  claimed. That estimate assumed scaling `BASE_SPEED` *alone* — which would
  have been a balance-breaking partial fix, since every per-second drain/
  recovery rate would then apply for 1.43× longer real seconds per race. Done
  consistently instead (rates divide by `TIME_SCALE`, durations multiply by
  it, so behaviour per unit of race PROGRESS is unchanged), margin in lengths
  is `time_gap_seconds × speed_yd/s` — and both terms move oppositely by the
  same factor and cancel. Measured directly: 8th-place margin 74.7L before,
  75.2L after (`npm run margin-profile`). **The tail collapse below is
  entirely untouched by this step** — it is the energy floor's job, not the
  clock's.
  <br><br>
  One trap found and fixed by the harness, worth recording: `BASE_ACCEL` is
  yards/sec² — order-2 in time — so it needs `TIME_SCALE²`, not `TIME_SCALE`.
  Dividing it by the bare factor first let horses reach full speed over fewer
  yards than before, shrinking the fraction of the race spent scrambling for
  position, and frontRunner's win share quietly moved from 12.9% to 14.3%
  before the exponent was corrected. Reproduce either measurement with
  `npm run margin-profile` (`tools/margin-profile.ts`) and
  `npm run harness`.
- **The energy floor.** ✅ **Done, and it wasn't the floor curve itself.**
  Traced the worst seed in `margin-profile` directly
  (`tools/margin-profile.ts` still reproduces it): a front-runner crashed from
  93 to 0 energy by 12% of the race, then spent the remaining 88% locked
  between 0 and 14, permanently `outOfPosition` — 106 lengths behind at the
  wire. Not fading. Trapped. Two structural causes, both fixed in `engine.ts`:
  <br><br>
  1. The establish scramble was charged twice for the same thing — `ai.ts`
     already prices reaching your slot as a bounded effort spike
     (`ESTABLISH_GAIN`, up to `MAX_EFFORT`), and the misfit-driven drain
     penalty was charging the SAME distance again, at full strength, from
     tick one. `positional` now fades IN across `ESTABLISH_UNTIL` instead of
     snapping to full strength at the gate.
  2. Misfit cost the same whether a horse had 60 energy or 5 — so a horse
     that lost its slot AND its energy paid full price on both axes with no
     way back: too broke to afford fighting to position, denied the recovery
     to ever afford it, because being out of position was what suppressed
     that recovery. New `MISFIT_ENERGY_RELIEF_FLOOR` discounts the misfit
     PENALTY (not the in-position reward) once a horse is already this deep
     in trouble — inert above `FADE_THRESHOLD`, so it cannot change any race
     that never gets this bad.
  <br><br>
  A third, non-engine cause compounded both: `ai.ts`'s own reserve clause was
  subtracting up to a full 1.0 from effort as energy approached zero — a
  jockey on a beaten horse riding at literal minimum effort rather than
  moderating. Halved.
- **The full re-balance at lower noise.** ✅ **Done.** `BAND_DOWN`/`BAND_UP`
  (consistency) and `FORM_BASE_SPREAD`/`FORM_TEMPER_AMPLIFY` (daily form) cut
  by a third together, exactly as this line specified, followed by a
  compensating retune — because cutting noise alone reproduced precisely the
  failure this line predicts: style balance broke (frontRunner 10.1%, stalker
  8.3% FAIL, midPack 16.0%, closer 15.6%) as the patient styles' late-race
  edge stopped being washed out by chaos. `PHASE_PROFILES` re-tuned against
  the quieter baseline restored it — frontRunner 10.6%, stalker 11.3%,
  midPack 14.2%, closer 13.9%, all inside the harness's 30% bar. See the
  known issue below for the full before/after margin table.
- **A parameter sweep**, done by hand against a fast proxy rather than a grid
  script. A full `npm run harness` run costs ~115s regardless of the `RACES`
  env var (division sanity and pace-collapse don't scale with it), so a
  standalone copy of the harness's own `styleBalance()` method
  (same seed prefix, so numbers are directly comparable) at `RACES=250` gave
  a ~20s iteration loop for tuning `PHASE_PROFILES`, with the full harness run
  only to confirm the final choice. Not committed as a tool — it exists to
  answer "does this specific change move style balance," not as a permanent
  probe like `energy-profile` or `margin-profile`.
- **Re-verify Gate 1.** ✅ **Done**, at the new noise level. `npm run
  harness`: no running style dominates (all four within the 30% bar), every
  division winnable, dominance curve flat in the middle and steep at the ends
  (+5% edge → 27.5%, +40% edge → 92.0%), pace collapses still produce upsets
  (a lone front-runner's 20.2% collapses to 9.3% each when three duel).
- **Reconcile the animation with the simulation.** The gallop sheet is 24 frames
  of one gait; the sim has `intensity` and `drive` that it currently cannot
  express. Stride length no longer needs a render-side correction — it was
  derived from speed, and speed is now correct at the source — but the sheet
  still can't show a horse straining versus coasting at the same speed.

**Deliverable:** finishes you would believe. Photo finishes at the front, a
beaten field that is beaten rather than distanced, and a harness run that proves
it rather than a screenshot that suggests it.

### Five single-lever attempts, all failed — start from here

Every one of these was tried against the balance harness and rejected. **The
failure is always the same suite and always the same style**, which is the most
useful thing known about this problem:

| Attempt | Closer win rate | Fair share |
|---|---|---|
| Drain measured from a cruise, recovery from the cruise | 2.7% | 12.5% |
| ...with recovery restored to measure from full effort | 3.3% | 12.5% |
| ...with the front-running cost nearly tripled | 2.7% | 12.5% |
| `HOLD_EFFORT` 0.55 → 0.42, so holding banks | 5.2% | 12.5% |
| ...with `KICK_MAX_BONUS` 0.085 → 0.15 | 6.8% | 12.5% |

**Why, and it is structural.** A closer wins because the horses in front of it
**fade**. Every one of these makes the economy sustainable, so nothing fades,
and the closer's entire win condition disappears with it. Strengthening the kick
to compensate — the counterweight the design already names — recovered less than
two points.

So the fade threshold, the kick, the position costs and the AI's effort profile
have to move **together**, and the sweep is not optional. Any attempt that
touches one of them alone will land somewhere on the table above.

The player-facing symptom is in `PLAYER_CRUISE_CAP` (`ui/raceScreen.ts`), swept
to the best value the current economy allows. It is a tourniquet, not a fix:
holding the field's pace still costs more than break-even permits, so a hands-off
horse still bleeds — just slowly enough to have something left at its window.

**What actually landed, and why it didn't repeat this table.** Every attempt
above tried to make the economy MORE SUSTAINABLE — which is exactly what
breaks it, because a closer's whole win condition is that the horses in front
of it fade. The energy-floor fix above did the opposite of that on purpose: it
never touches how much a horse in good shape drains or recovers, only the
horses already past `FADE_THRESHOLD` in a death spiral with no way out — inert
for the 90%+ of a race that never gets that bad. Confirmed it didn't repeat
the pattern: pace-collapse still passes exactly as before (a lone front-runner
at 20.2% collapses to 9.3% each when three duel — fading is still real and
still the upset mechanism). The noise cut is a separate lever again, and it
DID move style balance, in the direction this section predicts (patient
styles up once chaos stopped washing out their late-race edge) — the
compensating `PHASE_PROFILES` retune above is what put it back.

### Why here, and not sooner

Sooner and you are balancing a race with no career around it — no divisions to
be winnable, no eighteen-start season over which "fair" is even measurable, and
nothing at stake in losing. By the end of Phase 4 all of that exists, so the
racing can be judged as the thing players actually experience.

Later and it is worse: breeding multiplies every balance decision by inheritance,
and re-tuning after foals exist means re-tuning the genetics too.

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

**Currently ~6 lengths between first and second**, down from 6–7. Real racing
is decided by 1–3, and 5+ is a rout. Still too wide, and the harness still
gates on it honestly — but every number below moved in the right direction
this pass, which is the first time that's been true rather than a trade of
one problem for another.

### The tail is still the bigger problem, and it is meaningfully better

Median margin behind the winner, 200 races, 8f open — reproducible with
`npm run margin-profile` (`tools/margin-profile.ts`):

| Place | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th |
|---|---|---|---|---|---|---|---|
| Original baseline | 4.1L | 8.9L | 13.0L | 17.4L | 24.6L | 42.1L | **74.7L** |
| After the speed-scale fix alone | 4.6L | 7.8L | 11.9L | 18.0L | 26.0L | 42.7L | **75.2L** |
| After the death-spiral fix, before noise cut | 5.6L | 9.6L | 13.6L | 18.8L | 27.8L | 45.1L | 65.0L |
| **After the full rebalance** | **3.7L** | **7.7L** | **11.8L** | **15.7L** | **23.8L** | **40.7L** | **60.0L** |

Last place down from 74.7L to 60.0L — about 20% — and every other place
tightened too, including the winning margin itself (4.1L → 3.7L). A real
eight-runner field still finishes inside about twenty lengths end to end;
ours strings out over sixty. Better, not solved.

This matters more than the winning margin because it is what a player actually
sees. A beaten horse is routinely reported as *distanced*, which reads as a
broken game rather than a bad ride.

**Both causes this section named are now addressed — see Phase 4.5.** The
speed scale was corrected first, and on its own it does NOT shrink margins
(margin is `time_gap × speed`, and both move oppositely by the same factor
under a consistent rescale) — that row above is the record of a prior,
now-corrected estimate on this page that claimed otherwise. The energy floor
turned out not to be the fade curve itself: traced directly, a front-runner
crashed to 0 energy by 12% of a race and spent 88% of it trapped, not fading —
see Phase 4.5 for the two structural causes and the fix. The daily-form /
consistency-band noise reduction the diagnosis below calls for is done too,
with the compensating style-balance retune it warned would be necessary.

**What's left to close the gap further** is not a new cause, just more of the
same kind of work: this pass corrected specific bugs (the double charge, the
bottomless recovery penalty, the AI's over-caution) and did one noise-and-retune
pass. A genuinely tighter target (2–3L) likely needs another iteration of the
same loop — cut noise further, re-verify style balance, re-check the tail — not
a new mechanism.

Deliberately not re-shelved after this pass: still reported on every harness
run so any regression is caught immediately, not rediscovered from scratch.

**The diagnosis that got us here, kept for the next iteration.** Margins and
style balance are coupled through variance:

- The dominant driver is **daily form**, fixed for the whole race and so
  compounding directly into the finishing gap. The consistency band and the
  effort-to-speed range matter less than expected — narrowing the speed range
  actually made margins *worse* in earlier testing.
- Cutting that variance tightens finishes but **lets systematic style
  advantages dominate** — confirmed again this pass: cutting `BAND_DOWN`/
  `BAND_UP` and `FORM_BASE_SPREAD`/`FORM_TEMPER_AMPLIFY` by a third alone (no
  compensation) broke style balance exactly as this line predicts (patient
  styles jumped once chaos stopped washing out their late-race edge; see
  Phase 4.5 for the numbers), and needed a `PHASE_PROFILES` retune to recover.
- That retune was done by hand against a fast style-balance proxy (Phase 4.5),
  not a true multi-parameter grid sweep. The next cut of noise should expect
  the same coupling and budget for the same retune-and-verify loop.

---

## Known issue — position costs more than it returns

✅ **Fixed in Phase 4.5** (the establish double-charge, the misfit energy
relief, and the softened AI reserve clause — see there for the code-level
fix). Kept here as the diagnosis record, with before/after numbers.

**The player-facing symptom was: stamina drains hard in the opening, and never
really comes back.** It read as a broken control, not a pacing decision — you
did not fail to hold your position, holding it simply did not pay for what
reaching it cost. Reproduce with `npm run energy-profile`
(`tools/energy-profile.ts`) — hands-off ride, 120 races, 8f open:

| style | 5% | 10% | 20% | 28% | 40% | 60% | 80% | 100% |
|---|---|---|---|---|---|---|---|---|
| **Before** — frontRunner | 55 | 39 | 32 | 32 | 33 | 34 | 32 | 24 |
| **After** — frontRunner | 65 | 49 | 30 | 28 | 27 | 27 | 23 | 18 |
| **Before** — stalker | 72 | 60 | 48 | 45 | 44 | 44 | 40 | 30 |
| **After** — stalker | 72 | 59 | 42 | 37 | 36 | 35 | 30 | 21 |
| **Before** — closer | 95 | 92 | 86 | 81 | 84 | 86 | 83 | 74 |
| **After** — closer | 93 | 88 | 80 | 74 | 77 | 83 | 81 | 73 |

Net energy/sec by phase, across all styles — **before**: establish −2.42/s,
cruise +0.09/s, stretch −0.64/s. **After**: establish −1.91/s, cruise **−0.01/s**
(the AI's own ride, not just the player's capped one — essentially break-even
now), stretch −0.48/s.

Front-runner holds noticeably more early (49 vs 39 at the 10% mark — the
double-charge fix) but finishes with less in reserve (18 vs 24) than before.
That is not a regression: fewer horses are getting trapped in the death spiral
and coasting out the back at minimum effort with energy left unspent: more of
them are genuinely racing all the way to the wire, which is what the reserve
figure should look like in a field that's actually contesting the finish.

**Two causes, both structural, not a tuning miss — the diagnosis, and what
fixed each:**

1. **The establish phase was charged twice for the same thing.** In `ai.ts`, a
   horse starting outside its preferred slot gets
   `effort = HOLD_EFFORT + drift × ESTABLISH_GAIN × urgency`, which clamps to
   `MAX_EFFORT` (1.0) for anything badly out of position. But the engine had no
   notion of "establishing" as a special case — it just saw high effort while
   `misfit` was still high, so `POSITION_COST_PENALTY` (extra drain for being
   out of position) charged *at the same time* as the effort spike. Fixed by
   fading `positional` IN across `ESTABLISH_UNTIL` in `engine.ts`, instead of
   it snapping to full strength at the gate.

2. **The cruise did not refund the reserve, even executed perfectly.** Worked
   by hand for a front-runner sitting in position, uncontested, at
   `HOLD_EFFORT` (0.55): drain ≈1.62/s, recovery ≈1.25/s — net **−0.37/s**, not
   the "must net positive" the comment above `HOLD_EFFORT` in `constants.ts`
   claimed. `BASE_DRAIN` (7.4) and `BASE_RECOVERY` (4.1) were far enough apart
   that even a full positional bonus stack didn't close the gap at that
   effort. Traced further to its worst case (`margin-profile`'s worst seed): a
   front-runner crashed to 0 energy by 12% of the race and spent 88% of it
   trapped at 0–14, permanently `outOfPosition` — not fading, unable to
   afford fighting back to its slot, and denied the recovery to ever afford
   it, because being out of position was what suppressed that recovery. Fixed
   with `MISFIT_ENERGY_RELIEF_FLOOR` in `constants.ts`: discounts the misfit
   PENALTY (not the in-position reward) once a horse is already below
   `FADE_THRESHOLD`, inert above it so no race that never gets this bad is
   affected.

A third cause, found while fixing the second: `ai.ts`'s own reserve clause was
subtracting up to a full 1.0 from effort as energy approached zero — riding a
beaten horse at literal minimum effort rather than moderating. Halved.

**So "getting into position" was never the broken step — a horse got there.**
What was broken is that position never paid back what it cost to reach, and
that a bad trip had no way back from it. Fixed together, verified against the
harness at each step rather than asserted — see Phase 4.5 for the full
before/after margin table this produced.

---

## Summary

| Phase | Sessions | Gate |
|---|---|---|
| 0 · Foundation | ~1 | |
| 1 · Race sim + harness | ~2–3 | 🚦 Is the model sound? |
| 2 · Playable race | ~3–4 | 🚦 Is it fun? |
| 3 · Full career | ~3–4 | |
| 4 · The stable | ~2–3 | |
| 4.5 · Re-balance & physics | ~2–3 | |
| 5 · Breeding | ~3–4 | |
| 6 · Polish | ~3+ | |
| **Total** | **~20–25** | |

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
