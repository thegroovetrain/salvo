// BOON PRESENTATION — the client-side copy layer for the shared BOON_CATALOG
// (Story 2.7). Player-facing names, descriptions, and category labels live HERE,
// never on BoonDef: the catalog is pure sim AND wire contract, so a display
// field would couple every copy edit to a PROTOCOL_VERSION bump. This mirrors
// upgradeToast.ts's upgradeLabel map, one layer up.
//
// DRAFT COPY (the standing draft-copy rule, amendment 13/35): these strings are
// implementer-drafted placeholders for the interim dummy catalog and die with it
// in 2.8, where Eric writes the real names and descriptions.
//
// FAIL-OPEN, not fail-closed: an id with no copy renders a readable
// de-camelCased fallback rather than an empty card. The fail-CLOSED gate lives
// upstream in offerView(), which drops the whole view when an id does not
// resolve against the shared catalog — copy is never load-bearing for
// correctness, only for legibility.

/** Player-facing card names, keyed by boon id (uppercase at the render site). */
const BOON_LABELS: Readonly<Record<string, string>> = {
  reinforcedBulkheads: 'Reinforced Bulkheads',
  splinterMattresses: 'Splinter Mattresses',
  forcedDraught: 'Forced Draught',
  trimmedScrews: 'Trimmed Screws',
  rangefinderCrew: 'Rangefinder Crew',
  practicedLoaders: 'Practiced Loaders',
  highGainAntenna: 'High-Gain Antenna',
  crowsNestWatch: "Crow's Nest Watch",
  deepMagazines: 'Deep Magazines',
  practicedHandlers: 'Practiced Handlers',
};

/** One-line card descriptions (mono, up to ~three lines at 17px in a 216 card). */
const BOON_DESCRIPTIONS: Readonly<Record<string, string>> = {
  reinforcedBulkheads: 'Doubled frames along the waterline. Your hull takes more before it takes water.',
  splinterMattresses: 'Packed hammocks line the plating. A little more hull, and a heavier stop.',
  forcedDraught: 'Blowers pressurise the boiler rooms. She runs harder at full ahead.',
  trimmedScrews: 'Screws re-pitched in the yard. Quicker off the mark and quicker round.',
  rangefinderCrew: 'A drilled crew on the coincidence rangefinder. The deck gun reaches further.',
  practicedLoaders: 'The loading numbers know the drill cold. Shorter wait between salvos.',
  highGainAntenna: 'A taller array on the mast. The sweep finds hulls further out.',
  crowsNestWatch: 'A standing lookout aloft. You see wider, and the sweep comes round sooner.',
  deepMagazines: 'Racks stowed deep in the hull. One more fish in the tubes.',
  practicedHandlers: 'Handlers drilled on the racks. Tubes and rails come back faster.',
};

/** Category tag copy, keyed by BoonDef.category. */
const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  hull: 'HULL',
  propulsion: 'PROPULSION',
  gunnery: 'GUNNERY',
  sensors: 'SENSORS',
  ordnance: 'ORDNANCE',
};

/** "reinforcedBulkheads" -> "Reinforced Bulkheads" — the no-copy fallback. */
function humanize(id: string): string {
  const spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Pure: the card name for a boon id (fail-open — never empty). */
export function boonLabel(id: string): string {
  return Object.hasOwn(BOON_LABELS, id) ? BOON_LABELS[id] : humanize(id);
}

/** Pure: the card description for a boon id (fail-open — '' when unwritten). */
export function boonDescription(id: string): string {
  return Object.hasOwn(BOON_DESCRIPTIONS, id) ? BOON_DESCRIPTIONS[id] : '';
}

/** Pure: the uppercase category tag for a BoonDef.category (fail-open). */
export function boonCategoryLabel(category: string): string {
  return Object.hasOwn(CATEGORY_LABELS, category) ? CATEGORY_LABELS[category] : category.toUpperCase();
}

/** Pure: the "boon fitted" toast line (UX-DR23 self-events-only surface, the
 *  pointToastLine sibling). Diamond glyph = the accrued-boon marker the hotbar
 *  tooltip uses (`◆n`), so the toast and the build readout share one mark. */
export function boonFitToastLine(id: string): string {
  return `◆ ${boonLabel(id).toUpperCase()} FITTED`;
}
