import io

ROOT = '/Users/ericseibt/Code/salvo/.claude/worktrees/7-5-upgrade-catalog/'


class F:
    def __init__(self, rel):
        self.p = ROOT + rel
        self.s = io.open(self.p, encoding='utf-8').read()

    def rep(self, a, b):
        assert a in self.s, (self.p, a[:90])
        self.s = self.s.replace(a, b)

    def save(self):
        io.open(self.p, 'w', encoding='utf-8').write(self.s)


# =============================== ui/boonCopy.ts ===============================
f = F('client/src/ui/boonCopy.ts')

f.rep("""// TORPEDO, EXTRA TUBE, BOOST DURATION, BOOST SPEED, STAR SHELLS, MINES, plus
// PHOSPHOR SHELLS / DAZZLE SHELLS / PROP FOULING MINES. The v1 bespoke ladders
// survive ONLY where wave 1 did not touch the line (the cannon and the decoy
// buoy, both reworked in wave 2, and the acquisition cards). Seven lines were
// deleted outright (gunDamage, torpedoDamage, torpedoCommand, mineDamage,
// mineMax, starRadius, boostMax) and their copy went with them.""",
      """// TORPEDO, EXTRA TUBE, BOOST DURATION, BOOST SPEED, STAR SHELLS, MINES, plus
// PHOSPHOR SHELLS / DAZZLE SHELLS / PROP FOULING MINES. Seven lines were
// deleted outright (gunDamage, torpedoDamage, torpedoCommand, mineDamage,
// mineMax, starRadius, boostMax) and their copy went with them.
//
// STORY 7-5 WAVE 2 — TWO WHOLE EQUIPMENTS CHANGED HANDS. The cannon became the
// BROADSIDE BARRAGE and the decoy buoy the RADAR BUOY, so every last v1 bespoke
// ladder is now retired: HEAVY CHARGE / PLUNGING FIRE / ARMOR-PIERCING SHELLS
// and EXTENDED BATTERY are DELETED with their catalog lines, and SELF-PROPELLED
// MINES with the verb CAPTIVE MINES replaced. Their replacements are Eric's own
// names, verbatim canon (`7-5-decks.md`): BROADSIDE SPREAD I–IV, BROADSIDE
// TURRETS I–II, BUOY I–IV, GUN BUOY, JAMMING BUOY, CAPTIVE MINES.""")

f.rep("""  // --- CANNON (WAVE 2 rework) — carried forward VERBATIM --------------------
  cannonDamage: ['HEAVY CHARGE Mk I', 'HEAVY CHARGE Mk II', 'HEAVY CHARGE Mk III', 'HEAVY CHARGE Mk IV', 'HEAVY CHARGE Mk V'],
  cannonArcing: ['PLUNGING FIRE'],
  cannonAp: ['ARMOR-PIERCING SHELLS'],""",
      """  // --- BROADSIDE BARRAGE (WAVE 2 — replaces the cannon outright) ------------
  // Eric's names, verbatim. SPREAD is the only ladder in the catalog whose
  // number goes DOWN as it climbs (the fan tightens), which is why its rules
  // text prints the fan's half-angle rather than the rung the card writes.
  broadsideSpread: ['BROADSIDE SPREAD I', 'BROADSIDE SPREAD II', 'BROADSIDE SPREAD III', 'BROADSIDE SPREAD IV'],
  broadsideTurrets: ['BROADSIDE TURRETS I', 'BROADSIDE TURRETS II'],""")

f.rep("""  mineBlast: ['MINES I', 'MINES II', 'MINES III', 'MINES IV'],
  mineSelfPropelled: ['SELF-PROPELLED MINES'],
  minePropFouling: ['PROP FOULING MINES'],""",
      """  mineBlast: ['MINES I', 'MINES II', 'MINES III', 'MINES IV'],
  minePropFouling: ['PROP FOULING MINES'],
  // WAVE 2: the tracking mine becomes a torpedo mine. SELF-PROPELLED MINES is
  // deleted with the verb it named.
  mineCaptive: ['CAPTIVE MINES'],""")

f.rep("""  // --- DECOY BUOY (WAVE 2 rework) — carried forward VERBATIM ----------------
  decoyDuration: ['EXTENDED BATTERY Mk I', 'EXTENDED BATTERY Mk II', 'EXTENDED BATTERY Mk III', 'EXTENDED BATTERY Mk IV', 'EXTENDED BATTERY Mk V'],""",
      """  // --- RADAR BUOY (WAVE 2 — replaces the decoy buoy outright) ---------------
  buoySweep: ['BUOY I', 'BUOY II', 'BUOY III', 'BUOY IV'],
  buoyGun: ['GUN BUOY'],
  buoyJamming: ['JAMMING BUOY'],""")

f.rep("""  acquireCannon: ['CANNON'],
  acquireDecoy: ['DECOY BUOY'],""",
      """  acquireBroadside: ['BROADSIDE BARRAGE'],
  acquireRadarBuoy: ['RADAR BUOY'],""")

f.rep("""  guns: 'GUNS',
  cannon: 'CANNON',
  torpedoes: 'TORPEDOES',
  mines: 'MINES',
  speedBoost: 'SPEED BOOST',
  starShells: 'STAR SHELLS',
  decoyBuoy: 'DECOY BUOY',""",
      """  guns: 'GUNS',
  broadside: 'BROADSIDE',
  torpedoes: 'TORPEDOES',
  mines: 'MINES',
  speedBoost: 'SPEED BOOST',
  starShells: 'STAR SHELLS',
  radarBuoy: 'RADAR BUOY',""")

f.rep("""/** A 0..1 scale as a percentage OF BASE""",
      """/** Radians as a signed half-angle in whole-ish degrees — "±12°". The one
 *  ladder whose printed number falls as it climbs (the broadside fan tightens),
 *  so the ± is doing real work: it says the number is a HALF-WIDTH about the
 *  click, not a distance. */
function halfAngleDeg(rad: number): string {
  return `±${num((rad * 180) / Math.PI)}°`;
}

/** A 0..1 scale as a percentage OF BASE""")

f.rep("""  cannonDamage: { label: 'Cannon damage', read: (s) => s.cannon.damage },""",
      """  // THE BROADSIDE PAIR (Story 7-5 wave 2). SPREAD's stat-addressable field is a
  // RUNG (1..5) — an index into an authored ladder of degrees — and printing
  // "1 → 2" would tell the player nothing about what tightens. So it reads the
  // DERIVED half-angle instead, straight off the same effectiveStats preview
  // diff every other line uses: the firewall does the ladder lookup and the ×4
  // clamp, so a maxed stack honestly prints "±3° → ±3°".
  broadsideSpread: {
    label: 'Barrage spread',
    read: (s) => s.broadside.fanHalfAngleRad,
    fmt: halfAngleDeg,
    note: 'Shells land nearer the point you clicked.',
  },
  broadsideTurrets: {
    label: 'Shells per barrage',
    read: (s) => s.broadside.turrets,
    note: 'An odd count puts one shell dead on your click.',
  },""")

f.rep("""  decoyDuration: { label: 'Buoy lifetime', read: (s) => s.decoyBuoy.durationMs, fmt: secs },""",
      """  buoySweep: { label: 'Buoy sweep', read: (s) => s.radarBuoy.sweepRpm, fmt: (v) => `${num(v)} RPM` },""")

f.rep("""    note: 'Sight, gun, cannon and star shells reach with it.',""",
      """    note: 'Sight, gun, broadside and star shells reach with it.',""")

f.rep("""const DOCTRINE_TEXT: Readonly<Record<string, string>> = {
  cannonArcing: 'Cannon shells lob over islands and hulls, cannot be intercepted, and burst on your click.',
  cannonAp: 'Cannon shells stop bursting. A shot pierces up to three hulls: 100/50/25%. Islands stop it.',
  torpedoHoming: 'Torpedoes slowly steer to the nearest enemy hull in range. Decoys are ignored.',
  mineSelfPropelled: 'Armed mines creep toward the nearest enemy hull in acquisition range.',
  minePropFouling:""",
      """const DOCTRINE_TEXT: Readonly<Record<string, string>> = {
  torpedoHoming: 'Torpedoes slowly steer to the nearest enemy hull in range.',
  mineCaptive: 'A mine no longer blasts on contact. It fires one torpedo at the first hostile in range.',
  buoyGun: 'Your buoy shoots at hostile hulls inside its radar circle: 5 damage every 5 seconds.',
  buoyJamming: 'Your buoy fills its radar circle with false returns on every scan but your own.',
  minePropFouling:""")

f.rep("""  acquireCannon: 'Fits a heavy cannon to your open slot, loaded. Its upgrade cards join your deck.',
  acquireDecoy: 'Fits a decoy buoy rack to your open slot, loaded. Its upgrade cards join your deck.',""",
      """  acquireBroadside: 'Fits a broadside battery to your open slot, loaded. Its upgrade cards join your deck.',
  acquireRadarBuoy: 'Fits a radar buoy rack to your open slot, loaded. Its upgrade cards join your deck.',""")

f.rep("""/**
 * Pure: the DOCTRINE-SWAP line for a card whose rival doctrine you already hold
 * (amendment 44 — picking it swaps for free, and the rival's card returns to the
 * deck), or null when there is nothing to replace. The rival is named at ITS
 * ladder position 0 (every doctrine is a 1-copy line, so that is its only name).
 */
export function boonReplacesLine(def: BoonDef, held: readonly string[]): string | null {
  const rival = def.exclusiveWith;
  if (rival === undefined || !held.includes(rival)) return null;
  return `REPLACES: ${boonName(rival)}`;
}

""",
      """// THE "REPLACES: <rival>" GRAMMAR IS DELETED (Story 7-5 wave 2, R2.6).
// `boonReplacesLine` existed to name the rival of an EXCLUSIVE pair, and the
// cannon's PLUNGING FIRE / ARMOR-PIERCING was the last pair in the game — wave 1
// had already turned every other doctrine into an independent stacking verb.
// With the cannon deleted, `BoonDef.exclusiveWith` leaves the type entirely, so
// there is nothing left for the line to describe. Removed with its pins rather
// than left as a function that can only ever return null.

""")
f.save()

# ============================ ui/upgradeMenu.ts ==============================
f = F('client/src/ui/upgradeMenu.ts')
f.rep("""  /** "REPLACES: <rival>" when the player holds this doctrine's rival, else null. */
  replaces: string | null;
""", "")
f.rep("""    lineage: boonLineageLine(def, stack),
    replaces: boonReplacesLine(def, you.boons),
    description: boonDescription(def, you),""",
      """    lineage: boonLineageLine(def, stack),
    description: boonDescription(def, you),""")
f.rep("""/** The doctrine-swap line ("REPLACES: ACOUSTIC HOMING") — same exclusive tier
 *  color as the rarity tag, because it is that tier's consequence. */
const REPLACES_CSS = [
  `font:400 ${R.raritySize}px var(--hc-font-mono)`,
  `letter-spacing:${T.replacesLetterSpacing}px`,
  `color:${EXCLUSIVE}`,
  TEXT_ROW,
].join(';');

""", "")
f.rep("""  return [card.id, card.rarity, card.name, card.lineage ?? '', card.replaces ?? '', card.description].join('~');""",
      """  return [card.id, card.rarity, card.name, card.lineage ?? '', card.description].join('~');""")
f.rep(""" *  of the pointer), and so does the lineage/replaces copy. */""",
      """ *  of the pointer), and so does the lineage copy. */""")
f.rep("""   * One card, top-down: the overhanging digit chip (PINNED as the card's FIRST
   * span — the digit-to-slot mapping is read off it), the category/rarity meta
   * row, the ladder name, the lineage handrail, the doctrine-swap line, and the
   * rules text. The three Story 2.8 lines are CONDITIONAL: a plain common
   * renders no rarity span, a single-copy line no lineage span, and a card whose
   * rival you do not hold no replaces span — an empty element would eat vertical
   * rhythm for information that isn't there.""",
      """   * One card, top-down: the overhanging digit chip (PINNED as the card's FIRST
   * span — the digit-to-slot mapping is read off it), the category/rarity meta
   * row, the ladder name, the lineage handrail, and the rules text. Two of the
   * Story 2.8 lines are CONDITIONAL: a plain common renders no rarity span and a
   * single-copy line no lineage span — an empty element would eat vertical
   * rhythm for information that isn't there. The doctrine-swap line is GONE with
   * the exclusivity mechanism (Story 7-5 wave 2, R2.6).""")
f.rep("""    if (card.lineage) body.appendChild(lineEl(LINEAGE_CSS, card.lineage));
    if (card.replaces) body.appendChild(lineEl(REPLACES_CSS, card.replaces));
""",
      """    if (card.lineage) body.appendChild(lineEl(LINEAGE_CSS, card.lineage));
""")
f.rep("""  boonReplacesLine,
""", "")
f.save()

# =========================== ui/refitCardFit.ts ==============================
f = F('client/src/ui/refitCardFit.ts')
f.rep("""  rarityLetterSpacing: 1,
  nameLetterSpacing: 1,
  lineageLetterSpacing: 2,
  replacesLetterSpacing: 1,
  descriptionLetterSpacing: 0,""",
      """  rarityLetterSpacing: 1,
  nameLetterSpacing: 1,
  lineageLetterSpacing: 2,
  descriptionLetterSpacing: 0,""")
f.rep("""  lineage: string | null;
  replaces: string | null;
  description: string;
}""",
      """  lineage: string | null;
  description: string;
}""")
f.rep("""  const replacesH = card.replaces ? rowHeight(card.replaces, R.raritySize, T.replacesLetterSpacing, innerW, T.lineHeight) : 0;
  const rows = 3 + (card.lineage ? 1 : 0) + (card.replaces ? 1 : 0); // meta + name + rules text always""",
      """  const rows = 3 + (card.lineage ? 1 : 0); // meta + name + rules text always""")
f.rep("""    lineageH +
    replacesH +
    descLines""", """    lineageH +
    descLines""")
f.save()

print('ok')
