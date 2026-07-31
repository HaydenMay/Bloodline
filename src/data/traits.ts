/**
 * The trait catalogue, transcribed from TRAITS.md.
 *
 * TRAITS.md remains the source of truth for design intent, the eight rules, and
 * the cut log. This file is the machine-readable form. Keep them in sync.
 *
 * Rule 8 (the decision test) before adding anything here:
 *   Does it change a DECISION the player makes, or only a NUMBER the sim
 *   calculates? Only the first is a trait.
 */

export type TraitKind =
  /** Good sometimes, never bad. */
  | 'upside'
  /** Worse here, better there. */
  | 'trade';

export type TraitCategory =
  | 'gate'
  | 'pace'
  | 'energy'
  | 'finish'
  | 'conditions'
  | 'traffic'
  | 'temperament'
  | 'development'
  | 'breeding';

export interface Trait {
  id: TraitId;
  name: string;
  kind: TraitKind;
  category: TraitCategory;
  /** Affects horses other than its own (TRAITS.md "traits with reach"). */
  reach?: boolean;
  description: string;
}

export type TraitId =
  // gate
  | 'fastGate'
  | 'gateRusher'
  | 'coiled'
  | 'alert'
  // pace
  | 'tractable'
  | 'freeRunner'
  | 'pacePusher'
  | 'railHugger'
  | 'wideRunner'
  | 'herdAnimal'
  | 'loner'
  // energy
  | 'ironLungs'
  | 'quickRecovery'
  | 'thirsty'
  | 'cruiser'
  // finish
  | 'heart'
  | 'turnOfFoot'
  | 'relentless'
  | 'grinder'
  // conditions
  | 'mudder'
  | 'firmSpecialist'
  | 'allWeather'
  // traffic
  | 'needsRoom'
  | 'bulldozer'
  | 'highlyStrung'
  | 'crowdFeeder'
  // temperament
  | 'professional'
  | 'hotHeaded'
  | 'bigGame'
  | 'stageFright'
  | 'grudgeHolder'
  // development
  | 'lateBloomer'
  | 'earlyBloomer'
  | 'ironHorse'
  | 'glassCannon'
  | 'goodDoer'
  | 'hardKnocker'
  | 'needsTime'
  // breeding
  | 'prepotent'
  | 'outcrossGem'
  | 'enduring';

const t = (
  id: TraitId,
  name: string,
  kind: TraitKind,
  category: TraitCategory,
  description: string,
  reach = false,
): Trait => ({ id, name, kind, category, description, ...(reach ? { reach } : {}) });

export const TRAITS: Record<TraitId, Trait> = {
  // ---- Gate & start ----
  fastGate: t('fastGate', 'Fast Gate', 'upside', 'gate', 'Breaks a length quicker; less likely to fumble the start.'),
  gateRusher: t('gateRusher', 'Gate Rusher', 'trade', 'gate', 'Explosive break — but burns extra energy through the first furlong.'),
  coiled: t('coiled', 'Coiled', 'trade', 'gate', 'Slow away, exceptional burst once rolling.'),
  alert: t('alert', 'Alert', 'trade', 'gate', 'Never fumbles a start — but is keyed up and slower to settle.'),

  // ---- Pace & position ----
  tractable: t('tractable', 'Tractable', 'upside', 'pace', 'Settles anywhere; much smaller out-of-position energy penalty.'),
  freeRunner: t('freeRunner', 'Free Runner', 'trade', 'pace', 'Fights to go faster early — wasteful unless Temper is high, but sets a fierce pace.'),
  pacePusher: t('pacePusher', 'Pace Pusher', 'trade', 'pace', 'Forces a faster early pace when leading, burning rivals and itself.', true),
  railHugger: t('railHugger', 'Rail Hugger', 'trade', 'pace', 'Cheaper energy on the inside, more expensive forced wide.'),
  wideRunner: t('wideRunner', 'Wide Runner', 'trade', 'pace', 'Avoids traffic almost entirely, but travels further.'),
  herdAnimal: t('herdAnimal', 'Herd Animal', 'trade', 'pace', 'Recovers faster surrounded by horses, worse isolated in front.'),
  loner: t('loner', 'Loner', 'trade', 'pace', 'Weaker in a tight pack, excellent with clear air.'),

  // ---- Energy economy ----
  ironLungs: t('ironLungs', 'Iron Lungs', 'upside', 'energy', 'Slower drain at every effort level.'),
  quickRecovery: t('quickRecovery', 'Quick Recovery', 'upside', 'energy', 'Regenerates faster when settled.'),
  thirsty: t('thirsty', 'Thirsty', 'trade', 'energy', 'Drains fast, recovers fast. Very reactive to good riding.'),
  cruiser: t('cruiser', 'Cruiser', 'trade', 'energy', 'Extremely cheap at moderate effort, punishing at maximum.'),

  // ---- The finish ----
  heart: t('heart', 'Heart', 'upside', 'finish', 'Surges when within a length of the lead in the stretch.'),
  turnOfFoot: t('turnOfFoot', 'Turn of Foot', 'trade', 'finish', 'Kick is stronger but much shorter — punishes an early call.'),
  relentless: t('relentless', 'Relentless', 'trade', 'finish', 'Kick is weaker but sustains far longer.'),
  grinder: t('grinder', 'Grinder', 'trade', 'finish', 'Almost no kick; simply does not decelerate while others fade.'),

  // ---- Conditions ----
  mudder: t('mudder', 'Mudder', 'upside', 'conditions', 'Thrives on soft and heavy going; ordinary on firm.'),
  firmSpecialist: t('firmSpecialist', 'Firm Specialist', 'upside', 'conditions', 'Thrives on firm; ordinary on soft.'),
  allWeather: t('allWeather', 'All-Weather', 'trade', 'conditions', 'Never penalised by the going — but never gains a specialist bonus either.'),

  // ---- Traffic & field ----
  needsRoom: t('needsRoom', 'Needs Room', 'trade', 'traffic', 'Badly affected when shut off, noticeably stronger with clear air.'),
  bulldozer: t('bulldozer', 'Bulldozer', 'upside', 'traffic', 'Grit-driven; forces through traffic and shortens trouble.'),
  highlyStrung: t('highlyStrung', 'Highly Strung', 'trade', 'traffic', 'Slower to shake off trouble, but responds to the drive faster.'),
  crowdFeeder: t('crowdFeeder', 'Crowd Feeder', 'trade', 'traffic', 'Better in large fields, flatter in small ones.'),

  // ---- Temperament & morale ----
  professional: t('professional', 'Professional', 'upside', 'temperament', 'Consistency climbs faster with race starts.'),
  hotHeaded: t('hotHeaded', 'Hot-Headed', 'trade', 'temperament', 'Amplifies every low-Temper swing, good and bad.'),
  bigGame: t('bigGame', 'Big Game', 'trade', 'temperament', 'Rises for high-hype races, flat at quiet meetings.'),
  stageFright: t('stageFright', 'Stage Fright', 'trade', 'temperament', 'Struggles with big crowds, sharper at quiet meetings.'),
  grudgeHolder: t('grudgeHolder', 'Grudge Holder', 'trade', 'temperament', 'Bonus against a horse that has beaten it before.', true),

  // ---- Training & development ----
  lateBloomer: t('lateBloomer', 'Late Bloomer', 'trade', 'development', 'Weak early growth, enormous late.'),
  earlyBloomer: t('earlyBloomer', 'Early Bloomer', 'trade', 'development', 'Fast gains young, plateaus early.'),
  ironHorse: t('ironHorse', 'Iron Horse', 'upside', 'development', 'Very low injury risk, high training tolerance.'),
  glassCannon: t('glassCannon', 'Glass Cannon', 'trade', 'development', 'High ceiling, fragile.'),
  goodDoer: t('goodDoer', 'Good Doer', 'upside', 'development', 'Consumables markedly more effective.'),
  hardKnocker: t('hardKnocker', 'Hard Knocker', 'trade', 'development', 'Recovers fast between starts and thrives on a busy campaign; dulls if rested.'),
  needsTime: t('needsTime', 'Needs Time', 'trade', 'development', 'Requires longer between starts, but gains more from every rest.'),

  // ---- Breeding & legacy ----
  prepotent: t('prepotent', 'Prepotent', 'upside', 'breeding', 'Passes its traits to foals far more reliably.', true),
  outcrossGem: t('outcrossGem', 'Outcross Gem', 'upside', 'breeding', 'Larger first-cross bonus.'),
  enduring: t('enduring', 'Enduring', 'upside', 'breeding', 'Unusually long fertile window.'),
};

export const ALL_TRAIT_IDS = Object.keys(TRAITS) as TraitId[];

/** Traits that affect the race itself — the pool a racing horse rolls from. */
export const RACING_TRAIT_IDS: TraitId[] = ALL_TRAIT_IDS.filter((id) =>
  ['gate', 'pace', 'energy', 'finish', 'conditions', 'traffic'].includes(TRAITS[id].category),
);

/** Which session can rarely instil which trait (TRAITS.md). */
export const TRAINING_TRAITS: Record<string, TraitId[]> = {
  swimming: ['ironLungs', 'quickRecovery'],
  hillWork: ['grinder', 'bulldozer'],
  sprintWork: ['turnOfFoot', 'fastGate'],
  gatePractice: ['alert', 'professional'],
  longGallops: ['cruiser', 'relentless'],
  rest: ['tractable', 'goodDoer'],
};

export const hasTrait = (traits: readonly TraitId[], id: TraitId): boolean => traits.includes(id);
