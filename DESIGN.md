# Bloodline — Design Document

Horse racing, training and breeding game. Browser + mobile web.
Working title. Every decision below was settled across 23 planning rounds.

**Legend:** ✅ decided · ❓ open · ⏳ deferred to a later phase

---

## 1. The Loop

Two nested loops. The inner one is a horse's career. The outer one is your stable, which
never resets.

```
NEW HORSE  →  TRAIN  →  RACE  →  (18–20 races)  →  RETIRE
    ↑                                               ↓
    └────────  BREED / fresh line  ←────  winnings → STABLE (permanent)
```

The horse is the **run**. The stable is the **save file**. Retiring costs you nothing —
facilities, cosmetics, staff, bloodstock and reputation all persist, so run 5 opens from a far
stronger platform than run 1. That is the roguelike spine.

At retirement you always get three choices: **race the foal you just bred**, **breed again**,
or **start a brand-new line**. ✅

### Breeding is the intended path ✅

The three choices are **not equals**. Breeding from your own stock — ideally from a Hall of Fame
horse — is the path the game is built around, and a fresh unrelated horse is the fallback, not a
parallel strategy.

|  | Bred foal | Fresh unrelated horse |
|---|---|---|
| **Inheritance budget** | Full — parents' careers, plus any Hall of Fame bonus | None. Generation 1 |
| **Traits & coat** | Inherited, with recessives and surprises | Rolled from the starter pool |
| **Stable scaling** | Yes | Yes — the yard's investment still shows |
| **Pedigree** | Extends the line | Starts a new root |

A fresh horse is **never a dead end**: it still benefits from everything the stable has built, so
a player who wants to roll the dice can, and the horse will be competitive for its generation. It
simply does not inherit, so its ceiling is the one a first-generation horse has.

This is what keeps the family tree **deep rather than wide**. Nothing forbids starting over —
but the compounding lives in the line, so the tree the archive draws is a few long lineages with
the occasional new root, not a field of orphans.

**Why Hall of Fame horses in particular.** They are free breeding partners forever (§10), and they
carry a bonus into the budget. Enshrining a horse is therefore not a trophy — it is the single most
valuable thing a career can produce, because it permanently raises the floor of every horse
descended from it.

---

## 2. The Horse

### Stats ✅
Six stats, 0–100. **Starting horses roll 18–34** — deliberately weak, so growth is felt.

| Stat | Role |
|---|---|
| **Speed** | Top-end velocity ceiling |
| **Stamina** | How quickly kick charges regenerate between efforts (ROADMAP.md, kick-charge redesign — supersedes the energy-pool description this line used to have) |
| **Burst** | Acceleration — gate break, and how fast a drive takes effect |
| **Grit** | Kick strength, alongside jockey skill. Drives **Resolve** (§7), and helps a horse fight through traffic |
| **Temper** | Reaction to external pressure — traffic, crowds, big fields, the gate — plus trainability. **Low Temper means bigger swings in mood, morale and daily form**, in both directions |
| **Consistency** | Delivering your true ability on the day. Owns essentially all in-race variance: clean break, clean acceleration, no mistakes |

**Speed / Stamina / Burst** are the racing engine. **Grit / Temper / Consistency** do most of their
work outside the race itself — training, morale, form and execution.

**Consistency is the game's chaos dial.** Low-Consistency fields are volatile and upset-rich;
high-Consistency fields are precise and deserved. Because AI horses in higher divisions are
generated with higher Consistency, elite racing becomes reliable *emergently* — there is no
hardcoded "less randomness up here" rule. This also leaves room for a great archetype: the
volatile talent who reaches Championship on raw ability and remains capable of anything.

Consistency **rises with race starts, not only training** — horses get more professional with
experience. That's why elite veterans are reliable, and why a young talented horse is thrilling
and dangerous to own.

### Potential ✅
Every stat has a hidden **potential cap** — the ceiling training can reach. Two horses with
identical starting stats can end up wildly different.

| | At selection / foal pick | During training |
|---|---|---|
| Current stats, style, aptitude, traits | **Visible** | Visible |
| Potential caps | **Masked** | **Range that narrows as you train that stat** |

Your pick is fully informed; potential is what unfolds over the career. (The Pokémon rule: you
see the type, not the IVs.)

### Running styles ✅
Exactly one per horse. **Each style is an energy-efficiency profile keyed to pack position** —
see §4. Nobody is punished for running their own race.

| Style | Cheap to run | Expensive to run |
|---|---|---|
| **Front-Runner** | Clean lead | Buried in the pack |
| **Stalker** | 2nd–4th, in the draft | Forced to lead early |
| **Mid-Pack** | Middle of the field | Extremes, front or back |
| **Closer** | Last, with room to swing | Anywhere near the front |

### Moment 🚧
Exactly one per horse, independent of running style — style says WHERE a horse sits in the pack,
Moment says WHEN it kicks and when its passive speed curve peaks. Four values: **Early**,
**Early-Mid**, **Mid-Late**, **Late**. Weighted by style so archetypes stay sensible (a
"quick-start closer" doesn't happen) without being fixed by it — two horses of the same style can
still kick at different points. See ROADMAP.md, "Moment: WHEN a horse kicks, split out from Style"
for the full weighting table and current balance status (in progress, not yet fully retuned).

### Distance aptitude ✅
Three bands: **Sprint** (5–7f) · **Mile** (8–9f) · **Route** (10–12f).
Each horse carries a letter grade per band, tappable for the exact number (progressive
disclosure, used consistently everywhere).

Units: **furlongs**, with a player-toggleable countdown in yards or metres.

### Traits ✅

> **📖 [TRAITS.md](TRAITS.md) is the single source of truth for traits** — the full catalogue,
> the design rules, the training-acquisition table, and the cut log. Nothing about individual
> traits is duplicated here. This section covers only how the system fits into the game.

Traits work like **Sims traits** — a small fixed set that defines who the horse *is*, not a stack
of stat modifiers.

**Count: 2–4.** Two is standard. **Legacy and bloodline strength raise the odds of a third**, with
a fourth rare and special — so generations of work pay off visibly at the moment a foal is born.

**Symmetric.** Player horses and AI horses roll from the same pool under the same rules. The player
gets no protection the world doesn't — a player-only safety net would make wins feel cheap.

**Discovery**
- **One trait always visible** when choosing a horse, so your pick is informed
- **Inherited traits are also visible** on a foal — inheritance should be legible
- The rest **reveal through racing**, when circumstances trigger them
- **Facilities speed discovery**, and **traits you've encountered before are identified faster** —
  knowledge that persists across careers. Your stable accumulates *expertise*, not just money
- **Rival traits are hidden but discoverable**, building a permanent **dossier** (§9)

**Acquired traits**
Traits are overwhelmingly innate, but a young horse can **rarely** gain one from training, tied to
the **specific session** — early years only, so a two-year-old's schedule genuinely shapes what it
becomes. Breakthrough sessions carry a higher chance. Rare enough to be a memorable event, never
frequent enough that anyone grinds one session chasing a trait.

Session-to-trait mapping lives in [TRAITS.md](TRAITS.md).

### Gender ✅
Stallions and mares, with **complementary — not vertical — inheritance**. Neither is stronger.

- **Mares** transmit Stamina, Temper and condition more reliably
- **Stallions** transmit Speed, Burst and raw potential more reliably
- **Traits and distance aptitude inherit evenly from both**, plus a mutation chance

Both retire into the stable permanently and both breed until age retires them. The starter
choice becomes "what kind of bloodline am I founding?" — a real decision with no wrong answer.

**Labelling is a simple two-way display option.** ✅

| Setting | Shows |
|---|---|
| **Racing terms** (default) | Stallion / Mare |
| **Plain** | Male / Female |

That's the whole feature. **No colt, filly, or gelding** — age-based terminology is authentic but
it forces players to look up what a word means every time they see it, which is the exact problem
this setting exists to solve. Stallion and Mare apply at every age.

One toggle in settings, applied everywhere the game names a horse's gender.

*(Codebase note: the field and type are named `gender` throughout, not `sex`.)*

---

## 3. Information Policy ✅

- **Letter grades everywhere, tap for exact numbers.** One consistent pattern.
- **Your horse:** everything visible except potential, which shows as a narrowing range.
- **Rivals:** a form guide — recent finishes, running style, distance grades, odds. Enough to
  plan tactics, not a full stat dump.
- **Odds are displayed, never bet against.** You may wager on your own horse only; stakes are
  capped relative to the purse so betting never out-earns racing.
- **The bet comes after the form guide, never before it.** ✅ Betting used to sit on a screen the
  player reached before seeing a single rival, which made it a coin flip rather than a judgement.
- **Post-race:** an objective narrative recap with key moments, *plus* your jockey's
  in-character verdict, which sharpens as they level.

---

## 4. Racing

### The race-day flow ✅

**One screen decides, everything after it is spectacle.**

The **Race Day** screen is the hub: the racecard up top (distance, going, field, purse and what
the winner collects), then a grid of the three things a player can commit — **Opponents**,
**Preparation**, **Betting** — and a Start Race button beneath. Each tile carries its own state,
so a bet placed and a panel closed still reads from the grid. Opening the dossier hides the hub
rather than replacing it, so items and stakes already chosen survive the trip.

The three sit together because they are the same kind of decision: money or information committed
now, against a result not yet run. Studying the field first is the point of the ordering.

The **race intro** that follows has nothing to press. By the time it plays the horse is walking to
the gate, so it is a loading screen with atmosphere — racecard, blurred panning track,
"Riders…. take your marks" — and nothing else.

### The energy economy ✅
**One currency governs everything.** Energy drains when you push and **recovers when you
settle**. Both rates depend on whether the horse is where its style wants to be.

- Running in your style's preferred position → cheaper drain, faster recovery
- **Drafting** behind a rival → faster recovery still, automatic when you're in position
- Out of position → everything costs more

Traits, styles and drafting all express themselves through this one system. No side mechanics.

### Controls ✅
- **Drive to urge, release to settle.** One analog action, continuous rather than stepped.

  > **Terminology matters here.** Never call this "hold". In racing, *holding* a horse means
  > **restraining** it — the exact opposite of what the control does. The real terms are **drive**
  > (urge forward) and **rate** / **settle** (control the pace). The button is **DRIVE**; releasing
  > settles. This also stops us naming an action after its mobile gesture.

- **The kick scales with remaining energy × Grit.** No separate resource — a front-runner who
  burned everything gets a feeble kick; a well-paced leader can still defend. This is what stops
  the game collapsing into "closers always win late."
- **Positioning is entirely the jockey's job.** No player steering. A better jockey finds room
  sooner and gets stuck less often.

Intensity is **punctuated** — long stretches of reading the race, broken by the few moments
where your horse's style actually shines.

### Presentation ✅
- Side-on scrolling camera following the pack, **plus an oval minimap** showing true track
  position and turns
- **Distance countdown** and phase call-outs — "Backstretch", "Final turn", "Down the stretch"
- **HUD:** energy bar with style safe-zone, distance remaining, minimap
- Field size **8**. Race length **45–75s**, scaled by distance
- **Auto-race** available: hand it to your jockey and watch, or skip to the result. Auto rides
  competently but not optimally

### How races are decided ✅
Upsets come from **pace**, not from a fudge factor. When two front-runners refuse to yield they
burn each other out, the leading group empties at once, and a closer sweeps past. Same eight
horses, same stats, different pace — different winner. Fully emergent.

**Additional variance:**

- **Daily form — driven by Temper.** ✅ A modifier each race day representing how the horse woke
  up. **Low Temper produces bigger swings in both directions**, so a volatile horse is capable of
  a career day or a flop, while a professional one turns up much the same every time.
- **Traffic trouble — driven by Grit + Temper, gated by jockey.** ✅ Temper governs how rattled
  the horse gets when shut off; Grit governs whether it fights back through. Jockey skill governs
  how often it happens at all, so this stays a reason to invest in staff rather than an
  unavoidable tax.
- **Consistency failures** ✅ — the horse fails to deliver its ability. Three forms:
  - **Slow or fumbled start** — breaks a step slow, costing early position
  - **Green moments** — drifts off a straight line or loses focus, costing ground
  - **Running below its true ability** — but **never silently.** An on-screen indicator shows the
    horse is off today while the race is happening. The player always knows something is wrong in
    the moment, not only in the recap.

Everything is named in the post-race recap. A loss always has a reason you can point to.

**Dominance curve** ✅ — the mapping from stat advantage to win probability is **flat in the
middle, steep at the ends**. A 5% edge buys almost nothing (this is the chaos — 3.5-1 does not
beat 8-1 merely because the number is smaller). A 40% edge approaches dominance. Difficulty
tiers shift the curve rather than replacing it: roughly two-thirds on Relaxed, half on Standard,
a third on Brutal.

**Skill weight** ✅ — leans toward stats. Good energy management overcomes a modest deficit; a
genuinely superior horse still usually tells, and can be auto-raced to victory.

### Pace reading ✅
The form guide lists every rival's running style, so counting three front-runners tells you a
fast pace is coming. Working it out yourself is a real skill. The Bloodstock Office adds an
explicit projection as it levels.

### Conditions ✅
Going (firm → heavy) and weather are forecast when you enter a race, may shift while you train,
and **lock a week out with a clear warning** so you always have time to adjust. They meaningfully
favour certain traits and styles.

---

## 5. Training & Condition

### Calendar ✅
After each race you're offered **2–3 upcoming races** at different distances, divisions and
dates — a nearby easy sprint, or a richer route race further out that buys more training time.

### Condition ✅
A 0–100 condition value driven by training load and rest that directly scales race performance,
plus a visible form state (**In Form / Steady / Off Form**). Peaking your horse for the right
race is a genuine skill.

### Sessions ✅

**Every stat has a session that specialises in it**, each with a cost attached, so a player who
needs one thing can go and get it rather than hoping it comes attached to something else:

| Stat | Specialist session | The trade |
|---|---|---|
| Speed | Sprint Work | −Stamina |
| Stamina | Swimming | −Speed |
| Burst | Work Off the Bend | −Grit |
| Grit | Deep Sand Gallops | −Burst |
| Temper | Groundwork | −Speed |
| Consistency | Racecourse Schooling | −Burst |

Around them sit broader sessions that combine two or three stats for a smaller gain each — Cross
Training, Settled Routine, Match Gallop, Hill Repeats — plus Rest and Recovery days.

**Predictable gain plus breakthrough chance.** Each session previews a reliable stat gain, with
occasional breakthroughs and rare bad days driven by morale. No minigames.

**The preview is the real number.** Grounds, trainer and age all multiply what a session gives, and
the card shows the figure *after* that multiplication — an upgraded yard shows bigger numbers on
the cards, not the same numbers that quietly land bigger. Only gains scale; a session's downsides
are never softened, so upgrading sharpens the trade-offs rather than removing them.

The preview deliberately does **not** subtract what a potential cap will swallow — that would
reveal the hidden ceiling that §3 keeps private. A capped stat simply gains less than promised,
which is the unstated signal that it is maxed.

Gains are gated by **age** (young horses gain fastest) and by **potential caps** (approaching a
cap yields sharply diminishing returns).

### Consumables ✅
Feed, supplements and treats **bought with cash** and applied at the end of a training session for
a larger gain or reduced injury risk. A clean cash sink that rewards planning ahead.

Deliberately **never mandatory** — the base session works fine on its own, so consumables are an
optimisation, not a grind gate. Temper affects how well a horse takes to them.

---

## 6. Injuries ✅

**Setbacks, rarely career-ending.** Most injuries cost a few weeks. A true career-ender is rare
and heavily reduced by your Veterinary Wing.

When one does occur: **forced retirement, full breeding value, plus a `Legacy` marker** whose
foals get a small edge. The worst moment in a run converts into the strongest hook into the next
one — you didn't lose the horse, you lost the racing career and gained a legacy.

---

## 7. Morale & Resolve ✅

**Placings sustain morale.** Purses, Legacy and morale all count 2nd and 3rd, not just wins — so
a competitive horse rarely goes long without something to feel good about. This is the primary
anti-spiral safeguard.

**Resolve is the backstop.** A genuinely bad run quietly builds a hidden Resolve meter that, when
full, guarantees a breakthrough or a race-day surge. A losing streak builds toward a comeback
rather than spiralling.

**Grit drives Resolve** — high-Grit horses build it faster and their surge hits harder. Grit means
"holds on when the tank is empty" in a race *and* "answers a bad run" across a career. One stat,
one identity.

**Temper sets the amplitude.** ✅ Low-Temper horses swing harder in *both* directions — higher
highs and lower lows in mood, morale and daily form. A volatile horse is a rollercoaster to own;
a professional one is steady and predictable. Temper doesn't make morale better or worse, it makes
it louder.

**Visibility:** mood is visible and actionable. Resolve is hidden, so the comeback lands as a
surprise instead of something players farm by tanking races.

---

## 8. Career Arc ✅

**18–20 starts, ages 2–5** ✅ — roughly 5 runs a year.

This was corrected from an earlier "12 races, ages 2–6", which contradicted itself: five seasons
at 12 starts is about 2.4 runs a year, against a real-world norm nearer 6. Real Thoroughbreds
average **~18 lifetime starts**, over typically 3–4 years, peaking around 4–5. Our numbers now
match. Auto-race and skip keep the extra starts from dragging, and more starts give form, morale
and the decline arc room to actually breathe.

- **2–3** — steep growth
- **4** — peak
- **5** — decline; stats erode, injury risk climbs

**Retirement is the player's call**, with the trainer hinting once decline sets in.

**Legacy score** peaks and then **erodes if you keep running a declining horse into losses**.

What the yard banks at retirement is the legacy the horse **still holds**, not its peak — that is
what makes chasing one more purse a real gamble rather than a free roll. Three outcomes:

| Retirement | Banks |
|---|---|
| **Sound** — stopped within 10% of its peak | Its legacy **plus a 20% bonus**. This is the retiring-on-top reward |
| **Faded** — run on past its best | Only what is left. The cost of the gamble |
| **Injured** — career ended by injury (§6) | Its **peak**, in full. The worst luck must not also be the worst outcome |

Named for the timing it measures. An earlier draft called this a *Retired Champion* bonus, which
read as a Championship-division title — a Stakes horse retired at its peak earns it too, and a
Championship horse run into the ground does not.

**The Hall of Fame is judged separately, on the peak**, and once earned cannot be lost. So racing
on is genuinely two-sided: it can still lift a horse into the Hall of Fame, while bleeding the
prestige and breeding value it banks.

### The legacy economy ✅

Points come from finishing position, multiplied by the division. The multiplier is **exponential —
1.6× per rung** (Maiden 1, Novice 1.6, Open 2.56, Stakes 4.1, Championship 6.55), plus a one-off
promotion bonus of 25 / 50 / 75 / 100 for the division reached.

The curve is exponential because a flat one let **volume beat class**: a horse that never left
Stakes out-scored one winning Championships, simply by running more races. Compounding per rung
puts the champion back on top while still leaving room for the rare horse that dominated a lower
division without ever winning a title.

**Hall of Fame: 1000 peak points**, deliberately beyond a first-generation horse. Modelled career
shapes on this curve:

| Career | Peak |
|---|---|
| Typical gen-1, peaks in Open | ~410 |
| Strong gen-1, reaches Stakes | ~715 |
| Flawless Stakes campaign, never promoted | ~1130 |
| Championship winner, 3 titles | ~1225 |
| Theoretical perfect, 20 straight wins | ~1585 |

An ordinary or even strong first horse falls well short; clearing the bar takes a horse that
arrives already good, which is breeding (§10) and a built-up yard. The one gap left is a
near-flawless gen-1 climb into Championship (~1055), which still clears. That is a **starter-strength
question, not a threshold question** — any bar high enough to exclude it also excludes a genuine
champion — so it is closed in §10 by what a generation-1 horse is allowed to be, not by raising
the number.

**The yard's tier ladder** (Novice 0 / Professional 400 / Elite 1500 / Champion 3500 / Legend 7500)
is paced across careers, not races: no single horse can reach the top tier, and facility unlocks
stay ahead of the player for a long time.

---

## 9. Divisions & the Living World ✅

**~70 AI horses**, generated when the stable is created, in a pyramid across five divisions:

| Division | Horses |
|---|---|
| **Maiden** | ~20 |
| **Novice** | ~18 |
| **Open** | ~14 |
| **Stakes** | ~10 |
| **Championship** | ~8 |

Weighted to the bottom the way real racing is, so 8-horse fields stay varied rather than showing
you the same seven rivals every start, and so promotion always has somewhere to draw from. Tune
the total upward if fields start repeating.

**Horses must be generated to match their division.** ✅ A Championship horse is rolled as a
Championship-quality animal — high stats *and* high Consistency — not a random horse handed a
division label. The emergent-chaos design in §2 depends entirely on this being done properly.

AI horses **train, age, promote, demote and retire on their own**. Rivals you beat in Maiden climb
alongside you into genuine recurring adversaries, and feed the breeding pool when they retire.
They scale up gently over time, but a well-trained player horse can outclass them. They play by
**exactly the same rules** — no cheating — with jockey skill varying between them.

**Promotion is points-based over a rolling window.** One lucky win won't throw you into a division
that flattens you; one bad day won't undo real progress. Demotion works the same way.

**Stable Reputation** lets new horses enter above Maiden once you've proven you can clear it.

### The rival dossier ✅
Rival traits are hidden until you discover them in competition. Everything learned is recorded in
a **permanent, stable-wide dossier that persists across careers** — because the AI horses persist
too. A rival you scouted three careers ago is still out there racing, and may end up in your
breeding pool.

Learned traits surface directly in the **pre-race form guide**, so the knowledge is actionable at
the moment it matters rather than buried in a separate screen. Combined with faster identification
of traits you've seen before, your stable accumulates genuine **expertise** over time — a form of
progression you earn by playing rather than buy with cash.

---

## 10. Breeding & Genetics

The heart of the game, and the most carefully designed system here.

### The inheritance budget ✅
A retired horse's career converts into a **point total** — drawn from races won, divisions
reached, titles, Legacy, and the stats and potentials it finished with. Breeding **distributes**
that total into the foal rather than rolling fresh numbers.

**This is what makes rerolling non-inflationary.** Rerolling can only reshuffle — trade Speed for
Stamina, concentrate or spread. You cannot exceed the budget. All-A's isn't a lucky roll away;
it's generations of work away. Racing well is literally how you raise what your next horse
inherits.

| Component | Set by |
|---|---|
| **Floor** | The parents — guarantees no worthless foal, ever |
| **Budget** | Career achievement + first-cross bonus, declining per repeat |
| **Variance** | Genetic diversity of the pairing × freshness |

**Career achievement means banked legacy, and nothing else.** An earlier draft of this section
listed races won, divisions reached, titles, legacy *and* finishing stats together. But legacy is
already all of those, weighted by division — adding them alongside it would score a Championship
win two or three times over, and give the game two competing definitions of what a good career is.
The budget therefore reads **banked legacy for the achievement half, and the parents' finishing
potentials for the floor**. One economy, one spine: racing well raises legacy, legacy raises the
budget, the budget raises the next horse.

This also means the retirement timing rule (§8) reaches all the way into the bloodline. A horse run
into the ground banks less legacy, so it breeds a weaker foal — the gamble costs a generation, not
just a number.

### Variance, boom and bust ✅
**Diversity controls variance, not quality.** A fresh outcross is a wide roll — boom or bust, and
that's the thrill. A tightly inbred line is a narrow roll — safe, predictable, dull. So grinding
one pairing *converges toward boring*: the exploit self-extinguishes, and the exciting outcome is
gated behind the behaviour we want to encourage.

A **bust is lopsided, never weak** — great Speed, no Stamina, wrong aptitude for its style. Still
raceable, possibly nichely useful. Floor-or-better always.

Inbreeding narrows things **gradually**, so a favourite line stays viable for many generations.

### First-cross bonus (heterosis) ✅
Parents breeding together for the first time contribute a bonus on top of the base budget,
tapering with each repeat of that pairing. Worked example:

```
Sire  200  +50 (Hall of Fame)   = 250
Dam   220  +0                   = 220
Base                              470
First cross bonus                 +50   → 520
Second foal, same pair            +30   → 500
```

The base never degrades — only the bonus does. Repeats are less exciting, never worse.

Any budget bonus is rolled **once per pairing, not per foal**, so rerolling can never farm it.

### Distribution ✅
**Fully random, weighted by parents** and by the gender-based inheritance rules. Genetics decides the
shape; the surprise is the point. The **foal development phase** is where player agency enters.

Budget covers **stats and potentials**. **Traits and distance aptitude inherit separately** through
the genetic rules with their own mutation chance — so a rare trait is pure delight, never paid for
out of the pool.

### Partners, access & age ✅
- **Your own Hall of Fame horses are free, forever** — and carry a budget bonus, which is what
  makes enshrining one the most valuable outcome a career has (§1)
- **Every horse you retire enters your bloodstock**, Hall of Fame or not. A horse leaves the
  racetrack; it never leaves the yard. Retiring is what stocks the stud, so no run is ever wasted
- **Reputation** unlocks higher-calibre outside partners
- **Age is the only breeding limit.** Retired horses keep ageing and eventually become ineligible.
  No arbitrary caps, no cooldowns — and it means rerolling burns your best sire's remaining years,
  so the reroll grind eats the thing it depends on
- **One foal per pairing; pairings may repeat** while both horses remain fertile
- Breeding is available **at retirement, and any time from your stock**
- Browsing: **simple list by default, full stud book on toggle**

### Rejected foals ✅
**Sold for cash, and they enter the world as rivals** carrying your bloodline's name. Pass on a
colt for mediocre stamina and you may watch him win a Championship in three years.

### Coat genetics ✅
Real equine colour genetics: base **black / bay / chestnut**, plus modifiers (cream, dun, grey,
roan) and white patterns (tobiano, sabino), as true dominant/recessive pairs. A recessive can hide
for three generations and then surprise you. Foals visibly look descended from their parents —
the concrete payoff for building our own layered art.

### Pedigree ✅
**Three generations drive inheritance** (parents and grandparents), with linebreeding concentrating
traits at the cost of variance. **The full tree is always viewable to any depth.**

### The archive ✅
A **CK3-style family tree** — portrait cards on generational rows, connecting lines, click any
ancestor for a detail card with stats, traits and win-loss record. Records every horse you've bred
or raced back to your first starter, plus a trait and gene inheritance map.

This is the story layer, and it's the title of the game. First-class screen, not a submenu.

*Build note (Phase 5 complete): everything the tree reads is already recorded and cannot be
reconstructed later — `sireId`, `damId` and `generation` on every foal since Stage 1, coat genotypes
since Stage 3 so the gene map has real alleles, and foals sold into the world keep their full
ancestry. `pedigreeOf()` in `ui/studBook.ts` walks it, `genotypeOf()` in `sim/coat.ts` reads the
genes. Measured: a horse is 657 bytes, so a thousand-horse tree is 825 KB — storage is not the
constraint, drawing is.*

### Pairing UI ✅
**Show the outcome, not the theory.**

At the breeding screen you see a **preview of the foal's projected potential ranges** — and
nothing else. Ranges are naturally wider for unrelated pairs and narrower for close family, so the
mechanic is *felt* without a rating, a percentage, or a concept to learn. No relatedness lecture
at the moment of decision.

**The mechanic is explained properly in the breeding manual** (§13 codex) for anyone who wants to
understand why their tightly-bred line stopped producing surprises. Discoverable, not imposed.

The **family tree is freely browsable**, including for outside studs — exploring pedigrees is fun
on its own, and shared ancestors are visible there for anyone who goes looking.

### Foal development ✅
A short, **skippable but genuinely significant** phase — a pool of development points spent on stat
growth, aptitude nudges, or coaxing out a latent trait. Explicitly modelled on Pokémon EVs: big
enough that a competitive player would never skip it, fully skippable for anyone who just wants to
race. This is where player agency enters an otherwise random inheritance.

---

## 11. The Stable

### Currencies ✅

**Two numbers, and only two**, because a third was indistinguishable from one of them:

| | Earned by | What it does |
|---|---|---|
| **Cash** | Purses and winning bets | What you **spend** — facilities, staff, supplies, stud fees |
| **Prestige** | Banked legacy from every horse, plus the current one's score | What you're **allowed** to spend it on — facility tiers, staff levels, the supplies catalogue |

Separating them means a lucky payday can't buy standing you haven't earned.

**Reputation was cut.** It was a third counter gating staff and supplies, earned from race results
at 5 for a win, 3 for a second, 2 for a third. Prestige is also earned from race results, also
accumulates for the life of the yard, and also never falls below what past horses banked — so the
two were the same number with different arithmetic, and no player could articulate the difference.

A horse-based version was considered and rejected for the same reason: reputation earned by the
current horse and reset with it is *horse legacy*, minus the division weighting.

The remaining distinction is real: **prestige belongs to the yard, legacy belongs to the horse.**
A jockey signs with the stable and stays through every horse, so the stable's standing gates the
hire. The Hall of Fame judges the horse, so its own legacy decides that.

Because prestige is now the only gate, the hub names the next thing it opens rather than showing a
bare number — "Unlocks Head Trainer level 8 at 1,800". A currency whose purpose the player has to
infer is a currency they ignore.

### Purses ✅

A race's purse is its **division base** — Maiden $5k, Novice $10k, Open $20k, Stakes $50k,
Championship $100k — times the calendar's **difficulty** rating, spanning ×0.6 at the softest to
×1.4 at the toughest.

Difficulty is not decoration: it decides which rivals turn up. The division is ranked by rating and
a selection window slides with the difficulty, so a five-bar race draws the division's best. That
is the risk; the bigger purse is the reward. **Betting odds need no adjustment for it** — they are
priced off the player's rating share of the field actually faced, so a harder field lengthens them
by itself.

Paid down to sixth, modelled on how real racing distributes:

| 1st | 2nd | 3rd | 4th | 5th | 6th | Every other runner |
|---|---|---|---|---|---|---|
| 50% | 22% | 12% | 8% | 5% | 3% | 1% starter's allowance |

The allowance mirrors the small payment real tracks fund for turning up, separately from the
advertised purse. An earlier ladder paid 4th *and everything behind it* a flat 10%, which meant
running last of eight in an Open race collected $2,000 and a bad day cost nothing.

### Facilities ✅
Seven, five levels each: `Training Track` · `Hill Course` · `Swimming Pool` · `Veterinary Wing` ·
`Feed Program` · `Bloodstock Office` · `Stable Grounds`.

**Bloodstock Office** is the information specialist — its levels progressively sharpen *all*
uncertainty: potential ranges on your horse, projected ranges on foals, and pace projections
before a race.

⏳ Branching specialisations (a sprint yard vs a stamina yard) — designed for, added later. The
system must not need restructuring to accept them.

### Staff ✅
A **Trainer** (better gains in a specialty) and a **Jockey** (positioning quality, traffic
avoidance, in-race handling). Both level up and stay with the stable across careers.

You may **hire cheap and develop them, or pay more for pre-levelled** — time versus money, so staff
spending stays relevant whether you're cash-poor early or cash-rich late.

**Staff level is capped by Reputation.** ✅ Cash alone can never buy a top jockey or trainer and
permanently solve race day — you must earn the standing to employ them. This closes the obvious
hole where a rich stable buys its way out of the skill layer forever.

### Cosmetics ✅
**Purely visual — no mechanical effect ever**, so no cosmetic can become a required purchase.

Pick your **stable colours** from a palette; they propagate automatically to jockey silks, tack and
grooming. One identity choice themes everything, nearly free given we already tint at runtime, and
it makes your horse instantly findable in a pack of eight.

Covers: racing silks · tack and equipment · horse accessories and grooming.

**Appearance itself is genetic and not editable.** ✅ Coat, markings, socks, face patterns and eye
colour all come from genes — that is precisely what makes breeding for a look mean anything. What
you *can* freely change is everything worn or applied: tack, silks, grooming, accessories.

The appearance system is built as **data-driven layers**, so new genetic features — eye colour,
additional marking types, mane styles — can be added at any point without refactoring the
renderer or the genetics model.

---

## 12. Art & Audio

### Style ✅
**Clean vector / flat.** Bold shapes, confident colour, crisp at any resolution. Holds polish across
hundreds of coat and marking combinations without quality drifting, and makes gene-driven tinting
read as deliberate rather than as recolouring.

### Animation ✅
**Skeletal rig with layered parts** — body, legs, head, mane, tail as separate tintable pieces on an
animated skeleton. Gaits are procedural, so transitions are smooth, every coat gene tints cleanly,
and a new cosmetic is another layer rather than a full re-draw.

Because the rig is layered, swapping in pixel or painterly artwork later means replacing image
layers, not rewriting the renderer.

### UI tone ✅
**Split personality — "at the races" vs "at your farm".** Race day is modern sports broadcast:
sharp, data-dense, animated. The stable and breeding screens are warm and tactile. The contrast
makes race day feel like an event.

### Venues ✅
**Five tracks**, one per division, visibly escalating from a scrappy country oval to a floodlit
championship stadium — so climbing the ladder is something you see. Plus varied weather, going and
time of day.

**Crowd density scales with race hype and division.** Cheap with instanced sprites, and it makes
the ladder something you feel on race day.

### Audio ✅
**Full race-day soundscape** — hoofbeats shifting with gait and pack density, crowd noise swelling
with position and crowd size, a race caller on key moments, calm ambient music in the stable.
Separate music and SFX toggles in the menu.

---

## 13. UX, Saves & Accessibility

### Starter selection ✅
Six horses, **guaranteed archetype spread** — all four running styles covered, mixed distance
aptitudes, no duplicated traits. Every playthrough offers a legible choice.

**The pool scales with the stable, not past it.** Rarer traits and higher potential appear as the
yard grows, so a fresh line is always worth racing — but a starter is generation 1 and inherits
nothing, so it never matches what a good line produces (§1). The scaling exists to stop a new root
feeling like a punishment, not to make it an alternative to breeding.

Once bloodstock exists, starter selection is reached through **"start a brand-new line"** at
retirement rather than being the default way to get a horse.

### Onboarding ✅
**Learn by playing.** The energy bar's shifting safe zone teaches pacing, the form guide teaches
scouting, the trainer suggests a plan you can accept or ignore. No forced tutorial.

Plus an in-game **guide/codex** — a racing manual and a **breeding manual**. The breeding manual is
where relatedness, variance and the inheritance budget are explained properly, for players who want
to understand the machine. Depth available to read, never imposed.

⏳ Opening: a short camera pan across the stable, then straight into selection. Not story-driven.
Revisit later.

### Difficulty ✅
Selectable tiers affecting AI quality, purses and injury rates, **plus an optional assist toggle,
off by default**. Nothing ever secretly adjusts a win you earned.

### Saves ✅
- **Multiple stable slots**
- **Export / import save files** — insurance against browser storage being cleared, and the
  PC ↔ mobile transfer path
- **Schema versioning and migrations from the first commit**, since multiple slots make a botched
  migration far more costly
- ⏳ Cloud saves deliberately deferred — a server, accounts and ongoing cost is a side project.
  Revisit once the game earns it.

### Accessibility ✅
All built in from the start:
- Colourblind-safe palettes (horse identity is communicated largely through colour)
- Reduced motion option
- Adjustable race speed and pause
- Scalable text and large tap targets
- Independent music and SFX toggles

### Naming ✅
**Procedural, derived from parents, always editable.** A foal of *Storm Signal* and *Quiet Lantern*
might be suggested as *Lantern Warning*. Safeguards required: curated word pools with phonetic rules
so combinations don't produce nonsense, a per-save registry preventing duplicates, a blocklist for
unfortunate accidents, and a length cap.

---

## 14. Tech

TypeScript + Canvas 2D + Vite. No engine, no framework.

```
src/
  sim/        # pure logic, zero DOM — race, training, breeding, genetics
  render/     # canvas drawing, skeletal rig, sprite layering, camera
  ui/         # screens, menus, HUD
  data/       # traits, divisions, name pools, colour genetics tables
  save/       # localStorage persistence, versioned & migratable
tools/        # headless balance harness
```

`sim/` never imports from `render/` or `ui/`. That constraint is what makes the headless balance
harness possible, and it means tuning changes cannot break the visuals.

**The balance harness** runs thousands of seeded races headless to verify no running style dominates,
no division is unwinnable, and the dominance curve hits its targets at every difficulty tier.
Balance by evidence, not by vibes.

**Mobile:** portrait-first, safe-area aware, touch-native, installable as a PWA, playable offline.
Target 60fps on mid-range phones.

---

## 15. Asset & Legal Policy

Non-negotiable:

- **No assets we don't own.** Everything authored for this project or verifiably CC0, tracked in
  `CREDITS.md`. The itch.io reference pack ships with **no licence file of any kind** and is
  **not used**.
- **No trademarked names** — not Sega's, not real racetracks, not real racehorses (many famous horse
  names are trademarked). Fictional tracks, procedurally generated horse names.
- **Mechanics are fair game.** Game rules and systems aren't copyrightable; only expression is. We
  take inspiration from the genre and write every line and pixel ourselves.

### Prior art — Rival Stars Horse Racing (PikPok) ✅

Researched deliberately. Their game has genetic breeding with coat and pattern inheritance,
pedigree history, upgradeable training facilities and stalls, stats built on speed / sprint
energy / acceleration, and four disciplines — flat, steeplechase, cross country, show jumping —
framed as restoring a neglected family homestead.

**Closest overlap:** in their game each horse has a preferred track position, and its sprint bar
refills faster when correctly positioned. That is conceptually near our style-as-energy-efficiency
model.

**Not a legal problem.** Mechanics, rules and systems are not copyrightable. Our implementation is
also materially different — theirs is a refill-rate modifier feeding a rhythm-timed tap on a
moving pointer; ours is a full drain-and-recovery economy with drafting and a kick scaling off
banked energy. The underlying concept derives from real-world running styles, which is public
domain racing knowledge, not their invention.

**Rules for this project:**
- Never use the name "Rival Stars" or PikPok branding anywhere — game, repo, store page, marketing
- Do not reproduce their UI layout, art, or iconography
- Avoid the neglected-family-homestead framing specifically; ours is stable-building, not farm
  restoration
- Keep our control scheme distinct — **Drive is analog and continuous; theirs is a timed tap.**
  Do not drift toward rhythm-tap input
- We are flat racing only; jumping disciplines are theirs to own

---

## 16. Build Order

1. **Race sim + headless balance harness** — prove the energy model and dominance curve
2. **Race renderer** — skeletal horses, camera, minimap, HUD, hold-to-push and the kick
3. **Horse art system** — layered, gene-tinted rendering
4. **Career shell** — starter selection, training weeks, divisions, save/load
5. **Meta layer** — cash, reputation, facilities, staff, retirement, Legacy
6. **Breeding** — budget model, genetics, foal development, CK3-style archive
7. **Polish** — audio, transitions, PWA, mobile tuning, accessibility pass

**Milestone 1 is one fully playable race with real art** — eight horses, running styles,
hold-to-push, the energy bar, finished vector animation. The race is the thing that must be right;
everything else is built on top of it.

---

## 17. Open Items

| # | Item | Status |
|---|---|---|
| 1 | Facility branching specialisations | ⏳ Designed for, added later |
| 2 | Opening camera pan / intro framing | ⏳ Revisit before milestone 4 |
| 3 | Cloud saves | ⏳ Deferred; export/import ships instead |
| 4 | Exact dominance-curve constants | ❓ Tuned empirically via the harness |
| 5 | Budget point scale and conversion rates | ❓ Needs the sim before numbers mean anything |
| 6 | Wager stake caps | ❓ Tune once purses are set |
| 7 | Trait numeric magnitudes | ❓ Tuned via the harness — catalogue itself is done ✅ |
| 8 | Consumable tiers and effect sizes | ❓ Tune once training curves exist |
| 9 | AI horse count if fields repeat | ❓ Start at ~70, raise if rivals feel samey |
| 10 | Whether 4 traits needs a Legacy threshold | ❓ Or stays purely probabilistic |
