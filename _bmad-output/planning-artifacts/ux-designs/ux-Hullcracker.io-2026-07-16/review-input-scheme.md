# Input-Scheme Review — Hullcracker.io UX run 2026-07-16

Adversarial review of the decided control scheme against the input fantasy ("left hand helms the ship, right hand fights it"), desktop keyboard+mouse only. Sources: EXPERIENCE.md (Interaction Primitives, Component Patterns, State Patterns, IA), DESIGN.md (key-glyph specs), .decision-log.md, .working/extract-current-ui.md, .working/extract-gdd.md.

## Overall verdict

The core split is sound — tap-telegraph W/S plus hold-rudder A/D on the left, mouse aim/fire on the right, Q/E/R/F within left-hand reach — and the set-and-forget telegraph quietly defuses most chording problems, because the most-pressed keys are never *held*. But the scheme has one shipping-blocking flaw the spec never mentions: **CTRL as a held game modifier makes CTRL+W (close tab) a designed steady state**, and CTRL+W cannot be intercepted by a web page in Chromium browsers — on the primary audience's platform (school Chromebooks) a player who taps W to adjust speed while browsing refit cards loses the tab and the match. The spec is silent on browser-shortcut interception entirely; until the refit modifier moves off CTRL (or an interception contract with a fullscreen/keyboard-lock story is written and its Firefox gap accepted), the scheme as decided is not shippable. Beyond that: two high-severity issues (no input-capture contract at all; hold-only modifier vs Sticky/Filter Keys users) and a set of medium holes in per-surface key maps that are fillable in one editing pass.

---

## 1. Physical ergonomics

Reference posture: standard QWERTY, left hand on WASD (ring→A, middle→W/S, index→D), pinky floats between Shift/CTRL/Q-column, thumb on Space (currently unused — see fix for 2.1).

**Honest verification of the feared combos:**

- **"Left-CTRL+number while W is held"** — this fear is largely defused *by the telegraph design itself*: W/S are tap-only, set-and-forget (EXPERIENCE.md line 103, "hold does not repeat"), so no real play state requires W to be physically down while CTRL is held. The scheme deserves credit here. The residual danger is behavioral, not ergonomic: players *will* tap W while CTRL is held (see 2.1).
- **"Press R while turning left"** — turning left = A held with ring finger; R with index. Fine.
- **"Press R (or F) while turning right"** — D and R/F are both index-finger keys. This is standard FPS ergonomics (reload-while-strafing-right); players roll the index or use the middle finger. Genre-normal, not a break.
- **"F while ahead-full"** — ahead-full is a latched telegraph state, not a held key. F is a plain index press. Fine.

### Finding 1.1 — Refit vacates the helm entirely — MEDIUM, needs developer call
**Location:** EXPERIENCE.md line 64 (Refit Card: "CTRL is HOLD… pick with 1/2/3/4 while CTRL is held"), line 101-102 (Interaction Primitives).
Holding CTRL (pinky, bottom-left) while reaching the number row (1 at top-left through 4) rotates the whole left hand off WASD. A/D release → rudder self-centers; the ship runs straight on its latched telegraph while the player shops. You cannot steer and refit simultaneously, at all. This may be *intended* — the log's stated philosophy is "opening mid-fight is the player's own risk" (settings entry, .decision-log.md 2026-07-16) — but the spec never states that steering-lockout-during-refit is a deliberate risk window rather than an oversight. **Fix:** state it explicitly in Component Patterns · Refit Card ("refit trades helm control for build progress — deliberate"), or, if simultaneous steer+refit is desired, the modifier must move to a thumb key (Space) so ring/middle stay on A/W/S. Needs developer call.

### Finding 1.2 — CTRL+4 stretch on small hands — LOW
**Location:** EXPERIENCE.md line 101 (1/2/3/4 refit picks).
Pinky anchored on Left-CTRL to index on `4` spans ~4 rows × 4 columns. Adult hands manage; the design-compass-welcome 10–15 Chromebook audience (extract-gdd.md §2) will find slot 4 measurably harder to pick than slot 1 — a subtle pick-rate bias toward low-numbered cards. **Fix:** none needed if the modifier moves to Space/Tab (2.1's fix collapses this finding); if CTRL stays, accept the bias or mirror card order so the strongest card position isn't systematically cheap/expensive to reach. Note offers are 4 cards (supersedes GDD's 3 — EXPERIENCE.md Open Question 2), so `4` is not an edge case; it's 25% of every offer.

### Finding 1.3 — D-column index overload — LOW (verified acceptable)
Pressing R/F while D is held is an index-finger conflict on paper but genre-standard in practice (every shooter ships it). No change needed. Logged so the review is honest rather than alarmist.

---

## 2. OS/browser collisions — the blocking section

**What the spec says:** nothing. Interaction Primitives (EXPERIENCE.md lines 96-111), Component Patterns, DESIGN.md, and the decision log contain **zero mention** of preventDefault, reserved browser shortcuts, fullscreen, the Keyboard Lock API, or context-menu suppression. For a scheme whose centerpiece is *holding CTRL as a game modifier while every combat key stays live* ("Non-blocking: the battle stays visible", EXPERIENCE.md line 64), this is not an edge-case omission — CTRL+letter chords are the designed steady state of the refit interaction.

### Finding 2.1 — CTRL+W closes the tab and cannot be intercepted — CRITICAL
**Location:** EXPERIENCE.md line 102 (CTRL hold), line 103 (W/S telegraph), line 64 (refit is non-blocking, game runs behind).
The exact sequence the design *teaches* — hold CTRL to browse cards while the battle continues, tap W to adjust speed — fires the browser's close-tab shortcut. `Ctrl+W` (with `Ctrl+T`, `Ctrl+N`, `Ctrl+Shift+W`) is a **reserved shortcut in Chrome/Edge/ChromeOS: `event.preventDefault()` does not block it** on a normal web page. Firefox's behavior varies by version/config; treat it as uninterceptible there too. The one platform where CTRL is harmless is macOS (browser chords use Cmd) — which is the dev machine, so this bug is invisible in local testing and fatal on the target platform (school Chromebooks, extract-gdd.md §2). S is safe (Ctrl+S is cancelable) but W alone is enough: mid-refit telegraph adjustment = match over, tab gone.

Mitigation paths, all needing a developer call:
1. **Move the refit modifier off CTRL (recommended).** Space is unused in the entire scheme (fire is mouse-only) and is the single best hold-modifier on the board: thumb holds it while ring/middle stay on A/W/S (also resolves 1.1 and 1.2), and Space+anything collides with no browser chord. Tab-hold is the runner-up (cancelable, but fights focus semantics). Keep CTRL available through remapping with a loud warning.
2. **Keep CTRL + require fullscreen + Keyboard Lock API** (`navigator.keyboard.lock()` captures Ctrl+W). Chromium-only and fullscreen-only — but the spec commits Firefox and Safari support (EXPERIENCE.md line 22), so this cannot be the whole answer; and keyboard lock also captures ESC (exit-fullscreen becomes hold-ESC), which collides with ESC-as-settings (line 107).
3. **Keep CTRL and suppress W-as-telegraph while CTRL is held** — insufficient: the *browser* still sees Ctrl+W regardless of what the game ignores.

Option 1 is the only one that fully closes the hole on the stated browser matrix. This is the review's blocking finding.

### Finding 2.2 — No browser-interception contract exists at all — HIGH
**Location:** EXPERIENCE.md · Interaction Primitives (whole table); absent from DESIGN.md and the decision log.
Even setting CTRL+W aside, the scheme uses CTRL+1/2/3/4 (browser: switch to tab N), and leaves CTRL+E (address-bar search), CTRL+R (reload), CTRL+F (find) reachable whenever a player presses a hotbar key with CTRL held (the game runs behind the refit window — pressing E/R/F mid-refit is legitimate play, and its game meaning is itself undefined, see 4.2). These are *generally* cancelable via `preventDefault` in current Chrome/Firefox, but preventability differs per browser/version and none of it is specced. The spec needs an explicit **Input Capture contract**: (a) a single keydown chokepoint that `preventDefault`s every bound key and every CTRL-chord the game can produce; (b) `contextmenu` suppression on the canvas (right-click is one misclick away from left-click-to-fire; currently unmentioned); (c) a per-browser verification checklist (Chrome/Edge/Firefox/Safari × Windows/ChromeOS/macOS) as an E2 acceptance criterion; (d) explicit statement of which chords are known-uninterceptible and how the design avoids them. **Fix:** add an "Input capture & browser collisions" subsection to Interaction Primitives; wire it into E2's "New keyboard controls" story (extract-gdd.md §8).

### Finding 2.3 — Hold-only modifier breaks Sticky Keys / Filter Keys users — HIGH
**Location:** EXPERIENCE.md line 64 and .decision-log.md ("CTRL is HOLD, never toggle") vs EXPERIENCE.md lines 121-125 (committed accessibility floor: "Key remapping — every binding").
Sticky Keys (Windows/ChromeOS accessibility feature) exists precisely for users who *cannot hold* a modifier while pressing another key — and it latches CTRL on a single press, which under this scheme would pop the refit window on a tap and then feed CTRL+W to the browser on the next telegraph adjustment. Filter Keys users have related timing problems with hold semantics. "HOLD, never toggle" is stated as a design absolute, but the committed accessibility floor cannot be met while the *interaction class itself* (hold) is unremappable — remapping which physical key is the modifier doesn't help someone who can't hold any key. **Fix:** keep hold as the default (it's the right default — release-to-close is elegant), but add a settings option "refit window: hold / toggle" under the committed motion-and-remapping options. This is an accessibility-floor completion, not a design reversal; the decision-log absolute needs a scope note ("hold is the default interaction; toggle exists as an accessibility option").

---

## 3. Mode completeness — per-surface key/mouse map

Surfaces from the IA table (EXPERIENCE.md lines 32-45), audited against Interaction Primitives. Live play is fully defined; the chrome surfaces leak.

### Finding 3.1 — Results modal has no keyboard map — MEDIUM
**Location:** EXPERIENCE.md line 43 (Results modal row), line 92 (Match lifecycle).
"Death costs one click to re-queue" — but which click, and is there a key? Enter-to-requeue would honor both the "Frantic to Play" pillar and the home-surface precedent (Enter = SET SAIL, line 109). ESC on the results modal: close? leave? nothing? Undefined. **Fix:** spec `Enter = re-queue (primary)`, `ESC = leave to port` on the results modal; add to Interaction Primitives.

### Finding 3.2 — Sinking window and omniscient reveal input maps undefined — MEDIUM
**Location:** EXPERIENCE.md lines 42, 160 (Death ritardando), line 43 (spectate superseded).
During the ~5s sinking window "guns stay live" — derivably the full combat map, but is the telegraph/rudder live too (the hull "slows to a stop" regardless)? During the omniscient reveal: is there ANY input — camera pan/zoom (the old spectate had WASD-pan + wheel-zoom, extract-current-ui.md §1), a skip-to-results key, or a fixed-duration cinematic? The current follow-killer spectate is superseded, and nothing replaced its input story. **Fix:** one State Patterns row: sinking = combat inputs live / helm inputs accepted-but-decaying; reveal = no inputs except `Enter/click = proceed to results` (or state it is fixed-duration).

### Finding 3.3 — Class-select layer keyboard map undefined, but the mock shows key glyphs — MEDIUM
**Location:** DESIGN.md line 224 (Class Card anatomy: "class name (21px/700) **+ key**"); EXPERIENCE.md line 35 (layer locked as rendered).
The ratified card anatomy includes a key glyph, but no binding exists in Interaction Primitives for picking a class by key, opening the layer (keyboard path to the Class Chip?), closing it (ESC? click-outside?), or moving along the horizontal scroll rail (wheel? arrows?) — which matters more as the rail scales past 4 classes. A rendered key glyph with no defined key is a spec contradiction. **Fix:** define: layer opens via chip click (mouse-only acceptable), `1–4`/arrow keys highlight cards, `Enter` picks, `ESC` closes without change; or delete the key glyph from the card anatomy.

### Finding 3.4 — ESC needs a stack rule — MEDIUM
**Location:** EXPERIENCE.md line 107 (ESC = settings overlay), line 69 ("Modals never stack").
ESC opens settings in-match — but what does ESC do on home (nothing? settings?), in the class layer (3.3), with the refit window held open, on the results modal (3.1), and *inside* the settings overlay (close, presumably)? Five surfaces, one key, no precedence rule. **Fix:** one line in Interaction Primitives: "ESC closes the topmost open surface; if none is open (home or live), ESC opens settings." Also state the CTRL-refit + ESC interaction (settings opens over the battle; refit closes on CTRL release regardless).

### Finding 3.5 — Rebind capture inside a non-pausing overlay — MEDIUM
**Location:** EXPERIENCE.md line 37 (settings is non-pausing, "opening mid-fight is the player's own risk"), line 124 (remapping committed).
Remapping listens for an arbitrary keypress while the game — by explicit design — keeps running underneath. Pressing your candidate key steers/fires the live ship; conversely the game must not react to the capture press. The spec must state that while the settings overlay has focus, game input is suppressed (the ship coasts on latched telegraph, rudder centers — consistent with 1.1's risk-window philosophy), even though the *simulation* never pauses. Also: what does the callsign input on home do to key handling (typing "wasd" as a name must not fire handlers — a real current-code bug class, extract-current-ui.md §2)? **Fix:** add "DOM overlay with focus = keyboard suppressed from sim; sim never pauses" to State Patterns; note text-input focus guards.

### Finding 3.6 — Fate of `P` (prediction debug) undecided; wheel in live play unspecified — LOW
**Location:** extract-current-ui.md §2 (P toggle, wheel zoom in spectate); EXPERIENCE.md line 108 keeps only M as a carry-over.
The primitives table carries M forward explicitly but is silent on P — is it removed, kept as a hidden debug, or shipping to strangers in a public beta? Similarly, mouse wheel has a defined role only in the superseded spectate; live-play wheel is undefined (presumably nothing — say so, or players will expect zoom). **Fix:** one line each: "P: dev-build only, stripped from production" (or equivalent); "Wheel: no function in live play."

### Finding 3.7 — How-to-Play and disconnect surfaces — LOW
How-to-Play page navigation (back link / ESC) and the disconnect-banner → home path (any-key? automatic?) have no input notes. Derivable, but the IA table should say "standard page chrome, ESC/back returns home" for completeness.

---

## 4. Consistency & collisions within the scheme

### Finding 4.1 — 1–4 dual role: CTRL-release race — MEDIUM
**Location:** EXPERIENCE.md line 101 ("1/2/3/4 — refit card pick while CTRL is held; consumables when/if that system ships").
When consumables exist, the same keys mean "spend a banked level" (CTRL held) and "burn a consumable" (CTRL up). A player releasing CTRL a few frames before the number lands — trivially common under adrenaline — fires the *wrong action*, and both actions are irreversible spends. With 150ms latency tolerance and server-authoritative spends, "held" must be defined at a precise instant. **Fix:** spec the rule now, before consumables ship: the number key's meaning is evaluated at its own keydown against CTRL's state *at that keydown* (atomic client-side sample), plus a grace window (~150–200ms after CTRL release, number keys still resolve as refit picks and never as consumables — misfiring *nothing* beats misfiring the wrong thing). Also explicitly kill the current-code behavior where CTRL+1/2/3 spends with the window closed (extract-current-ui.md §2) — under the new scheme a spend without the cards visible is a misfire by definition.

### Finding 4.2 — Q/E/R/F pressed while CTRL is held: game meaning undefined — MEDIUM
**Location:** EXPERIENCE.md lines 100-102; line 64 (refit non-blocking).
The refit window is explicitly non-blocking — fighting while it's open is designed-for. So what does E do with CTRL down: activates the special (combat continues), nothing (refit swallows all keys but 1-4), or worse, whatever the browser decides (2.2)? Undefined. Recommended: while CTRL is held, Q/E/R/F retain their combat meanings (consistent with "battle stays visible" — the window is a lens, not a mode), with every chord preventDefault'ed per 2.2. If instead refit swallows them, the "non-blocking" claim needs a caveat. **Fix:** one sentence in Component Patterns · Refit Card; needs developer call between the two readings.

### Finding 4.3 — Pressing a cooling ability / empty offer slot: denied rule not explicit — LOW
**Location:** EXPERIENCE.md lines 74-84 (State Patterns table — Denied row: "Fire attempt while invalid").
"Never silence" is the right law, but the Denied trigger reads as *fire* attempts. Pressing R while that ability cools, or F while the offer slot is still "— awaiting refit —", should explicitly route to the same 80ms denied pulse on that slot. Derivable, one word away from airtight. **Fix:** widen the trigger to "Fire or activation attempt while invalid (cooling, no ammo, empty slot, weapons-safe)". Note weapons-safe waiting room: pressing keys there should also give the denied pulse (currently weapons "fire, damage suppressed" — line 38 — which is its own answer; fine, but the two statements should agree).

### Finding 4.4 — Rebind scope: is the modifier itself remappable, and against what conflict set? — MEDIUM, needs developer call
**Location:** EXPERIENCE.md line 111 ("All bindings remappable"), line 124 ("every binding, conflict-detected").
"All bindings" presumably includes CTRL-as-modifier — but modifier-as-hold remapping has hazards ordinary key remaps don't: remap to Shift and Shift+1..4 produce symbol keycodes (`!@#$` — the handler must match on `code` not `key`, an implementation note worth speccing); remap to Alt and Alt+F opens the browser/OS menu bar on Windows/Firefox — a whole second family of finding-2.1s that "conflict detection" must cover. The spec's conflict detection reads as *internal* (two actions on one key); it must also validate against a **reserved-chord blacklist** (browser/OS shortcuts per platform). **Fix:** spec the rebind rules: modifier is remappable to a whitelist of safe hold-keys (Space, Tab, Shift, CapsLock, mouse buttons 4/5); blacklist Alt and the Meta/Cmd key; conflict detection covers the reserved-chord table from 2.2.

### Finding 4.5 — Two "1–4" glyph systems on screen at once — LOW
**Location:** DESIGN.md line 217 (Refit Card key chip), line 213 (hotbar key glyphs Q/E/R/F).
When refit is open, the screen shows Q/E/R/F glyphs (hotbar, dimmed to 38%) and 1/2/3/4 chips (cards) simultaneously. The dimming plus distinct chip anatomy probably carries it, but the glyph styles should be visibly the same family so "keys look like this" reads as one system. Cosmetic; flag for the HUD-legibility lens.

---

## 5. Discoverability (no coach marks: How-to-Play page + Solo-vs-AI only)

What the spec already does well: hotbar slots carry mono key glyphs beside each square (DESIGN.md line 213); refit cards carry overhanging key chips (line 217); the banked chip's cue line literally says "HOLD CTRL TO REFIT" (line 215) — hold-not-toggle is taught by copy at the exact moment it matters; the empty slot self-describes ("— awaiting refit —"); denied-input-is-never-silence teaches arcs and cooldowns through failure. This is a genuinely strong glyph story for slots and refit.

### Finding 5.1 — The telegraph teaches by feel, but nothing points at W/S/A/D — MEDIUM
**Location:** EXPERIENCE.md line 172 (Journey A beat 2: "he wiggles W/S and A/D and learns the telegraph is set-and-forget before the countdown ends"); DESIGN.md line 220 (Telegraph Cluster anatomy — no key glyphs).
Marco's journey beat is load-bearing on him *spontaneously* pressing WASD — a fair genre bet — but the failure mode is specific and nasty: a newcomer **holds W** (every other game's forward key), gets exactly +1 detent (hold does not repeat, line 103), concludes the ship is agonizingly slow, and churns before ever seeing FULL AHEAD. The telegraph ladder moves when he taps, which is good feedback — but nothing on screen connects the ladder to W/S or the rudder track to A/D. The hotbar got key glyphs; the helm — the entire left hand of the input fantasy — got none. **Fix:** add W/S glyphs at the telegraph ladder's ends and A/D glyphs at the rudder track's extremes, visible during the weapons-safe waiting room and fading permanently after the first few successful inputs (this is a component-anatomy addition, not a coach mark, so it respects the no-coach-marks decision). Alternatively one waiting-room hint line under "WEAPONS SAFE": "W/S ENGINE ORDERS · A/D RUDDER" in the existing register.

### Finding 5.2 — First press of an ability activates it — LOW (accept)
**Location:** EXPERIENCE.md line 59 (weapons switch-to, abilities activate).
A newcomer pressing E "to select" his special activates it and burns the cooldown. The chamfer marks abilities, but shape grammar is learned, not innate, and tooltips require hover — nobody hovers mid-fight. This is the LoL/Hades norm and the Activated-flash + cooldown ring immediately teach what happened; acceptable cost. Solo-vs-AI is the sanctioned place to burn exploratory cooldowns. No change; logged as a conscious accept.

### Finding 5.3 — M and ESC are invisible — LOW
Mute and settings have no on-screen affordance in-match (gear exists on home only). Fine for M (How-to-Play material), but at least the settings overlay should list all current bindings — which it must anyway, since it hosts remapping (line 124). Make "the settings overlay doubles as the in-match key reference" an explicit line; it is the scheme's only in-match self-documentation.

---

## Severity summary

| # | Finding | Severity |
|---|---|---|
| 2.1 | CTRL+W closes the tab; uninterceptible; designed steady state; spec silent | **Critical** |
| 2.2 | No browser-shortcut interception contract (CTRL+1-4/E/R/F, contextmenu, per-browser matrix) | **High** |
| 2.3 | Hold-only modifier vs Sticky/Filter Keys; conflicts committed accessibility floor | **High** |
| 1.1 | Refit vacates the helm — deliberate risk window or oversight? (needs developer call) | Medium |
| 3.1 | Results modal keyboard map undefined (Enter-requeue, ESC) | Medium |
| 3.2 | Sinking window / omniscient reveal input maps undefined | Medium |
| 3.3 | Class layer keys undefined though card mock renders a key glyph | Medium |
| 3.4 | ESC precedence across five surfaces unspecified | Medium |
| 3.5 | Rebind capture + text inputs inside a non-pausing game | Medium |
| 4.1 | 1–4 dual role: CTRL-release race between refit pick and future consumable | Medium |
| 4.2 | Q/E/R/F meaning while CTRL held undefined (needs developer call) | Medium |
| 4.4 | Modifier remap semantics + reserved-chord blacklist unspecced (needs developer call) | Medium |
| 5.1 | No W/S/A/D glyphs anywhere; hold-W misconception threatens Journey A beat 2 | Medium |
| 1.2 | CTRL+4 stretch biases small hands against card slot 4 | Low |
| 1.3 | D+R/F index overload — verified genre-normal, accept | Low |
| 3.6 | P debug-toggle fate + live-play wheel undefined | Low |
| 3.7 | How-to-Play / disconnect surface inputs underspecified | Low |
| 4.3 | Denied rule not explicit for cooling-ability / empty-slot presses | Low |
| 4.5 | Two key-glyph systems (Q/E/R/F + 1–4) co-visible during refit | Low |
| 5.2 | Ability activates on exploratory first press — conscious accept | Low |
| 5.3 | Settings overlay should be the in-match binding reference | Low |

**Counts:** 1 critical · 2 high · 10 medium · 8 low.

**Needs developer call:** 2.1 (which mitigation — recommend moving modifier to Space), 1.1 (is steering-lockout-during-refit intended), 4.2 (do combat keys stay live under the modifier), 4.4 (modifier remap whitelist/blacklist).
