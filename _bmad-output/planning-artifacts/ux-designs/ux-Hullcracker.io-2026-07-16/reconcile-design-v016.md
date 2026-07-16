# Reconciliation Ledger — DESIGN.md v0.16 import vs. this run

Source import: `imports/DESIGN-v0.16-root.md` · Inventory: `.working/extract-design-current.md` · Canonical decisions: `.decision-log.md` (cited as "log L<n>").
Disposition of the import (log L9): foundation, "keep what works," nothing sacred. Classification legend: **KEPT** (carries unchanged) · **SUPERSEDED** (replaced by a decision of this run) · **OBSOLETE** (dies with the turn-based hex game) · **UNDECIDED** (untouched this run; open question — not a silent keep or drop).

## Product Context
| Element | Class | Basis |
|---|---|---|
| Entire section (simultaneous-turn, hex grid, dimensions, "shots cross dimensional barriers") | **OBSOLETE** | Game is real-time, gridless, one ocean; dimensions removed (extract §4). Rewrite from GDD/brief. |
| Audience (.io demographic, 16–35, 5–15 min) | **KEPT** | Reaffirmed upstream: 13-year-old-on-a-Chromebook legibility target (log L12); desktop KB+M scoping refines, doesn't replace. |

## Aesthetic Direction
| Element | Class | Basis |
|---|---|---|
| Direction: "CIC Tactical Display, Evolved" | **KEPT** | Explicitly locked (log L12: "aesthetic locked as 'CIC Tactical Display, Evolved'"). |
| Black void ocean identity | **KEPT** | Part of the locked aesthetic; unchallenged; mocks built on it. |
| "Silver-white grid lines," calm-planning/dramatic-resolution 95/5 split | **OBSOLETE** | No hex grid; no planning/resolution phases. |
| Mood: "not playful" | **SUPERSEDED** | Tone is "Silly Is Sanctioned" — log L12 states it supersedes hex-era "not playful." Tense/focused core survives inside the new tone. |
| Reference sites (buddyboardgames, papergames, openfront) | **UNDECIDED** | Never revisited; new references named this run are LoL hotbar + Hades slots (log L21). |

## Typography
| Element | Class | Basis |
|---|---|---|
| Geist / Geist Mono family, roles, Google Fonts load, tabular-nums | **KEPT** | Never challenged; pure chrome, not mechanics-tied; log is silent = foundation default (log L9). Note: no decision re-affirms it either — flag at spine review. |
| Type scale values (56/36/20/16/14/12/11/10-11) | **KEPT** | Values unchallenged; usage notes ("turn indicator," "X/8") need relabeling for RT chrome. |
| "Code/Grid: monospace for hex coordinate system; grid labels MUST be monospace" | **OBSOLETE** | No hex coordinates exist. |

## Color
| Element | Class | Basis |
|---|---|---|
| Approach "restrained — one role per color" as a locked palette rule | **SUPERSEDED** | "We can forget the locked palette rule, you get your personal color" (log L23). Restraint survives only for HUD chrome ("HUD chrome stays phosphor," log L33-C). |
| Tactical Green `#00FF88` = *your ships* / player identity | **SUPERSEDED** | Regatta Hoist personal colors: every combatant gets a unique hue, drones greyscale (log L19, L23, L27); match-consistent assignment + preference pick (log L33, L46). |
| Tactical Green `#00FF88` as phosphor UI accent | **KEPT** | Phosphor stays the HUD chrome color (log L33-C); hotbar pick D is phosphor-glow (log L26). |
| Amber Alert `#FFB800` (action/alert role) | **KEPT** | Reaffirmed in use: low-HP <50% threshold = amber (log L56). Hex-era usages (fire target, lock-in) die; role survives. |
| Storm Purple `#7B2FBE` — shrinking-zone role | **KEPT** | Storm circle persists in RT game; color unchallenged. "Dimensional rift effects" clause **OBSOLETE** (dimensions gone, extract §4). |
| Neutrals: `#000000` bg, `#111111` surface, `#232937` elevated, text `#E2E8F0`/`#8B95A5`/`#5A6478` | **KEPT** | Chrome tokens, unchallenged. |
| Grid Stroke `#C0C0C0` / Cell Fill `#000000` | **OBSOLETE** | Hex-grid tokens. |
| Semantic: Hit `#8B0000`, Sunk `#4A0000`, Miss `#333333`, hit markers `#FF6666` | **OBSOLETE** | Battleship-era per-cell hit memory; no RT equivalent as specced (extract §4). See dropped ideas. |
| Info `#38BDF8` | **UNDECIDED** | Waiting/info states still exist; never touched this run. |
| Danger `#8B2020` (destructive actions) | **UNDECIDED** | Untouched; RT still has destructive actions (leave match, settings resets). |
| Dark mode as default/identity | **KEPT** | Unchallenged; all mocks dark. |
| Light mode toggle + full adjusted palette | **UNDECIDED** | Never discussed this run; extract §4 flags tension with "this IS the dark theme" and unclear Pixi support. |

## Grid Cell States (16-state table)
| Element | Class | Basis |
|---|---|---|
| Entire 16-state hex table (empty/ship/fire/move/miss/fading-miss/hit/sunk/ghosts/wake…) | **OBSOLETE** | Describes per-hex state memory of the dead game (extract §4). |
| Island fill `#2A2410` / stroke `#8B7520` (colors only) | **UNDECIDED** | Islands persist as circles; gridless island rendering never specced (extract §3). Colors could carry. |
| Storm-zone purple fill/pulsing stroke (treatment only) | **UNDECIDED** | RT storm-edge treatment is an open gap (extract §3); ring-countdown HUD decided (log L50) but edge rendering isn't. |

## Player Colors
| Element | Class | Basis |
|---|---|---|
| Player-chosen curated ~12-color palette | **SUPERSEDED** | Regatta Hoist palette; bright outline + darker fill of same hue; drones greyscale (log L27). |
| Conflict = hue shift for second player | **SUPERSEDED** | Preference pick, fair random draw on contention, nearest free hue; no claiming/locking (log L33-B, L46). |
| Persistent identity across games / guest-session storage | **SUPERSEDED** | Match-consistent server/shared-seed assignment riding the roster (log L33-A); preference persists, assignment is per-match. |
| Intensity tiers (capsule 30% fill / names 100% / ambient 10%) | **SUPERSEDED** | New propagation rule: hull + nameplate + small ownership accents; HUD chrome stays phosphor; full Variant C colored blips + kill feed (log L33-C/D, L28). |
| 0.75px `#C0C0C0` capsule inner stroke vs crimson cells | **OBSOLETE** | Hex-capsule-on-crimson rendering no longer exists. |
| Premium cosmetic colors (metallic/gradient/animated) | **UNDECIDED** | Never surfaced this run; not obviously obsolete. See dropped ideas. |
| Dynamic CSS var `--player-color` technique | **UNDECIDED** | Ships now render in Pixi; DOM chrome (kill feed, results) may still use it. Implementation detail, unowned. |

## Spacing & Layout
| Element | Class | Basis |
|---|---|---|
| 4px base unit + scale 2xs–3xl | **KEPT** | Unchallenged chrome token system. |
| Density "comfortable" (minus "grid cell padding" clause) | **KEPT** | Panels-tight-to-maximize-play-area principle transfers; grid clause obsolete. |
| "Grid-disciplined — the game IS a grid" layout approach | **OBSOLETE** | Gridless game. |
| Desktop planning sidebar (240px) / resolution full-screen | **OBSOLETE** | No phases; RT HUD IA decided fresh (log L49–L52: HP bar+telegraph cluster, top-center BR chrome, bottom-left hotbar, listening ring). |
| Mobile layout (bottom drawer, ship tabs, pinch-to-zoom) | **SUPERSEDED** | Scope is desktop browser KB+M only (log L12). |
| Max content width 1100px | **UNDECIDED** | Untouched; plausibly still applies to DOM chrome (menu/results). |
| Border radius sm 2 / md 8 / lg 12 | **KEPT** | Values unchallenged; sm's "grid cells" usage note obsolete. Check vs. locked hotbar squares at spine time. |

## Motion
| Element | Class | Basis |
|---|---|---|
| Two-mode planning/resolution motion split + 6-step resolution choreography | **OBSOLETE** | No resolution phase; continuous play. |
| Kill-streak impact anim + screen shake 600ms | **UNDECIDED** | Kill feed exists in RT; center-screen streak spectacle never discussed. Note: shake must obey motion-shake accessibility controls (log L53). |
| Game-over 100ms staggered ship reveal | **UNDECIDED** | Maps naturally onto the omniscient death reveal (log L48) but was never decided. |
| Easing (enter/exit/move) + duration bands micro/short/medium | **KEPT** | Generic tokens, unchallenged. "Long 400–700ms resolution only" clause **OBSOLETE**. |

## Sound
| Element | Class | Basis |
|---|---|---|
| AudioContext tone system, `playTone()`, mute (`hullcracker-muted`), try/catch | **KEPT** | Lives in the RT client today (client/src/audio); unchallenged. |
| Carried event: match-found tone | **KEPT** | Event still exists in RT lifecycle; unchallenged. |
| Carried events: planning-phase start, placement confirm | **OBSOLETE** | Phases removed. |
| "2.0" events: lock-in click, resolution rumble | **OBSOLETE** | Mechanics removed. |
| "2.0" events: hit/miss impact, sunk alarm, kill-streak tone, storm thunder, game-over debrief | **UNDECIDED** | RT sound map never designed this run; interacts with the listening ring, now the primary torpedo warning channel (log L47, L51) and the dual-coding accessibility floor (log L53). |

## UI Screens
| Element | Class | Basis |
|---|---|---|
| Home/Queue (Play button, name+color) | **SUPERSEDED** | Home-at-rest + class-select layer locked as rendered ("I *love* … the homepage!", log L41); first-5-seconds-"cool" target (log L30); color preference pick on home (log L33-B); "SET SAIL" microcopy (log L55). |
| Mode selector (BR FFA / Skirmish / Custom) | **UNDECIDED** | Locked home mock's mode-selector status unaddressed; modes themselves never discussed. |
| Online count | **UNDECIDED** | Untouched. |
| Fleet Select (pick 3 ships, duplicates) | **OBSOLETE** | One ship per player; 4-class picker replaces the job (log L29). |
| Placement screen (~30s) | **OBSOLETE** | No placement phase. |
| Planning screen (action toggles, lock-in, "X/8") | **OBSOLETE** | No turns; kill feed survives as a concept but is respecced under Variant C colors (log L28, L33-D). |
| Resolution screen | **OBSOLETE** | No resolution phase. |
| Game Over/Stats (stats grid, Play Again requeue, Return Home) | **UNDECIDED** | A results screen persists in RT, but content ("turns survived") is stale and this run only decided the death-side omniscient reveal (log L48). Stats grid + instant requeue = open. |

## Import's own Decisions Log table | **SUPERSEDED** | This run's `.decision-log.md` is the canonical record; spines win on conflict (log L3). Historical entries may be carried as history, not authority. |

## Dropped qualitative ideas worth surfacing
Genuine merit; neither survived into a decision nor got consciously killed:
1. **Premium cosmetic colors** (metallic/gradient/animated, defaults free) — only monetization hook anywhere in the design corpus; Regatta system could host it.
2. **Wake trails** — faint trail showing where a ship recently moved; RT ships literally have wakes, and it's tactically informative under fog.
3. **Desaturated-damage principle** — the `#8B0000` crimson family and its rationale ("avoid visual vibration on black") could seed RT damage feedback (hit flashes, wounded smoke tint), which is currently unspecced.
4. **Center-screen kill-streak spectacle** (impact text + shake) — RT has kills and a feed but no celebration beat; fits "Silly Is Sanctioned."
5. **Staggered game-over reveal choreography** — sequential 100ms reveal is a ready-made pacing device for the omniscient death reveal (log L48).
6. **Readiness-pressure indicator** ("X/8 locked in" psychology, details hidden) — the mechanic dies, but the idea of visible social pressure could inform the waiting-room/countdown chrome.
7. **Instant-requeue Play Again** — one-click back into queue; small, retention-relevant, unowned (listed UNDECIDED above; flagged here so it isn't lost).

## Tally
KEPT: 16 · SUPERSEDED: 10 · OBSOLETE: 16 · UNDECIDED: 15
(Partial-clause deaths noted inline — e.g. purple's "dimensional rift" role, "long durations resolution-only" — are not counted as separate rows.)
