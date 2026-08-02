# Bloodline — Trait Catalogue

Companion to [DESIGN.md](DESIGN.md) §2.

## Rules

1. **Traits define the horse, not its stats.** Sims-style identity, not modifiers.
2. **2–4 per horse.** Two standard; Legacy raises the odds of a third; four is rare.
3. **Every trait is either a conditional upside or a genuine two-way trade.**
   Good sometimes and never bad — *or* worse here and better there. **Never a downside with
   nothing on the other side of it.** "Bad early in races" is not a trait; "slower early but
   thrives late" is.
4. **Symmetric.** Player and AI horses draw from the same pool under the same rules. No
   player-only safety net.
5. **No trait may duplicate a stat or an aptitude grade.** Distance preference lives in the
   Sprint/Mile/Route grades, not in traits.
6. **Every trait must change how you ride or breed**, not just add a number.
7. One visible at selection; inherited traits visible on foals; the rest discovered through racing.
8. **The decision test — the primary filter.**
   > *Does it change a **decision the player makes**, or only a **number the sim calculates**?*

   `Cruiser` changes *when you drive*. `Deep Well` changed a variable. Only the first is a trait.
   Most bad traits pass rules 1–7 and fail this one, because they're a modifier wearing an
   evocative name. **Apply rule 8 before adding anything to this catalogue.**

**Legend:** ➕ conditional upside (good sometimes, never bad) · ⚖️ two-way trade ·
🧬 breeding-facing · 🔗 reaches beyond this horse

---

## Gate & start

| Trait | Effect |
|---|---|
| **Fast Gate** ➕ | Breaks a length quicker; reduces Consistency fumble chance |
| **Gate Rusher** ⚖️ | Explosive break — but kick-charge regen is slowed through the first furlong |
| **Coiled** ⚖️ | Slow away, exceptional Burst once rolling |
| **Alert** ⚖️ | Never fumbles a start regardless of Consistency — but is keyed up and slower to settle, delaying charge regen early |

## Pace & position

| Trait | Effect |
|---|---|
| **Tractable** ➕ | Settles anywhere; much smaller out-of-position regen penalty. Style-flexible |
| **Free Runner** ⚖️ | Fights to go faster early — wastes ground unless Temper is high, but sets a fierce pace |
| **Pace Pusher** ⚖️🔗 | Forces a faster early pace when leading, burning rivals *and* itself |
| **Rail Hugger** ⚖️ | Faster charge regen on the inside, slower forced wide |
| **Wide Runner** ⚖️ | Avoids traffic almost entirely, but physically travels further |
| **Herd Animal** ⚖️ | Regens faster surrounded by horses, worse isolated in front |
| **Loner** ⚖️ | Weaker in a tight pack, excellent with clear air |

## The charge economy

| Trait | Effect |
|---|---|
| **Iron Lungs** ➕ | Faster kick-charge regen at every effort level |
| **Quick Recovery** ➕ | Regenerates charges faster when settled |
| **Thirsty** ⚖️ | Regen swings harder with how you ride — big payoff for a well-timed pull, nothing extra otherwise |
| **Cruiser** ⚖️ | Regens charges cheaply at moderate effort, badly at maximum |

## The finish

| Trait | Effect |
|---|---|
| **Heart** ➕ | Surges when within a length of the lead in the stretch |
| **Turn of Foot** ⚖️ | Kick is stronger but much shorter — punishes an early call |
| **Relentless** ⚖️ | Kick is weaker but sustains far longer |
| **Grinder** ⚖️ | Almost no kick; simply doesn't decelerate while everything else fades |

## Conditions

| Trait | Effect |
|---|---|
| **Mudder** ➕ | Thrives on soft and heavy going; ordinary on firm |
| **Firm Specialist** ➕ | Thrives on firm; ordinary on soft |
| **All-Weather** ⚖️ | Never penalised by the going — but never gains a specialist's bonus either, so a Mudder beats it in the mud and a Firm Specialist beats it on firm |

> Distance preference deliberately absent — that's what the Sprint / Mile / Route aptitude grades
> are for. A trait must never restate an aptitude.

## Traffic & field

| Trait | Effect |
|---|---|
| **Needs Room** ⚖️ | Badly affected when shut off, noticeably stronger than normal with clear air |
| **Bulldozer** ➕ | Grit-driven; forces through traffic and shortens trouble |
| **Highly Strung** ⚖️ | Slower to shake off traffic trouble, but responds to the Drive faster |
| **Crowd Feeder** ⚖️ | Better in large fields, flatter in small ones |

## Temperament & morale

| Trait | Effect |
|---|---|
| **Professional** ➕ | Consistency climbs faster with race starts |
| **Hot-Headed** ⚖️ | Amplifies every low-Temper swing, good and bad |
| **Big Game** ⚖️ | Rises for high-hype races with big crowds, flat at quiet meetings |
| **Stage Fright** ⚖️ | Struggles with big crowds, sharper at quiet meetings |
| **Grudge Holder** ⚖️🔗 | Bonus against a horse that has beaten it before |

## Training & development

| Trait | Effect |
|---|---|
| **Late Bloomer** ⚖️ | Weak early growth, enormous late |
| **Early Bloomer** ⚖️ | Fast gains young, plateaus early |
| **Iron Horse** ➕ | Very low injury risk, high training tolerance |
| **Glass Cannon** ⚖️ | High ceiling, fragile |
| **Good Doer** ➕ | Consumables markedly more effective |
| **Hard Knocker** ⚖️ | Recovers fast between starts and thrives on a busy campaign; dulls if rested |
| **Needs Time** ⚖️ | Requires longer between starts, but gains more from every rest |

## Breeding & legacy 🧬

| Trait | Effect |
|---|---|
| **Prepotent** ➕🔗 | Passes its traits to foals far more reliably |
| **Outcross Gem** ➕ | Larger first-cross bonus |
| **Enduring** ➕ | Unusually long fertile window |

---

## Acquired through training

Traits are overwhelmingly innate, but a young horse can **rarely** gain one from training — and
which one depends on the **specific session**. Early years only, so a two-year-old's schedule
genuinely shapes what it becomes. **Breakthrough sessions carry a higher chance.**

| Session | Can rarely instil |
|---|---|
| Swimming | Iron Lungs · Quick Recovery |
| Hill work | Grinder · Bulldozer |
| Sprint work | Turn of Foot · Fast Gate |
| Gate practice | Alert · Professional |
| Long gallops | Cruiser · Relentless |
| Rest & turnout | Tractable · Good Doer |

Rare enough to be a memorable event, never frequent enough that anyone grinds swimming for twenty
weeks chasing Iron Lungs.

---

## Traits with reach 🔗

Most traits affect only their own horse's numbers. Three affect **other horses or other
careers**, which is a genuinely different kind of design object and worth protecting from any
future cut:

- **Pace Pusher** — changes races for horses that aren't yours. This is the trait that manufactures
  the pace collapses upsets come from
- **Grudge Holder** — requires a *specific* rival and spans careers, turning a recurring opponent
  into a personal rivalry
- **Prepotent** — reaches forward into generations not yet bred

(`Bulldozer` produces a dramatic *moment* but only ever affects its own horse — a strong trait,
not a far-reaching one.)

---

## Cut, and why

| Trait | Reason |
|---|---|
| `Slow Gate` | Pure downside, nothing on the other side |
| `Gate Fear` | Pure downside, and duplicates Consistency's fumbled-start failure |
| `Claustrophobic` | Reframed as **Needs Room** to give it an upside |
| `Sensitive` | Reframed as **Highly Strung** |
| `Delicate` | Reframed as **Needs Time** |
| `Front-Heavy` | Duplicates the distance aptitude grades |
| `Stayer` | Duplicates the distance aptitude grades |
| `Deep Well` | **+Stamina wearing a hat.** Duplicated a stat outright (rules 5, 8) |
| `Photo Finisher` | A number in a costume — no decision, no visibility, nothing to ride around (rule 8) |
| `Night Runner` | Too thin, and no decision attached since race times aren't meaningfully chosen. `Big Game` covers marquee-event energy |
| `Alert` (old) | Negated a stat rather than duplicating one — switched off part of Consistency's job. **Reworked**, not cut |
| `All-Weather` (old) | Deleted the conditions system instead of engaging with it. **Reworked** into a real trade |

---

## Open

- Exact numeric magnitudes — tuned via the balance harness once the sim exists
- Whether trait count 4 requires a Legacy threshold or stays purely probabilistic
- Whether the pool needs more 🔗 traits, given how much narrative they generate for their cost
