def cut(s, a, b, repl=""):
    i = s.index(a)
    j = s.index(b, i) + len(b)
    return s[:i] + repl + s[j:]


p = 'server/src/__tests__/botTactics.test.ts'
s = open(p).read()

s = s.replace("litZones: [], decoys: [] };", "litZones: [] };")

s = s.replace(
    "    // A 45-second cannon reload is not spent on a plot that cannot be led.\n"
    "    expect(blind.fireSlot).toBe(slotOf(rec, 'gun'));\n"
    "    expect(COMBAT_BRAIN.decide(rec, led, port).fireSlot).toBe(slotOf(rec, 'cannon'));",
    "    // A 30-second BROADSIDE reload is not spent on a plot that cannot be led.\n"
    "    // (The target is due north of a bow-east hull, so it is ABEAM — inside\n"
    "    // the barrage's beam sector, which is what makes it a candidate at all.)\n"
    "    expect(blind.fireSlot).toBe(slotOf(rec, 'gun'));\n"
    "    expect(COMBAT_BRAIN.decide(rec, led, port).fireSlot).toBe(slotOf(rec, 'broadside'));",
)
s = s.replace("    // Inside the scoring horizon (1.25R) but outside gun/cannon range (R).", "    // Inside the scoring horizon (1.25R) but outside gun range (R) — and the\n    // broadside's 5/8 reach is shorter still.")

s = cut(
    s,
    "  it('abilities ride the act channel: a raider boosts out, a trapper drops a decoy', () => {",
    "    expect(COMBAT_BRAIN.decide(healthy, raider, port).actSlot).toBeNull();\n  });\n",
    "  it('abilities ride the act channel: a raider boosts out', () => {\n"
    "    // The TRAPPER's decoy-drop half is RETIRED (Story 7-5 wave 2): the decoy\n"
    "    // buoy is deleted and the RADAR BUOY replacing it is a click-placed WEAPON\n"
    "    // (R2.7), not an actSeq ability — so the boost is the only ability any\n"
    "    // profile presses, and `usesDecoy` left BotProfile with its consumer.\n"
    "    const w = openWorld(208);\n"
    "    const port = fakePort(w);\n"
    "    const tb = mkBot(w, 'torpedoBoat', 0, 0, 0);\n"
    "    tb.hp = tb.stats.maxHp * 0.1; // below raider's 0.5 -> disengage\n"
    "    const raider = mkMind('raider');\n"
    "    plot(raider, track(port.now, { x: 200, y: 0, speed: 0 }));\n"
    "    expect(COMBAT_BRAIN.decide(tb, raider, port).actSlot).toBe(slotOf(tb, 'speedBoost'));\n"
    "    // A withdrawing MINE LAYER presses nothing — it has no ability fitted.\n"
    "    const ml = mkBot(w, 'mineLayer', 0, 0, 0);\n"
    "    ml.hp = ml.stats.maxHp * 0.1;\n"
    "    const trapper = mkMind('trapper');\n"
    "    plot(trapper, track(port.now, { x: 200, y: 0, speed: 0 }));\n"
    "    expect(COMBAT_BRAIN.decide(ml, trapper, port).actSlot).toBeNull();\n"
    "    // Healthy: no ability spent.\n"
    "    const healthy = mkBot(w, 'torpedoBoat', 0, 0, 0);\n"
    "    expect(COMBAT_BRAIN.decide(healthy, raider, port).actSlot).toBeNull();\n  });\n",
)

s = cut(
    s,
    "  it('the CANNON is not spent on a plot that has gone dark (the `live` gate is a real gate)', () => {",
    "    expect(COMBAT_BRAIN.decide(rec, lost, port).fireSlot).toBe(slotOf(rec, 'gun'));\n  });\n",
    "  it('the BROADSIDE is not spent on a plot that has gone dark (the `live` gate is a real gate)', () => {\n"
    "    // F2: `live` now means SIGHTED THIS TICK. A plot with a disclosed course\n"
    "    // that is no longer in the bubble is a gun target, never a 30s reload.\n"
    "    // The plot sits ABEAM (due north of a bow-east hull) so the beam arc is\n"
    "    // satisfied and `live` is the only thing under test.\n"
    "    const w = openWorld(210);\n"
    "    const port = fakePort(w);\n"
    "    const rec = mkBot(w, 'battleship', 0, 0, 0);\n"
    "    const seen = mkMind('bulwark');\n"
    "    plot(seen, track(port.now, { x: 0, y: 400, heading: 0, speed: 20, live: true }));\n"
    "    expect(COMBAT_BRAIN.decide(rec, seen, port).fireSlot).toBe(slotOf(rec, 'broadside'));\n"
    "    const lost = mkMind('bulwark');\n"
    "    plot(lost, track(port.now, { x: 0, y: 400, heading: 0, speed: 20, live: false }));\n"
    "    expect(COMBAT_BRAIN.decide(rec, lost, port).fireSlot).toBe(slotOf(rec, 'gun'));\n  });\n\n"
    "  it('the BROADSIDE is refused OUT OF ARC: the same plot dead ahead falls through to the gun', () => {\n"
    "    // R2.1/R2.2: the bot tests the twin-sector arc exactly as the equipment\n"
    "    // row does, so it never burns a click on a bow/stern dead-zone target.\n"
    "    const w = openWorld(211);\n"
    "    const port = fakePort(w);\n"
    "    const rec = mkBot(w, 'battleship', 0, 0, 0); // bow due east\n"
    "    const ahead = mkMind('bulwark');\n"
    "    plot(ahead, track(port.now, { x: 300, y: 0, heading: 0, speed: 20, live: true }));\n"
    "    expect(COMBAT_BRAIN.decide(rec, ahead, port).fireSlot).toBe(slotOf(rec, 'gun'));\n  });\n",
)

s = cut(
    s,
    "  it('PLUNGING FIRE IS EXEMPT: an arcing cannon still shoots over the headland', () => {",
    "    expect(COMBAT_BRAIN.decide(rec, mind, port).fireSlot).toBe(slotOf(rec, 'cannon'));\n  });\n",
    "  // RETIRED (Story 7-5 wave 2): \"PLUNGING FIRE IS EXEMPT\". The doctrine, the\n"
    "  // cannon and `ShellState.arcing` are all deleted — NO shot in the game\n"
    "  // overflies terrain any more, so the exemption branch it pinned is gone\n"
    "  // from `burstShot` too. The general rule it was the exception to (a bot\n"
    "  // never fires into rock, cycle 99) is pinned by the surrounding cases.\n",
)
open(p, 'w').write(s)
print('ok')
