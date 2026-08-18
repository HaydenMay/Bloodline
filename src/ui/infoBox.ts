import { toGrade, STAT_KEYS, type Horse, type StatKey } from "../sim/types.js";
import { getPotentialBand } from "./statDisplay.js";
import { TRAITS } from "../data/traits.js";
import { coatFor, coatForHorse, type Silks } from "../render/palette.js";
import { getBadgeDataUri } from "../render/shieldBadge.js";

/**
 * The info box.
 *
 * Letter grades for scanning, exact numbers alongside for when you are actually
 * planning (DESIGN.md §3). Potential is deliberately shown as a RANGE, never a
 * number — it is the thing that unfolds over a career, and spoiling it removes
 * the reason to keep training.
 *
 * Used here as a hover box on the race bar; Phase 3 reuses it wherever a horse
 * needs describing.
 */

const STAT_LABELS: Record<StatKey, string> = {
  speed: "Speed",
  stamina: "Stamina",
  burst: "Burst",
  grit: "Grit",
  temper: "Temper",
  consistency: "Consistency",
};

// Field-position language only. Moment (labelled separately) says WHEN a horse
// spends, so this must never describe timing or the two read as contradicting
// each other.
const MOMENT_LABELS: Record<string, string> = {
  early: "Goes early",
  earlyMid: "Goes before halfway",
  midLate: "Goes off the turn",
  late: "Goes late",
};

const STYLE_LABELS: Record<string, { name: string; seat: string }> = {
  frontRunner: { name: "Front-runner", seat: "Runs up front" },
  stalker: { name: "Stalker", seat: "Sits just off the pace" },
  midPack: { name: "Mid-pack", seat: "Settles mid-field" },
  closer: { name: "Closer", seat: "Settles at the back" },
};

export function renderInfoBox(horse: Horse, showPotential = false): string {
  const style = STYLE_LABELS[horse.style] ?? STYLE_LABELS["closer"]!;
  const coat = coatFor(horse.coat);

  // Rivals never show their ceilings — §3 gives you a form guide, not a stat
  // dump. Your own horse shows a per-stat band.
  const isPlayerHorse = horse.potential !== undefined && showPotential;
  const stats = STAT_KEYS.map((key) => {
    const value = Math.round(horse.stats[key]);
    const grade = toGrade(value);
    const ceiling = horse.potential?.[key];
    const band = isPlayerHorse && ceiling !== undefined
      ? getPotentialBand(value, ceiling)
      : null;
    return `
      <div class="ib-stat">
        <span class="ib-stat-name">${STAT_LABELS[key]}</span>
        <span class="ib-bar">
          ${band ? `<i class="ib-ceiling" style="width:${band.ceilingAt.toFixed(0)}%"></i>` : ""}
          <i class="ib-fill" style="width:${value}%"></i>
        </span>
        <span class="ib-grade ib-g${grade}">${grade}</span>
        <span class="ib-num">${value}</span>
      </div>
      ${band ? `<div class="ib-room room-${band.id}">${band.label}</div>` : ""}`;
  }).join("");

  // A plain range in metres, not a grade per band. The bands needed explaining
  // every time; "Preferred Length 600-800 m" does not (REBUILD.md §7).
  const { min, max } = horse.preferredDistance;
  const width = max - min;
  const versatility =
    width >= 550
      ? "handles most trips"
      : width <= 300
        ? "specialist"
        : "some scope";
  const distance = `
      <div class="ib-apt">
        <span>Preferred length</span>
        <b>${min}–${max} m</b>
      </div>
      <div class="ib-apt ib-apt-note">
        <span>${versatility}</span>
      </div>`;

  const traits = horse.traits.length
    ? horse.traits
        .map(
          (id) =>
            `<span class="ib-trait">${TRAITS[id].name}` +
            `<span class="ib-tip">${TRAITS[id].description}</span></span>`,
        )
        .join("")
    : '<span class="ib-trait ib-none">None discovered</span>';

  // Placeholder for badge; will be updated once loaded
  const badgeHtml = `<span class="ib-badge-placeholder" style="background:${coat.body};border-color:${coat.hair}"></span>`;

  return `
    <div class="ib-head">
      ${badgeHtml}
      <div>
        <p class="ib-name">${horse.name}</p>
        <p class="ib-sub">${coat.name} ${horse.gender === "stallion" ? "colt" : "filly"} · ${horse.age}yo · ${horse.division}</p>
      </div>
    </div>

    <div class="ib-row">
      <div><span class="ib-k">Style</span><span class="ib-v">${style.name}</span></div>
      <div><span class="ib-k">Runs</span><span class="ib-v">${style.seat.toLowerCase()}</span></div>
      <div><span class="ib-k">Moment</span><span class="ib-v">${(MOMENT_LABELS[horse.moment] ?? "").toLowerCase()}</span></div>
    </div>

    <p class="ib-section">Attributes</p>
    ${stats}

    <p class="ib-section">Distance</p>
    <div class="ib-apts">${distance}</div>

    <p class="ib-section">Traits</p>
    <div class="ib-traits">${traits}</div>
  `;
}

/** Attaches a hover/tap card to a trigger element. */
export function attachInfoBox(
  trigger: HTMLElement,
  horse: Horse,
  silks?: Silks,
  /**
   * Whether to show potential bands. Off by default: §3 gives you a form guide
   * on a rival, not its ceilings — only your own horse reveals headroom.
   */
  showPotential = false,
): () => void {
  const card = document.createElement("div");
  card.className = "info-box-popover";
  card.hidden = true;
  const content = document.createElement("div");
  content.className = "info-box-content";
  content.innerHTML = renderInfoBox(horse, showPotential);
  card.appendChild(content);
  document.body.appendChild(card);

  // Load badge asynchronously if silks provided
  if (silks) {
    getBadgeDataUri({ coat: coatForHorse(horse), silks })
      .then((uri) => {
        const placeholder = card.querySelector(".ib-badge-placeholder");
        if (uri && placeholder) {
          placeholder.replaceWith(
            Object.assign(document.createElement("img"), {
              className: "ib-badge",
              src: uri,
              alt: "Shield badge",
            }),
          );
        }
      })
      .catch(() => {
        // If badge fails, keep the placeholder swatch
      });
  }

  const place = (): void => {
    const r = trigger.getBoundingClientRect();
    card.hidden = false;
    const cardRect = card.getBoundingClientRect();
    const triggerCenterY = r.top + r.height / 2;

    // Try positioning to the right first (most common), then fall back to left
    const rightPos = r.right + 12;
    const leftPos = r.left - cardRect.width - 12;
    const top = Math.max(
      8,
      Math.min(
        triggerCenterY - cardRect.height / 2,
        window.innerHeight - cardRect.height - 8,
      ),
    );

    if (rightPos + cardRect.width + 8 <= window.innerWidth) {
      // Position to the right
      card.style.left = `${rightPos}px`;
      card.classList.remove("is-left");
    } else {
      // Position to the left as fallback
      card.style.left = `${Math.max(8, leftPos)}px`;
      card.classList.add("is-left");
    }

    card.style.top = `${top}px`;
  };

  // Hovering peeks; clicking PINS it open so you can read it properly without
  // holding the cursor still. Pinned boxes accept the mouse so links and
  // tooltips inside them work.
  let pinned = false;

  const show = (): void => {
    if (!pinned) place();
  };
  const hide = (): void => {
    if (!pinned) card.hidden = true;
  };
  const setPinned = (value: boolean): void => {
    pinned = value;
    card.classList.toggle("is-pinned", value);
    if (value) place();
    else card.hidden = true;
  };

  const onTriggerClick = (e: Event): void => {
    e.stopPropagation();
    setPinned(!pinned);
  };
  const onDocClick = (e: Event): void => {
    if (pinned && !card.contains(e.target as Node)) setPinned(false);
  };

  trigger.addEventListener("pointerenter", show);
  trigger.addEventListener("pointerleave", hide);
  trigger.addEventListener("click", onTriggerClick);
  document.addEventListener("click", onDocClick);

  return (): void => {
    trigger.removeEventListener("pointerenter", show);
    trigger.removeEventListener("pointerleave", hide);
    trigger.removeEventListener("click", onTriggerClick);
    document.removeEventListener("click", onDocClick);
    card.remove();
  };
}
