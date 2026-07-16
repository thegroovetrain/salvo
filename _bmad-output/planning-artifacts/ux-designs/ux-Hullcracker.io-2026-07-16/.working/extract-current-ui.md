# Current UI Inventory — Hullcracker.io (RT prototype)

Faithful inventory of what exists in `client/src/` as of 2026-07-16 (worktree `gds-ux-hullcracker`, main @506af8e). Facts only; no proposals. Paths relative to `client/src/` unless noted.

## 1. Screen/surface inventory (by lifecycle phase)

### Pre-join: MENU
- **Main menu overlay** — DOM, `ui/menu.ts`. Fullscreen black overlay (z-index 1100) over the already-created Pixi canvas. Contains: "HULLCRACKER" title (Geist 700 56px, phosphor green #00FF88, `ui/menu.ts:108`), "RT PROTOTYPE // v{version}" subtitle, CALLSIGN text input (persists to localStorage `hullcracker.name`), 3-button class picker (DESTROYER "FAST · LIGHT" / CRUISER "BALANCED" / BATTLESHIP "SLOW · HEAVY", amber = selected, persists to `hullcracker.class`, `ui/menu.ts:142-176`), amber PLAY button, status line ("CONNECTING..." / "CONNECTION FAILED — IS THE SERVER RUNNING ON :2567?", `main.ts:872-880`).
- **Net banner** — DOM, `util/banner.ts`. Top-center fixed pill (z-index 1000): "DISCONNECTED" (red, `main.ts:376`), "NETCODE: PREDICT/INTERP" (`main.ts:150`), "MUTED"/"UNMUTED" (`main.ts:861`).

### Waiting / countdown (in-game, weapons safe)
All Pixi Text in `hudRoot` via `render/hud.ts` `drawMatch()` (hud.ts:307-326), strings from `ui/phase.ts` `matchUx()`:
- Top-center line: "AWAITING CAPTAINS n/2" (green 22px) + tag "WEAPONS SAFE" (dim 16px).
- Countdown: "MATCH STARTING" + big center number (green 112px, at 35% screen height).
- The full live HUD (below) is already visible; weapons fire but damage is suppressed server-side.

### Live play (all Pixi unless noted)
World/chart (camera-transformed):
- **Ocean disc + boundary + 4 chart range rings + islands** — `render/map.ts` (drawn once at join; islands dark-yellow fill 0x2A2410 / stroke 0x8B7520).
- **Own ship** — filled green chevron, `render/ships.ts` (`OWN_STYLE` 0x00FF88, 30% fill + 1.5px stroke, ships.ts:26,74-82).
- **Contacts** — hollow amber chevrons (`CONTACT_STYLE` 0xFFB800), 150ms sight fade in/out (`render/contacts.ts`, `render/fade.ts`), true per-class hull dims.
- **Fog of war** — screen-space pre-baked texture, dark fill `rgba(2,10,6,0.85)` with feathered sight hole tracking own ship (`render/fog.ts`, `render/textures.ts:28`). Rebaked on resize/zoom/sight-upgrade (debounced 150ms, main.ts:789).
- **Radar sweep + phosphor blips** — chartRoot (fog-immune): rotating conic wedge (#00FF88, additive, textures.ts:65), pooled blips decaying 1→0 over one sweep period, tint bright 0x66FFAA → dark 0x0A3D20 (`render/radar.ts`, `render/phosphor.ts`). Own-centered range rings at sightRange (green a=0.12) and radarRange (silver a=0.07) (radar.ts:38-39,96-97).
- **Storm zone** — `render/zone.ts`: green safe ring (0x00FF88 a=0.7), 70u purple storm annulus (0x7B2FBE a=0.11), dashed purple target ring at final radius; plus screen-space purple vignette pulsing at 1.1Hz while in storm.
- **Firing UX** — `render/firing.ts`: gun broadside arc sectors (amber when bearing+ammo, dim otherwise; reload sweep-back wedge), torpedo bow arc (cool green 0x3FBF8F), mine astern drop marker; crosshair reticle + bearing line in fog-immune `aim` layer; gun range-clamp splash marker beyond max range (firing.ts:178-194). All flash red 0xFF3B3B on denied-fire pulse.
- **Projectiles** — dead-reckoned shells (warm 0xFFE08A/0xFFB800) and fatter cool torps (0xCFE8DD/0x3FBF8F) with wake trail (`render/projectiles.ts:38-42`).
- **Mines** — own = dim green 0x2F7D5A in fog-immune chart layer; enemy = amber ring in fogged world layer (`render/mines.ts:17-18`).
- **Wake trail** — green dots behind own hull, speed-scaled (`render/effects.ts`, config.ts:25-39).

HUD (screen space, `render/hud.ts`, all Geist Mono Pixi Text; scaled ~1.6x after 2026-07-13 "everything tiny" play test, hud.ts:28):
- **Bottom-left instrument panel**: HDG/KTS readouts (28px green), 9-detent engine-order telegraph ladder (FULL/¾/½/¼/STOP labels, green ordered-rung marker, amber actual-speed needle, AHEAD/ASTERN captions, hud.ts:36-53,366-414), rudder gauge (hud.ts:406-414).
- **Bottom-right**: HP bar 240x16 (green >60% / amber >30% / crimson, hud.ts:201-206), three weapon chips "1 GUNS / 2 TORP / 3 MINE" with segmented ammo pools + amber reload sweep line; selected chip amber outline, denied-flash red (hud.ts:436-510); amber "PTS ×N — CTRL" prompt above chips when points banked (hud.ts:138-141,336-347).
- **Top-center**: storm readout "STORM 0:32 / STORM CLOSING / STORM CLOSED" (purple 0xB06EE8, 20px); match phase lines. "IN STORM" warning sits above the telegraph panel (hud.ts:349-359).
- **Center**: "SUNK — RESPAWNING IN {n}s" overlay (amber 38px) while dead-in-waiting (hud.ts:525-538).

DOM overlays during live play:
- **Kill feed** — top-right, max 5 lines, 6s TTL, amber 14px Geist Mono: "X SUNK BY Y" / "X LOST WITH ALL HANDS" (`ui/killFeed.ts`).
- **Upgrade toasts** — top-center below zone line (top:72px), max 3 lines, 3s TTL, green 16px: "▲ UPGRADE POINT — CTRL TO SPEND", "⬆ +GUN AMMO", "⛨ HULL REPAIRED +25" (`ui/upgradeToast.ts`).
- **Upgrade spend window** — CTRL-toggled fixed panel at top:30% center, 340px, green border, z-index 1000 (`ui/upgradeMenu.ts`). Title "SPEND UPGRADE POINT — n BANKED"; 3 offer rows "CTRL+1 · GUNNERY — +GUN AMMO" + heal row "CTRL+E · REPAIR HULL +{hp} HP". Non-blocking (game runs behind it); rows dim while a spend is in flight (spend latch, main.ts:90-98,205-244).

### Death → spectate
- One-time visual switch (`main.ts:700-715`): fog hidden, blips cleared, own hull/arcs hidden, spend window closed, throttle reset.
- **Spectate banner** — Pixi, amber 28px at 16% screen height: "SUNK — SPECTATING" / "VICTORY — AWAITING RESULTS" / "MATCH OVER — SPECTATING" (`ui/phase.ts:59-62`, hud.ts:571-583). Instruments hidden; zone/match lines remain.
- Camera: follow-your-killer default, WASD engages free pan, wheel zooms out 0.5x-1x (`render/spectate.ts`, main.ts:717-731,844-854).

### Results → return
- **Results overlay** — DOM, `ui/results.ts`. Fullscreen dim (rgba(0,0,0,0.88), z-index 1000), green-bordered panel: banner "VICTORY" (green) or "WINNER: name" (amber, Geist 700 32px), placement table (# / CAPTAIN / KILLS / DMG) with own row highlighted green, amber "RETURN TO PORT" button.
- **Return to port** — full `location.reload()` (main.ts:358-365); disconnect shows "DISCONNECTED" banner then reloads after 3s (main.ts:63,367-378).

## 2. Input scheme today

| Binding | Action | File |
|---|---|---|
| W/S, Up/Down (tap) | Telegraph engine order ±1 detent of 9 (edge-only; hold does NOT repeat) | `input/telegraph.ts:16-18,40-45`, `input/keyboard.ts:174-182` |
| A/D, Left/Right (hold) | Rudder -1..+1 | `input/keyboard.ts:30-31,83-88` |
| 1/2/3 (+ numpad) | Select weapon gun/torp/mine (latched) | `input/keyboard.ts:34-41` |
| Mouse move | Aim (world bearing + distance from own ship) | `input/mouse.ts` |
| Left click | Fire one shot (cumulative click counter → fireSeq; no held fire) | `input/mouse.ts:40-42` |
| CTRL (bare, on keyUp, chord-suppressed) | Toggle upgrade spend window | `input/keyboard.ts:152-163` |
| CTRL+1/2/3 | Spend point on offer slot (works with window closed) | `input/keyboard.ts:56-76` |
| CTRL+E | Spend point on hull repair | `input/keyboard.ts:71-74` |
| P | Toggle prediction ⇄ interpolation (debug; shows banner) | `main.ts:894` |
| M | Toggle master mute (persists, banner) | `main.ts:858-862,895` |
| WASD (spectate) | Free-pan camera (any press latches free-pan permanently) | `render/spectate.ts:39-41` |
| Wheel (spectate only) | Zoom out, clamped [0.5, 1] | `main.ts:844-854`, `render/spectate.ts:25-28` |
| Enter (menu) | Same as PLAY | `ui/menu.ts:220-222` |
| Tab-hide / window blur | Auto-neutral rudder (throttle order kept) | `main.ts:830-842` |

No key remapping, no touch/mobile input, no gamepad. No in-game help/legend surface listing these bindings.

## 3. Visual values in code (no central design tokens in client)

`CLIENT_CONFIG` (`config.ts`) holds only camera feel, wake (incl. color 0x00ff88), ship flashMs/sunkTint 0x8b0000, net delays. **Every other visual decision is a per-file constant.** DESIGN.md exists at repo root but describes the previous hex-grid game ("simultaneous-turn … hex grid"); client files cite it in comments while hardcoding values.

Hex-color usage across client src (grep, tests excluded): 23 distinct colors, 83 occurrences.
- `0xFFB800`/#FFB800 amber: 15 occurrences in **10 files** (menu, killFeed, upgradeMenu, results, hud, ships, firing, mines, effects, projectiles)
- `0x00FF88`/#00FF88 phosphor green: 14 occurrences in **11 files** (config, menu, results, upgradeMenu, upgradeToast, banner, textures, zone, hud, ships, radar)
- `0x5A6478`/#5A6478 dim slate: 11 occurrences in 5 files (menu, results, upgradeMenu, hud, firing)
- `#111111` panel fill: 9 occurrences in 4 files (menu, results, upgradeMenu, hud)
- `0x7B2FBE` storm purple: 6 (zone, textures) + brightened variant `0xB06EE8` defined only in hud.ts:27
- Denied red is **two different values**: `0xFF3B3B` (hud.ts:23, firing.ts:23) vs `#FF3B30` (menu.ts:231, banner.ts:39)
- Long tail of one-offs: 0x66FFAA (blip bright AND splash ring), 0x0A3D20, 0xFFE08A, 0x3FBF8F, 0xCFE8DD, 0x9FD8C4, 0x2F7D5A, 0x2A2410, 0x8B7520, 0xC0C0C0, 0x010604, 0x8B0000.

Fonts: Geist + Geist Mono loaded from Google Fonts CDN (`client/index.html:9`). Pixi Text styles: ~14 separate hand-built style objects in hud.ts alone (sizes 12,13,14,16,19,20,22,28,38,112). DOM `font:` shorthand strings repeated per element in menu/results/killFeed/upgradeToast/upgradeMenu/banner (sizes 10,13,14,16,32,56). Sizes, letter-spacings, paddings, z-indices (900/1000/1000/1100) all inline.

## 4. Ship-class presentation

- **Same silhouette for all three classes**: one chevron/capsule outline traced proportionally from hull length/beam (`render/ships.ts:36-48` — "every class keeps the same silhouette"). Destroyer/Cruiser/Battleship differ visually ONLY by scale (hull dims from shared CONFIG).
- Own = filled green, contacts = hollow amber; no per-class color, icon, marking, or label on the water. Contact class is known (frames carry it: `contacts.ts:80` renders true hull dims) but is not otherwise surfaced.
- `render/textures.ts` contains NO ship textures — only fog, sweep wedge, vignette, and blip dot bakes. Hulls are runtime Graphics.
- Class identity appears in text only at the menu picker (name + one-line caption). No class shown on HUD, kill feed, results table, or spectate view.
- Class-dependent feel: wake stern offset + intensity scale from class (`render/effects.ts:74-78`); camera zoom is radar-range-derived, not class-derived.

## 5. Feedback & juice inventory

- **Screen shake** — own damage only; magnitude lerped 4→16px between 15hp/55hp anchors, e^(-8t) decay, random direction per frame, clamped to fog margin (`render/shake.ts`; triggered `net/roomBindings.ts:292-296`).
- **Hit feedback** — 130ms white hull flash on struck contact (`ships.ts:89-92`); amber spark (hit) vs green splash ring (miss); crimson expanding sink ring (`render/effects.ts:31-39`); muzzle flash only when reveal sits on a visible hull (roomBindings.ts:43-53).
- **Denied fire** — click while out-of-arc/out-of-ammo: 80ms red pulse on arc/marker + selected HUD chip, rate-limited to 1 per 300ms (`render/deniedFire.ts`).
- **Audio** — 13 procedural WebAudio tones, no assets (`audio/tones.ts:40-71`): fireGun/fireTorp/fireMine, damage thud, kill chime, point ping, upgrade two-note, own-sink alarm (0.4s), countdown tick (last 5s), matchStart, stormWarn growl, telegraphUp/Down bell clicks (fifth apart). Mute persists (`audio/context.ts`). No volume control, only binary mute.
- **Toasts/feed** — upgrade/point/heal toasts (green, top-center); kill feed (amber, top-right). Both CSS-transition fades.
- **Fades** — 150ms contact sight fade (`render/fade.ts`); phosphor blip decay over sweep period; storm vignette 1.1Hz pulse.
- **Wake trails** — own ship + torpedoes.
- No hit-marker on the shooter's crosshair, no damage numbers, no kill-cam, no low-hp screen effect (HP bar color is the only own-health signal beyond shake).

## 6. Observed incoherences (factual)

1. **No client design-token layer**: 23 hex colors hardcoded across 17 files; amber in 10 files, green in 11. `CLIENT_CONFIG` holds feel constants but no palette/type tokens.
2. **DESIGN.md describes the previous game** (hex grid, simultaneous turns) yet is cited as authority in ~20 client comments; current values (e.g. purple storm, 14px floor) exist only as comment references, some contradicting it by design ("HUD scaled ~1.6×… after play test", hud.ts:28).
3. **Two denied/error reds**: Pixi surfaces use 0xFF3B3B, DOM surfaces use #FF3B30.
4. **Mixed DOM/Pixi for text of the same rank**: match phase + spectate banners + respawn overlay are Pixi Text; kill feed, toasts, spend window, results, net banner are DOM — two styling systems (Pixi style objects vs CSS strings) for peer-level overlay text.
5. **Style duplication within DOM**: panel recipe (background #111111 + 1px colored border + Geist Mono + letter-spacing) rebuilt independently in menu.ts, results.ts, upgradeMenu.ts, banner.ts; hover/selected amber-flip logic duplicated between menu.ts `paint()` and upgradeMenu.ts `paintRow()`.
6. **Type scale is ad hoc**: 16 distinct font sizes across HUD+DOM (10–112px) with no shared scale; letter-spacing varies 0.5–6px per element.
7. **Z-index scheme is informal**: killFeed/toast 900, results/banner/upgradeMenu 1000, menu 1100; documented only in an upgradeMenu.ts comment.
8. **Classes are visually undifferentiated** beyond size (Section 4) while the menu sells them as distinct choices.
9. **0x66FFAA means two things**: fresh radar blip (phosphor.ts:15) and shell splash ring (effects.ts:34).
10. **Return-to-port is a full page reload** (main.ts:358-365) — the menu reappears via reload rather than a UI state transition; disconnect UX is a banner + timed reload.
11. **Onboarding/help absent**: no surface explains telegraph, CTRL window, weapon arcs, or radar tiers; bindings are discoverable only by playing (toast hints "CTRL TO SPEND" is the sole in-game teach).
12. **Fonts load from Google CDN** at runtime (index.html:7-9); Pixi preloads only Geist Mono (stage.ts:56-66) while DOM titles/banners use Geist.
