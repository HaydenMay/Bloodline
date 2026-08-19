import { STAT_KEYS, toGrade, type Horse } from '../sim/types.js';
import { TRAITS } from '../data/traits.js';
import type { BreedingPartner } from '../sim/breeding.js';
import type { RetiredHorse, Stable } from './career.js';
import { attachStatReveal, renderRangeRows, SHORT_STAT_LABELS } from './statDisplay.js';
import {
  breedFoal,
  breedingStock,
  partnersFor,
  pedigreeOf,
  projectFoal,
  timesBred,
  toPartner,
  type PartnerOption,
} from './studBook.js';
import { createRng } from '../sim/rng.js';
import { expressCoat, genotypeOf, inheritCoat, type CoatGenotype } from '../sim/coat.js';
import { createSurface, startLoop } from '../render/canvas.js';
import { drawFrame, loadFrameSequence } from '../render/frameAnimation.js';
import { coatForHorse, hashId, RIVAL_SILKS, type Silks } from '../render/palette.js';

/**
 * The pairing screen (DESIGN.md §10).
 *
 * **Show the outcome, not the theory.** You pick two horses and see the foal's
 * projected potential ranges — and nothing else. No relatedness rating, no
 * budget figure, no diversity percentage. The bands come out wider for an
 * outcross and narrower for close family on their own, so the mechanic is felt
 * at the moment of decision rather than explained at it. The explanation lives
 * in the breeding manual (§13) for anyone who goes looking.
 *
 * **What that rule does not cover is the partner's own form.** The screen used
 * to show a candidate's name, class and fee and nothing more, which meant the
 * only signal for whether a stud was any good was how much it cost — found in
 * play: "I went blindly based on the fact the new outside horse was expensive
 * so she must be good." Price is a terrible proxy, and it was actively
 * misleading here: an outside partner's contribution is seeded almost entirely
 * from its **wins**, so a well-priced horse that never won brings very little.
 *
 * A horse's record, its banked legacy and its stats are public facts about an
 * animal, not an explanation of the mechanic — the same things the archive's
 * detail card has always shown. Withholding them was never what §10 asked for.
 * Grades rather than numbers, per §3.
 *
 * Reached between careers, so it takes a `Stable` rather than a `Career` — at
 * the moment this matters most, the horse that just retired is the yard's
 * newest bloodstock and there is no career left to belong to.
 */

export interface BreedingScreenOptions {
  stable: Stable;
  /** Hands back the foal to campaign, and the yard that now records it. */
  onBred: (foal: Horse, stable: Stable) => void;
  onBack: () => void;
  backLabel?: string;
  /**
   * `breed` produces a foal; `browse` shows the same pairings without the
   * button.
   *
   * A yard reached mid-career has a horse in training already, and a foal bred
   * then would have nowhere to go — one career at a time is the shape of the
   * game. Browsing still earns its place: §10 wants the pedigree freely
   * browsable, and seeing which pairing your line is heading toward is half the
   * reason to keep a mare. The foal itself is bred at the moment the current
   * horse retires, which is when there is a place for it.
   */
  mode?: 'breed' | 'browse';
  /**
   * The yard's own silks, for the foal preview only. Silks stay with the
   * yard rather than any one horse (main.ts: "the next one runs in the same
   * colours"), so whatever this pairing produces races in these regardless
   * of whether the sire or the dam is the outside half of it — found in
   * play, the preview defaulted to a hashed placeholder colour instead and
   * read as simply wrong next to a yard whose actual silks the player
   * already knows on sight.
   */
  playerSilks?: Silks;
}

/** Division names are stored lower case; they are proper nouns on screen. */
const titleCase = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

function describe(horse: Horse): string {
  const traits = horse.traits
    .slice(0, 2)
    .map((id) => TRAITS[id]?.name)
    .filter(Boolean)
    .join(' · ');
  return traits || 'No notable traits';
}


/**
 * The six potentials as grades, in one strip.
 *
 * Potential rather than current stats: what a partner passes on is its ceiling,
 * and an outside stud you meet at four has not finished growing into its own.
 */
function renderGrades(horse: Horse): string {
  return STAT_KEYS.map((key) => {
    const grade = toGrade(horse.potential?.[key] ?? 50);
    return `<span class="stud-card-grade"><em>${SHORT_STAT_LABELS[key]}</em><b class="grade-${grade}">${grade}</b></span>`;
  }).join('');
}

/**
 * A partner's record and what it banked.
 *
 * Legacy is the figure that actually decides the pairing — it is what the
 * inheritance budget reads — so it earns its place beside the record rather
 * than being left for the player to infer from the fee.
 *
 * `withRecord` is false for your own horses, whose note line already carries
 * the career record from `RetiredHorse` — the authoritative copy. Reading it a
 * second time off the `Horse` would print the same fact twice from a weaker
 * source.
 */
function renderForm(horse: Horse, legacyBanked: number, withRecord: boolean): string {
  const legacy = `Legacy ${Math.max(0, Math.round(legacyBanked))}`;
  if (!withRecord) return `<span class="stud-card-form">${legacy}</span>`;

  const starts = horse.starts ?? 0;
  const wins = horse.wins ?? 0;
  const record = starts > 0 ? `${wins} win${wins === 1 ? '' : 's'} from ${starts} starts` : 'Unraced';
  return `<span class="stud-card-form">${record} · ${legacy}</span>`;
}

/** One selectable horse: yours or a rival's. */
function renderCard(
  horse: Horse,
  opts: {
    selected: boolean;
    note: string;
    badge?: string;
    fee?: string;
    barred?: boolean;
    /** Banked legacy. Omitted only where the card is not a breeding candidate. */
    legacy?: number;
    /** False where `note` already carries the record. */
    showRecord?: boolean;
  },
): string {
  return `
    <button type="button" class="stud-card${opts.selected ? ' selected' : ''}${
      opts.barred ? ' barred' : ''
    }" data-id="${horse.id}">
      <span class="stud-card-head">
        <span class="stud-card-name">${horse.name}</span>
        ${opts.badge ? `<span class="stud-card-badge">${opts.badge}</span>` : ''}
      </span>
      <span class="stud-card-meta">${horse.gender === 'stallion' ? 'Stallion' : 'Mare'} · ${horse.age}yo · ${titleCase(horse.division)}</span>
      <span class="stud-card-note">${opts.note}</span>
      ${opts.legacy === undefined ? '' : renderForm(horse, opts.legacy, opts.showRecord !== false)}
      <span class="stud-card-grades">${renderGrades(horse)}</span>
      <span class="stud-card-traits">${describe(horse)}</span>
      ${opts.fee ? `<span class="stud-card-fee">${opts.fee}</span>` : ''}
    </button>`;
}

/** A horse this screen shows has no silks of its own worth reading — outside studs never do. */
function previewSilks(id: string) {
  return RIVAL_SILKS[hashId(id) % RIVAL_SILKS.length]!;
}

/**
 * A single horse's idle portrait, same spritesheet and tinting
 * `archiveScreen.ts`'s own preview uses — this is "what the parents look
 * like," found missing in play: a pairing was made on stats and grades
 * alone, with no way to see either horse before committing.
 *
 * `ownSilks`, when given, is what this horse actually raced in — your own
 * bloodstock (whether "mine" or a partner drawn from the same yard) raced
 * in the yard's real silks, not a hashed placeholder. Found in play: the
 * foal preview (already fixed to use the yard's real silks) showed a
 * different colour than "mine" right next to it, because mine was still
 * falling back to the hash — the yard's own horse looked like it had never
 * raced in its own colours. An outside stud never raced in yours, so it
 * keeps the hashed fallback, same as before.
 */
/** Exported for `foalBornScreen.ts` — the reveal after breeding wants the same idle portrait. */
export function mountPortrait(host: HTMLElement, horse: Horse, ownSilks: Silks | undefined): () => void {
  const surface = createSurface(host);
  const silks = ownSilks ?? previewSilks(horse.id);
  let stopped = false;
  let stopLoop: (() => void) | undefined;

  void loadFrameSequence('southwest-idle', 9).then((sequence) => {
    if (stopped) return;
    let time = 0;
    const loop = startLoop(
      30,
      () => {
        time += 1 / 30;
      },
      () => {
        const { ctx, width, height } = surface;
        ctx.fillStyle = '#0e1218';
        ctx.fillRect(0, 0, width, height);
        drawFrame(ctx, width / 2, height * 0.92, sequence, {
          phase: (time * 0.1) % 1,
          scale: width / 100,
          scheme: { coat: coatForHorse(horse), silks },
        });
      },
    );
    stopLoop = () => loop.stop();
  });

  return () => {
    stopped = true;
    stopLoop?.();
    surface.destroy();
  };
}

/**
 * What the foal *could* look like — a fresh roll of `inheritCoat` swapped in
 * every few seconds while the pairing sits open, rather than a single guess.
 * Genuinely a different possible outcome each time, drawn the same way a
 * real foal's coat will be the moment this pairing is actually bred
 * (`sim/coat.ts`'s inheritCoat), not a canned animation.
 */
const FOAL_PREVIEW_CYCLE_MS = 5000;

/** How long a reroll takes to cross-fade in — found in play, an instant swap read as a glitch against the idle loop's own smooth motion. */
const FOAL_PREVIEW_FADE_SECONDS = 0.4;

type CoatCandidate = { coat: string; genotype: CoatGenotype };

function mountFoalPreview(
  host: HTMLElement,
  sire: Horse,
  dam: Horse,
  playerSilks: Silks | undefined,
): () => void {
  const surface = createSurface(host);
  const sireGenotype = genotypeOf(sire);
  const damGenotype = genotypeOf(dam);
  // Silks stay with the yard, not any one horse — the foal races in yours
  // regardless of which parent is the outside half of the pairing.
  const silks = playerSilks ?? previewSilks('foal-preview');
  let stopped = false;
  let stopLoop: (() => void) | undefined;
  let roll = 0;
  let previous: CoatCandidate | null = null;
  let candidate = rollCandidate();
  let fadeStartTime = 0;

  function rollCandidate(): CoatCandidate {
    roll += 1;
    // Seeded off both parents plus a running counter, not the clock — the
    // cycle timer decides *when* to reroll, this decides *what* to, and
    // stays reproducible from the pairing rather than the moment it was
    // opened.
    const rng = createRng(`foal-preview-${sire.id}-${dam.id}-${roll}`);
    const genotype = inheritCoat(rng, sireGenotype, damGenotype);
    return { coat: expressCoat(genotype), genotype };
  }

  const cycle = window.setInterval(() => {
    previous = candidate;
    candidate = rollCandidate();
    fadeStartTime = -1; // set on the next draw tick, once `time` is known
  }, FOAL_PREVIEW_CYCLE_MS);

  const previewHorseFor = (c: CoatCandidate, tag: string) => ({
    id: `${sire.id}-${dam.id}-${tag}`,
    coat: c.coat,
    coatGenotype: c.genotype,
  });

  void loadFrameSequence('southwest-idle', 9).then((sequence) => {
    if (stopped) return;
    let time = 0;
    const loop = startLoop(
      30,
      () => {
        time += 1 / 30;
      },
      () => {
        const { ctx, width, height } = surface;
        ctx.fillStyle = '#0e1218';
        ctx.fillRect(0, 0, width, height);

        if (fadeStartTime === -1) fadeStartTime = time;
        const fadeElapsed = previous ? time - fadeStartTime : Infinity;
        const drawOpts = (c: CoatCandidate, tag: string) => ({
          phase: (time * 0.1) % 1,
          scale: width / 100,
          scheme: { coat: coatForHorse(previewHorseFor(c, tag)), silks },
        });

        if (previous && fadeElapsed < FOAL_PREVIEW_FADE_SECONDS) {
          const t = fadeElapsed / FOAL_PREVIEW_FADE_SECONDS;
          ctx.globalAlpha = 1 - t;
          drawFrame(ctx, width / 2, height * 0.92, sequence, drawOpts(previous, 'prev'));
          ctx.globalAlpha = t;
          drawFrame(ctx, width / 2, height * 0.92, sequence, drawOpts(candidate, String(roll)));
          ctx.globalAlpha = 1;
        } else {
          previous = null;
          drawFrame(ctx, width / 2, height * 0.92, sequence, drawOpts(candidate, String(roll)));
        }
      },
    );
    stopLoop = () => loop.stop();
  });

  return () => {
    stopped = true;
    window.clearInterval(cycle);
    stopLoop?.();
    surface.destroy();
  };
}

export function mountBreedingScreen(
  container: HTMLElement,
  { stable, onBred, onBack, backLabel = '← Back', mode = 'breed', playerSilks }: BreedingScreenOptions,
): () => void {
  const root = document.createElement('div');
  root.className = 'breeding-screen';
  container.appendChild(root);

  const stock = breedingStock(stable);
  let mine: RetiredHorse | undefined = stock[0];
  let chosen: PartnerOption | undefined;
  let detachReveal: (() => void) | undefined;
  let stopPortraits: (() => void) | undefined;

  const listeners: Array<() => void> = [];
  const on = (el: Element | null, event: string, handler: EventListener): void => {
    if (!el) return;
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  };

  function partners(): PartnerOption[] {
    return mine ? partnersFor(stable, mine.horse) : [];
  }

  function render(): void {
    detachReveal?.();
    stopPortraits?.();
    listeners.splice(0).forEach((off) => off());

    const options = partners();
    // A selection made before the list changed may no longer be in it.
    if (chosen && !options.some((o) => o.partner.horse.id === chosen!.partner.horse.id)) {
      chosen = undefined;
    }

    const projection =
      mine && chosen
        ? projectFoal(toPartner(mine), chosen.partner, chosen.timesBred, pedigreeOf(stable))
        : null;

    // Same rule breedFoal itself uses (studBook.ts): the stallion is the
    // sire whichever side of the pairing the player picked first, so the
    // portrait row and the actual foal agree on who is who.
    const [sireHorse, damHorse] =
      mine && chosen
        ? chosen.partner.horse.gender === 'mare'
          ? [mine.horse, chosen.partner.horse]
          : [chosen.partner.horse, mine.horse]
        : [undefined, undefined];

    root.innerHTML = `
      <div class="breeding-container">
        <div class="breeding-top-bar">
          <button class="btn-back" id="back-btn">${backLabel}</button>
          <h2>Breeding</h2>
          <div style="width: 80px;"></div>
        </div>

        ${
          stock.length === 0
            ? `<p class="breeding-empty">
                 You have no horses to breed from yet. Every horse you retire joins your
                 bloodstock — the first one is the start of the line.
               </p>`
            : `
          <section class="breeding-section">
            <h3>From your yard</h3>
            <div class="stud-list">
              ${stock
                .map((entry) =>
                  renderCard(entry.horse, {
                    selected: entry.horse.id === mine?.horse.id,
                    note: `${entry.wins} wins from ${entry.starts} starts`,
                    legacy: entry.legacyBanked,
                    showRecord: false,
                    ...(entry.hallOfFame ? { badge: '🏛️ Hall of Fame' } : {}),
                  }),
                )
                .join('')}
            </div>
          </section>

          <section class="breeding-section">
            <h3>Partner · your yard holds $${stable.cash.toLocaleString()}</h3>
            ${
              options.length === 0
                ? `<p class="breeding-empty">Nothing available to pair with this horse.</p>`
                : `<div class="stud-list" id="partner-list">
                     ${options
                       .map((option) =>
                         renderCard(option.partner.horse, {
                           selected: option.partner.horse.id === chosen?.partner.horse.id,
                           note:
                             option.timesBred === 0
                               ? 'A new cross'
                               : `Bred ${option.timesBred} time${option.timesBred === 1 ? '' : 's'} before`,
                           legacy: option.partner.legacyBanked,
                           ...(option.source === 'bloodstock'
                             ? { badge: 'Your yard' }
                             : { badge: 'Outside' }),
                           fee:
                             option.fee === 0
                               ? 'Free — your own'
                               : `$${option.fee.toLocaleString()}`,
                           barred: option.fee > stable.cash,
                         }),
                       )
                       .join('')}
                   </div>`
            }
          </section>

          <section class="breeding-section">
            <h3>The foal</h3>
            ${
              projection
                ? `<div class="breeding-portraits">
                     <div class="breeding-portrait">
                       <div class="breeding-portrait-frame" id="portrait-sire"></div>
                       <span class="breeding-portrait-label">${sireHorse!.name}</span>
                     </div>
                     <div class="breeding-portrait breeding-portrait-foal">
                       <div class="breeding-portrait-frame" id="portrait-foal"></div>
                       <span class="breeding-portrait-label">The foal, maybe</span>
                     </div>
                     <div class="breeding-portrait">
                       <div class="breeding-portrait-frame" id="portrait-dam"></div>
                       <span class="breeding-portrait-label">${damHorse!.name}</span>
                     </div>
                   </div>
                   <p class="breeding-hint breeding-hint-coat">A preview of the foal this pairing could produce.</p>
                   <div class="stat-rows" id="projection">${renderRangeRows(projection)}</div>
                   <p class="breeding-hint">Where this pairing usually lands. Tap for numbers.</p>
                   ${
                     mode === 'breed'
                       ? `<button class="btn btn-primary" id="breed-btn"${
                           chosen!.fee > stable.cash ? ' disabled' : ''
                         }>${
                           chosen!.fee > stable.cash
                             ? `Fee is $${chosen!.fee.toLocaleString()} — your yard holds $${stable.cash.toLocaleString()}`
                             : `Breed ${mine!.horse.name} &amp; ${chosen!.partner.horse.name}${
                                 chosen!.fee > 0 ? ` — $${chosen!.fee.toLocaleString()}` : ''
                               }`
                         }</button>`
                       : `<p class="breeding-empty">You have a horse in training. This pairing is
                            yours to make the day that career ends.</p>`
                   }`
                : `<p class="breeding-empty">Pick a partner to see what the pairing could produce.</p>`
            }
          </section>`
        }
      </div>`;

    if (projection && sireHorse && damHorse) {
      const sireHost = root.querySelector<HTMLElement>('#portrait-sire');
      const damHost = root.querySelector<HTMLElement>('#portrait-dam');
      const foalHost = root.querySelector<HTMLElement>('#portrait-foal');
      // Raced in the yard's own silks: "mine" always did, and so did a
      // partner drawn from your own bloodstock rather than the outside list.
      const ranInYourColours = (horse: Horse): boolean =>
        horse.id === mine?.horse.id ||
        (chosen?.source === 'bloodstock' && horse.id === chosen.partner.horse.id);
      const stops = [
        sireHost
          ? mountPortrait(sireHost, sireHorse, ranInYourColours(sireHorse) ? playerSilks : undefined)
          : undefined,
        damHost
          ? mountPortrait(damHost, damHorse, ranInYourColours(damHorse) ? playerSilks : undefined)
          : undefined,
        foalHost ? mountFoalPreview(foalHost, sireHorse, damHorse, playerSilks) : undefined,
      ];
      stopPortraits = () => stops.forEach((stop) => stop?.());
    }

    on(root.querySelector('#back-btn'), 'click', onBack);

    root.querySelectorAll<HTMLElement>('.breeding-section:first-of-type .stud-card').forEach(
      (card) => {
        on(card, 'click', () => {
          mine = stock.find((entry) => entry.horse.id === card.dataset.id);
          chosen = undefined;
          render();
        });
      },
    );

    root.querySelectorAll<HTMLElement>('#partner-list .stud-card').forEach((card) => {
      on(card, 'click', () => {
        chosen = options.find((option) => option.partner.horse.id === card.dataset.id);
        render();
      });
    });

    const projectionEl = root.querySelector<HTMLElement>('#projection');
    if (projectionEl) detachReveal = attachStatReveal(projectionEl);

    on(root.querySelector('#breed-btn'), 'click', () => {
      if (!mine || !chosen || chosen.fee > stable.cash) return;
      const partner: BreedingPartner = chosen.partner;
      const { foal } = breedFoal(stable, toPartner(mine), partner, chosen.fee);
      onBred(foal, stable);
    });
  }

  render();

  return () => {
    detachReveal?.();
    stopPortraits?.();
    listeners.splice(0).forEach((off) => off());
    root.remove();
  };
}

/** Whether a yard has anything to breed at all, for the screens that offer it. */
export function canBreedHere(stable: Stable): boolean {
  const stock = breedingStock(stable);
  return stock.some((entry) => partnersFor(stable, entry.horse).length > 0);
}

/** Re-exported so callers can show a repeat count without reaching into the stud book. */
export { timesBred };
