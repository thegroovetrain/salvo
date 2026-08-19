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


f = F('client/src/main.ts')
f.rep("  type DecoyView,", "  type BuoyView,")
f.rep(""" * (prediction-aware) `boostUntil` estimate the HUD's boost tag does; the decoy
 * reads the latched own-buoy expiry. Everything else has no window.""",
      """ * (prediction-aware) `boostUntil` estimate the HUD's boost tag does; the buoy
 * reads the latched own-buoy expiry. Everything else has no window.""")
f.rep("""  const until = { speedBoost: boostUntilNow(g), decoyBuoy: g.ownDecoyUntil };
  return status.loadout.map((id) => (id === 'speedBoost' || id === 'decoyBuoy' ? Math.max(0, until[id] - now) : 0));""",
      """  const until = { speedBoost: boostUntilNow(g), radarBuoy: g.ownDecoyUntil };
  return status.loadout.map((id) => (id === 'speedBoost' || id === 'radarBuoy' ? Math.max(0, until[id] - now) : 0));""")
f.rep("  g.projectiles.setOwnModes({ cannon: stats.cannon.mode, torpedoHoming: stats.torpedo.homing });",
      "  g.projectiles.setOwnModes({ torpedoHoming: stats.torpedo.homing });")
f.rep(""" * as our cannon shot. An unclaimed reveal reads generic, the honest fallback.""",
      """ * as our own barrage. An unclaimed reveal reads generic, the honest fallback.""")
f.rep(""" * The acquisition ring is present only under the SELF-PROPELLED doctrine, and
 * its radius is raw CONFIG on purpose — no boon scales acquisition today.
 */
function ownMineRingParams(g: Game, t: number): OwnMineRings {
  const mine = g.ownStats.mine;
  return {
    blast: mine.blastRadius,
    trigger: mine.triggerRadius,
    acquire: mine.selfPropelled ? CONFIG.mine.creepAcquireRange : null,
    now: t,
  };
}""",
      """ * The acquisition ring is UNFED as of Story 7-5 wave 2: SELF-PROPELLED MINES —
 * the flag that was its only source — is deleted with its card (R2.6), and
 * CAPTIVE MINES, the card that replaces it, is a LATER SLICE of this story. The
 * ring channel is left in place rather than torn out because that slice is the
 * one that decides whether a captive mine draws one; nothing may re-derive it
 * from a stat here in the meantime.
 */
function ownMineRingParams(g: Game, t: number): OwnMineRings {
  const mine = g.ownStats.mine;
  return {
    blast: mine.blastRadius,
    trigger: mine.triggerRadius,
    acquire: null,
    now: t,
  };
}""")
f.rep("""function onOwnDecoy(g: Game | null, audio: Audio, d: DecoyView): void {""",
      """function onOwnDecoy(g: Game | null, audio: Audio, d: BuoyView): void {""")
f.rep(""" *    own-spawn hook (fired on the confirmed OWN buoy, gated by DecoyView `own`""",
      """ *    own-spawn hook (fired on the confirmed OWN buoy, gated by BuoyView `own`""")
f.save()

f = F('client/src/render/decoys.ts')
f.rep("DecoyView", "BuoyView")
f.save()
print('ok')
