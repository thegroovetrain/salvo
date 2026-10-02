# Extract — game-architecture.md amendments (Account Store 2026-09-09 + The Deck 2026-09-10) — UX-relevant facts

Source: `_bmad-output/game-architecture.md` (worktree copy verified byte-identical to the shared checkout). Line numbers are of that file at `HEAD` on 2026-09-10. Every item carries a decision id / heading / line. Quotes are verbatim; anything not in quotes is a tight paraphrase of the cited lines. Nothing below is invented — where the architecture is silent the entry says so.

Ranges read in full: 1-120 (front matter + executive summary), 538-740 (Account Store D9-D18), 740-1146 (The Deck, D2 amended + D19-D31), 1301-1479 (Cross-cutting amendments ×2), 1605-1823 (Project Structure amendments ×2), 2009-2258 (Implementation Patterns, Novel Patterns 6-13), 2317-2485 (Validation amendments ×2), 2503-2532 (Setup additions).

Context for the reader (front matter, lines 9-11, 38-56): two dated amendment notices sit at the top of the document. Account store: "D7 is SUPERSEDED, D8 AMENDED, D9–D18 ADDED" (line 39-40). The Deck: "D2 is AMENDED, D19–D31 ADDED, Novel Patterns 2–3 AMENDED and 10–13 ADDED" (line 49-50). "Rulings Eric took live on 2026-09-10 are marked **(Eric)** in place." (line 56). Where an amendment block disagrees with an original, "the amendment governs" (line 43).

---

## 1. CLIENT-FACING SURFACES the architecture implies or names

### 1.1 Sign-in flow

- **OAuth only, two providers, minimal scopes.** D13 (line 556): "`@colyseus/auth` 0.18, OAuth ONLY (Google, Discord, minimal scopes), a **curated endpoint subset** (userdata + OAuth)". D13 detail (line 639): "Scopes: Google `openid`, Discord `identify`. No email scope on either." Email/password/anonymous/forgot/reset routes are "never mounted" (line 644-645).
- **Flow shape: a POPUP with a postMessage callback.** D13 (line 556): "the popup **callback endpoint replaced** to pin the postMessage origin to `HC_SITE_ORIGIN`". D13 detail (line 640-642): the `callback` entry is "REPLACED by `server/src/account/oauthCallback.ts` — a copy that posts to `postMessage(payload, HC_SITE_ORIGIN)` rather than `'*'`". Project Structure tree (line 1633): "`oauthCallback.ts` # the REPLACED popup callback — postMessage to HC_SITE_ORIGIN (D13)". Novel Pattern 8 (line 2080-2107) is the server side of this; the client calls "sign-in (`client.auth`)" per the tree entry for `net/account.ts` (line 1654). The architecture does not describe the popup's visual or what the home does while it is open.
- **Where the session lives: localStorage token, Bearer header, NOT a cookie.** D13 detail (line 656-658): "The token lives where the SDK puts it (localStorage) and rides matchmaking as `Authorization: Bearer`; both rooms' `static onAuth` verify it AFTER the PV and staging gates and attach `{ userId }` or `null` (anonymous is a first-class result, not an error)." D9 detail (line 576-578): "the account token is a Bearer header, not a cookie, so a future apex/subdomain split changes nothing here; the admin console's own cookie is `SameSite` within the registrable domain and also survives it." JWT lifetime: "**JWT 30 days** with token-version revocation" (D13, line 556); "`expiresIn: '30d'`" (line 653). Privacy inputs (line 2347-2348): "A session token is kept in the browser's localStorage for 30 days."
- **Sign-out.** D13 detail (line 653-655): "Sign-out and deletion call `db.auth.bumpTokenVersion(userId)`, which the module's `revocationCheck` enforces on every verify." Logging (line 1336): `account.signout { userId }` is a logged event. D17 detail (line 700): "Sign-out leaves local as it was." Novel Pattern 9 (line 2116): "Sign-out: leave local." The architecture names no sign-out control location.
- **Second-provider linking.** D13 detail (line 648-652): "**The `upgradingToken` branch is decided (Eric 2026-09-09): a caller already holding a valid token who completes OAuth with a SECOND provider gets that identity LINKED to the same user** — one account, two ways in, both removed by deletion." Consequence for UX: a signed-in player who signs in again with the other provider links rather than switching accounts. No UI is specified for this.
- **What the home shows when accounts are enabled / signed in.** D9 detail (line 570-573): with no `DATABASE_URL` "the home screen renders no SIGN IN, and the game is byte-identical to today." Observability (line 1379-1380): "`/liveness` gains `account: boolean` (module live) — the client's only signal to render SIGN IN." Configuration (line 1353-1354): "The client learns 'accounts exist' from `/liveness` (`account: true`), not from build-time config." Project Structure tree (line 1657): "`ui/signIn.ts` # NEW — SIGN IN row on the home screen (DOM chrome), rendered only when liveness says account:true". Consistency rule (line 2138): "Module inert without `DATABASE_URL` | no `GameDatabase` construction, no routes, no SIGN IN | boot test". The client-side account state shape (Events, line 1369-1371): "one `account` slice in `state.ts` (`{ status: 'anonymous' | 'signedIn', userId?, profile?, decks?, progress? }`), written ONLY by `net/account.ts` from HTTP responses, read by `ui/`." Consistency rule (line 2135): "screens read `/api/account/me`". Beyond "SIGN IN row" the architecture does not specify what the signed-in home displays (callsign, progress, deck picker etc. are not laid out here).
- **Dev sign-in.** Debug (line 1394-1396): "a `HC_DEV_OPTIONS`-gated `devSignIn` endpoint mints a token for a named local user so the deck editor can be driven without provider apps. Never mounted in production".
- **Rate limiting on sign-in.** Debug (line 1397-1398): "sign-in start and deck writes share `soloThrottle.ts`'s per-IP shape (epic-7 amendment 45), env-tunable, in-memory". A throttled sign-in surfaces via the HTTP result shape (below), not a specified UI.

### 1.2 Error surfaces the client must render (sign-in / door)

- **Door refusal is shown, with an explicit fallback act.** Cross-cutting Error Handling (line 1314-1318): "a signed-in captain whose deck cannot be loaded (query failure, deck missing, illegal) is REFUSED with a stable code — `account.unavailable`, `deck.missing`, `deck.illegal { rule }` — never silently seated on the starter deck (D18). The client shows the reason and offers SAIL STARTER DECK as an explicit act. Anonymous joins are untouched by any account failure." Code sketch (line 1327-1330): `throw new ServerError(4001, deck.code)` — "'deck.illegal' etc. — never fall back".
- **HTTP results are Result-shaped JSON.** (line 1319-1322): "`{ ok: true, … }` or `{ ok: false, code, reason }` — with the same stable codes; HTTP status carries only the class (200/400/401/404/409/503). No stack traces, no driver messages, no SQL leave the process."
- **Error code naming** (Naming, line 1686): dot.case `<domain>.<reason>` — `deck.illegal`, `account.unavailable`.
- **Account layer degraded at boot** (line 1309-1313): if the database is unreachable "the process STILL STARTS with the account module OFF, logs `account.disabled { reason }` once, and `/liveness` reports `account: false`." So the SIGN IN row can legitimately be absent on a host that normally has it.
- Novel Pattern 6 edge cases (line 2045-2049): "anonymous + `deckId` present → ignored, starter deck; signed in + no `deckId` → the account's LAST-USED deck for that hull, else starter; … module disabled → `account.unavailable` for a token-bearer, silent anonymous for everyone else."

### 1.3 The deck editor

- **DOM chrome, not Pixi.** Project Structure tree (line 1658): "`ui/deckEditor.ts` # NEW — the deckbuilder (DOM chrome); legality feedback via shared deckRules". Events (line 1371-1372): "the deck editor is DOM chrome and never touches the sim." System mapping (line 1676): "Deck editor / history / sign-in (E9) | `client/src/ui/` | DOM chrome only; nothing tactical".
- **Legality feedback is CLIENT-side, via the SAME shared function the server runs.** System mapping (line 1666): "Deck legality (D18) | `shared/src/sim/deckRules.ts` | Pure; server runs it at the door, client runs it in the editor for feedback — one function, never two". E9 story 3 mapping (line 2336): "Deck editor | `ui/deckEditor.ts`; `shared/sim/deckRules.ts`, `catalog.ts`; `account/decks.ts` CRUD | D14; one legality function both sides".
- **The legality rules the editor must communicate.** Tree (line 1617): "`deckRules.ts` # NEW — legal-deck check: exactly 40, ≤3 equipment lines, caps, ownership (pure)". D22 detail (line 903-905): "`checkDeck` (`deckRules.ts`: exactly `CONFIG.deck.size`, ≤ `maxEquipmentLines` lines whose copy 1 fits, every line ≤ cap, every line owned)". CONFIG (line 1355-1356): "`deck` (`size: 40`, `maxEquipmentLines: 3`)". D19 (line 843-845): a card can never "put a copy of a line past its cap — the last is refused at the door by `deckRules` (E9 Pattern 6) and again by `drawOffer`, which never offers a line at cap." Deck arm note (line 1474-1476): "a deck of zero equipment lines … is LEGAL by design (GDD: a gunboat deck is legal)."
- **API it calls.** Tree (line 1642): "`endpoints.ts` # better-call endpoints: /api/account/{me,profile,decks,unlock,history,delete}". Tree (line 1637): "`decks.ts` # loadDeckFor(userId, deckId, hull) — the door helper (D18); deck CRUD for the editor". Naming (line 1685): HTTP paths `/api/account/<noun>`; auth at `/auth/*`. Consistency rule (line 2137): "Line ids everywhere | store, `deckId` wire, editor, sim speak `LineId`; display names only in `client/src/ui/`".
- **Card identity / naming.** D14 (line 557, 663-666): "camelCase line ids declared in `shared/`"; "Display names live only in client copy. Adding a line = one id + one cap; a rename = zero store migrations." Boundary rule 11 (line 1811-1813): "Every catalog fact lives in `shared/src/sim/catalog.ts`. No line, tier, cap, starter or family list may be declared anywhere else — not in `constants.ts`, not in a server module, not in client copy (display names excepted, per D14)."
- **Several decks per hull.** D12 schema (line 622-623): "`decks (id, user_id, hull, cards jsonb[{lineId, copies}], updated_at)`". Validation GDD coverage (line 2323): "several decks per hull (`decks` table)". Novel Pattern 6 (line 2046-2047): "signed in + no `deckId` → the account's LAST-USED deck for that hull, else starter".
- **Deck selection at join.** D18 detail (line 705-714): "ONE shared `loadDeckFor(userId, deckId, hull)` is called by `StandardQueueRoom.onJoin` for standard and by `ArenaRoom.onJoin` for solo … returns the 40 line ids, which the queue puts into the seat reservation options exactly as it already does for `name`/`cls`/`horn`". "**A client-supplied `deck` key is REJECTED by the sanitizer at BOTH doors** … Anonymous → the hull's starter deck; invalid → a refusal with a reason, never a silent substitution." Tree (line 1645): "`roomOptions.ts` # + deckId sanitizer; REJECTS `deck`". So the client sends a `deckId` room option, never contents. E9 story 4 (line 2337): "Deck selection at join + freeze". Deck is "frozen at queue (Pattern 6)" (line 2323).
- **Anonymous players get NO editor.** D17 (line 560): "anonymous = starter deck only, no progression, no deck editor". D17 detail (line 695-696): "no XP accrues, no deck editor renders."
- **Unlocks.** Schema (line 623): "`unlocks (user_id, line_id)`"; tree (line 1638): "`progress.ts` # unlock(lineId), atomic xp increment, derived level/tokens"; endpoint `/api/account/unlock` (line 1642). CONFIG `progression` (line 1356-1358): "placement XP curve, `soloXpFactor`, `matchesToCatalog` — the OPEN intent dial, no placeholder, and the flat unlock `tokenPrice [DRAFT]`". Validation (line 2323): "unlocks variety-never-power (store shape only — the win-band is the harness's job)". Novel Pattern 6 (line 2047-2048): "unlocks are never revoked". The architecture does not lay out an unlock UI.
- **Derived progress numbers.** D12 (line 623-625): "**level and available tokens are DERIVED** (`level = f(xp)`, `available = level − tokens_spent`), never stored". Tree (line 1618): "`progression.ts` # NEW — xp per placement, solo discount, level(xp), tokensAvailable (pure)". These are what a progress/unlock surface would display.
- **Deck-write rate limit.** (line 1397-1398) deck writes are per-IP throttled.

### 1.4 Match history route (player-facing)

- D16 (line 559): "**players get their own history route** in the account API". D16 detail (line 685-687): "`GET /api/account/history?cursor=` returns the caller's own `match_participants` rows (brought / drawn / taken, placement, kills, T+ stamps). Enemy decks are never returned by any route — the query is keyed on the caller's user id, not on match id."
- Tree (line 1659): "`ui/history.ts` # NEW — own match history (DOM chrome)". Tree (line 1639): "`history.ts` # the player's own history query (cursor-paged)". E9 story 6 (line 2339): "Match history + Eric's view".
- Time stamps: D12 (line 630-631): "the `atMs` stamps are what the history route prints as `T+mm:ss`."
- See section 3 for the full record shape.

### 1.5 Admin / metrics (Eric-only)

- D16 (line 559): "`@colyseus/admin` 0.18 for Eric (own admin login, RBAC, CRUD over the account tables)". D16 detail (line 678-682): "mounted at `/admin` + `/admin-api` in BOTH environments, gated by its own login (the bootstrap admin is created ONCE, out of band, never by a route); on the dev host it sits BEHIND the staging gate so the password page comes first … Player accounts never hold an admin role. Account tables are exposed through its `tables` option so history is browsable without SQL." Observability (line 1381): "`@colyseus/admin` (D16) is the read surface for history; it is an ops console, not a metric." Not a player surface; no client code.
- Ledgered (line 2376-2379): the admin console "sits on the public host behind its login (and the staging gate on dev)".

### 1.6 Account deletion (D15)

- **Yes, player-facing, self-serve, in Settings.** D15 (line 558): "**Self-serve delete**: account, sessions, decks, unlocks and prefs removed; match-history rows keep deck contents with the account reference nulled". D15 detail (line 670-674): "`DELETE /api/account` (authenticated): one transaction … bump token version first so no live token survives. Response 204. **Settings gains a DELETE ACCOUNT control with a confirm.** The privacy paragraph states both the deletion path and that anonymized match records are retained." Tree (line 1660): "`settings.ts` # + DELETE ACCOUNT control". Tree (line 1641): "`deletion.ts` # the one-transaction delete (D15)".
- Mid-match deletion is safe for history (D18, line 726-729): "a captain who DELETED their account mid-match is written the same way (the FK's `ON DELETE SET NULL` …), so one deletion can never roll back a whole match's history."

### 1.7 Prefs & settings (D17) — two states

- D17 (line 560): "**Two states, nothing in between** (Eric 2026-09-09): anonymous = starter deck only, no progression, no deck editor, settings in localStorage exactly as today; signed in = the account holds callsign, colour preference, last class AND the settings store, and the client switches to them".
- D17 detail (line 695-700): "the anonymous path is byte-identical to today: `hullcracker.*` localStorage for callsign, colour preference, last class and the settings store; no XP accrues, no deck editor renders. Signed in, `account_profiles` is the source of truth and the client switches to it: on the FIRST sign-in of a fresh account (no profile row) the local values SEED the row — the account never wipes a callsign someone has carried for weeks; on every later sign-in the account wins and overwrites local; edits while signed in write both. Sign-out leaves local as it was. The callsign becomes stored personal data and is named in the privacy paragraph."
- Storage shape (D12, line 619-622): "`account_profiles (user_id, callsign, color_pref, last_class, settings jsonb)` — `color_pref` is a PREFERENCE, never the server-assigned wheel index `regatta.ts` hands out at join; `settings` is the client settings store's own versioned shape, migrated by the client's existing `migrate`".
- Novel Pattern 9 (line 2109-2123): "ONE store with two backends, never two stores" — `type SettingsSource = 'local' | 'account'`; "consumers never know which backend is live; `net/account.ts` is the only module that flips the source; the anonymous path is byte-identical to today, pinned by the existing settings tests running with `source: 'local'`." Tree (line 1655): "`settings/store.ts` # + account-backed source when signed in (D17); localStorage otherwise".
- Endpoint for profile: `/api/account/profile` (line 1642).
- Consequence flagged for UX: the existing localStorage settings store STAYS the anonymous backend; signed-in players get server-side settings that follow them across browsers. Nothing in the architecture says the settings panel itself changes layout, only that it gains DELETE ACCOUNT (1.6).

### 1.8 Privacy page inputs (E9 story 7)

- Validation, "Privacy-paragraph inputs" (line 2343-2351): "Signed-in accounts hold: a provider name and an opaque provider subject id; the chosen callsign, colour preference and last class; the settings store; decks; unlocks and progress (xp, tokens spent); per-match rows of the player's own deck, draws and picks with placement and kills. A session token is kept in the browser's localStorage for 30 days. Deleting the account removes all of the above and leaves match rows with no account reference. Nothing is stored for a player who does not sign in. The operator's admin console can read these tables." E9 story 7 → `client/src/privacy/policyCopy.ts` (line 2340).

---

## 2. ON-THE-WATER WIRE/STATE facts that shape HUD behavior

### 2.1 Loadout / slot state (D20, D21)

- **Nine slots, fixed roles, identical for every hull.** D20 (line 760): "**One flat 9-slot array with roles**: `gun`, `boost`, `weapon ×3`, `consumable ×4`; one slot-state shape for all nine (a consumable is a stack that never reloads); the wire ammo array stays slot-aligned; the client keeps rebuilding slot contents by replaying the applied-card list". Rationale: "class identity leaves the loadout entirely — every hull's loadout at 0:00 is identical". Code (line 851-852): `SLOT_ROLES = ['gun','boost','weapon','weapon','weapon','consumable','consumable','consumable','consumable']`; `SLOT_GUN = 0, SLOT_BOOST = 1, WEAPON_SLOTS = [2,3,4], CONSUMABLE_SLOTS = [5,6,7,8]`. (line 854): "`loadoutFor(): LoadoutSlot[]` // gun + boost fitted, seven empty — the SAME for every hull; specialsFor() is deleted".
- **How the client learns slot contents: replay, no new wire field.** D20 detail (line 863-865): "The client replays `you.cards` through the same function to rebuild `equipmentId` per slot and reads `n` from `ammo` — today's mechanism, no new wire field for slot contents." (line 859): "`slotAmmo(ship)` still emits the slot-aligned wire array, now length 9." Tree (line 1745): "types.ts # … `OwnShip.{cards, deckLeft, draft?, shield?}`; ammo length 9". `OwnShip.boons` is renamed `cards` (line 815-816, 1455).
- **Consumable stack semantics.** (line 857-859): "A consumable stack is `{ n: copiesHeld, reloadMsLeft: 0 }` with `maxAmmo = line cap`; its `tick` is a no-op and `tickReload` is never called for a `consumable` role." Emptying (line 866-868): "a consumable slot whose `n` reaches 0 on activation clears to `equipmentId: null` in the same tick, so a later pick of that line stocks fresh; a weapon slot never empties." Tree (line 1774): "`hotbar.ts` # 9 slots; consumable stacks show n".
- **Reconnect-safe by construction.** D21 rationale (line 761): "No new channel, no priming state, reconnect-safe by construction (slot state is `OwnShip`)".
- **Keys.** D20 detail (line 873-875): "`Q`/`E`/`R` prime slots 2–4; `1`–`4` with the refit window CLOSED fire/prime slots 5–8; with it OPEN they still take cards (the digit's meaning is the window's state, a client concern); `Digit5 → HEAL_CHOICE` is deleted with the sentinel; `Shift` is slot 1's ability key." Tree (line 1768): "`keyboard.ts` # Shift → actSlot 1; 1–4 dual role by refit-window state; − Digit5". Tree (line 1778): "`ui/upgradeMenu.ts` # mulligan during countdown; greyed cards via shared canStock; − key 5". Tree (line 1775): "`hud.ts` # + deckLeft counter; − DAMAGE CONTROL rail". E8 story 6 (line 2413): "Heal as a card; retire `5`".
- **Two activation channels by `isWeapon`.** D21 detail (line 879-884): "`EQUIPMENT_IS_WEAPON`: `hullRepair`, `shieldBlock`, `smokeScreen`, `chaff` → `false` (the ability channel: `actSeq` + `actSlot ∈ CONSUMABLE_SLOTS`, no aim, no latency compensation …); `decoyBuoy` → `true` (the click channel: primed by its digit, fired by click, `input.slot` carries the resolved prime, `arcs.ts` gives it the mine's rear sector)." Sinking (line 895-897): "consumables obey the existing single sinking-activation gate (Novel Pattern 3) on their channel; no per-consumable policy."
- **Fleet fit** (line 869-872): the PvE fleet's fit is a fixed `FLEET_FIT: LineId[]` "applied at spawn through `applyBoon`".

### 2.2 The Tab offer: full-slot refusal, greyed cards, no denial view (D21)

- D21 detail (line 885-889): "**Full-row refusal is a SPEND rule, not an activation rule:** `spendCard` runs `canStock(loadout, lineId)` BEFORE `consumeCard`; a refused pick is a silent no-op on the server (the card stays in the offer — the never-rerolling offer is the mechanism) and the client greys the card with the same predicate. No `denied` view is added: a fair client cannot reach the case."
- Cross-cutting Error Handling (line 1409-1413): "a pick the ship cannot stock, a mulligan outside its window or a second mulligan, and a spend of a card at its cap are all SILENT NO-OPS on the server — the offer is left byte-identical and the client, running the same shared predicates (`canStock`, `MULLIGAN_CHOICE` gating), never presents the action. No new `denied` reason is added for any of them; the `denied` view stays the ACTIVATION channel's feedback."
- `canStock` is "the ONE refusal predicate, both sides" (Novel Pattern 2 amended, line 2156). Fill rule (line 860-863): "`slotFill` takes the first EMPTY weapon slot (it cannot fail for a legal deck …); `stock` takes the slot already holding that consumable, else the first empty consumable slot, else REFUSES (D21)."
- So the HUD/refit window shows a greyed (unpickable) card whenever all four consumable slots hold OTHER consumables; there is no error toast, no `denied` pulse.

### 2.3 The draw-pile counter, exhaustion, the draw (D22)

- D22 detail (line 929-931): "**The counter:** `OwnShip.deckLeft: number` = `deck.cards.length`, self-private, the only deck-derived number on the wire; it discloses nothing about composition. Exhaustion is the existing degenerate path: an empty draw banks the level silently and queues no `pt`." Tree (line 1775): `hud.ts` "+ deckLeft counter". E8 story 3 (line 2410): "Equal-weight draw, card-leaves, exhaustion, counter | … `OwnShip.deckLeft`; `render/hud.ts`".
- Deck size seen by the counter: authored 40 + pool 10 = 50 at the seat (line 901-905).
- The draw (line 914-919): "`drawOffer` … draws `CONFIG.offer.size` DIFFERENT lines, weight = copies in deck and nothing else; a line at its cap on the ship is never offered. `opts.guarantee` (level zero only): the first card is drawn uniformly among USABLE cards — a consumable, or a line whose next tier is I — then the rest from everything else. If a legal deck holds no usable card (a pure gunboat deck can), the guarantee is vacuous and the draw is plain; pinned so nobody 'fixes' it into a reroll."
- Logging (line 1425-1427): `deck.exhausted { matchId, shipId }` server-side only; the client is told nothing extra beyond `deckLeft` reaching 0.

### 2.4 Level zero at countdown + the mulligan (D22)

- (line 920-922): "**Level zero at countdown:** `Match`'s countdown-entry hook calls `grantPoint` for every captain BEFORE `activate()`; the offer materializes then and is spendable during the countdown (`spendPoint`'s guards are bank + afloat, both true). Bots receive it identically."
- (line 923-928): "**The mulligan:** `SpendMsg.choice === MULLIGAN_CHOICE` (`-2`, beside the retired `-1`, in `offers.ts`); `spendPoint` honours it iff `match.phase === 'countdown' ∧ !ship.mulliganed ∧ ship.offer !== null`; it redraws with the same guarantee, sets `mulliganed`, replaces the offer and re-queues `pt`. Anything else is a silent no-op. The never-reroll pin (FR19) gains its ONE asserted exception — a test proves a second mulligan and a live-phase mulligan both leave the offer byte-identical."
- Wire (line 1455-1456): "`SpendMsg` gains the `MULLIGAN_CHOICE` sentinel and loses `HEAL_CHOICE`." Naming (line 1805): "Spend sentinels | `SCREAMING_CHOICE` constants in `offers.ts`, negative integers | `MULLIGAN_CHOICE = -2`".
- Tree (line 1778): "`ui/upgradeMenu.ts` # mulligan during countdown". `matchOverride` learns a `mulligan` beat for smokes (line 1469-1471). E8 story 7 (line 2414): "The opening: gun-and-Shift spawn, level zero, mulligan, weighted draw". The architecture names no key binding, copy, or position for the mulligan control; "the client, running the same shared predicates … never presents the action" outside the countdown (line 1411-1412).
- Spawn state: "gun-and-Shift spawn" (line 2414) — every hull spawns with only slot 0 (gun) and slot 1 (boost) filled (line 854).

### 2.5 Key-fires vs key-primes-then-click (D21)

- D21 (line 761): "Consumables ride the TWO EXISTING input channels, split by `isWeapon`: key-fires on the ability counter (like the Shift boost), the aimed DECOY BUOY on the click counter with the mine's rear arc". Detail at 2.1 above (line 879-884). Validation GDD coverage (line 2399): "key-fires vs key-primes-click-fires, full-slot refusal, server-owned slot state (D21)".
- Practical HUD consequence: `1`-`4` (window closed) FIRE hull repair / shield / smoke / chaff instantly; `1`-`4` PRIME the decoy buoy, which then fires on click inside the mine's rear arc.

### 2.6 The held-fire stream (D26, Novel Pattern 13)

- D26 (line 766): "**A validated `held` LEVEL on `InputMsg`**; while true with a stream-kind slot primed and in arc, the server fires at the weapon's cadence from its pool; stream shells carry no per-shell fire time and take no back-date; the click counter is untouched".
- Detail (line 1018-1026): "`InputMsg.held: boolean` — REQUIRED; a non-boolean drops the whole message … It is a LEVEL: it rides `InputStore.latest`, costs no intent-queue slots". "`fireControl`, after the click pass: if `input.held ∧ EQUIPMENT[primed].stream ∧ inArc(aim) ∧ n > 0`, an accumulator `ship.streamAcc += dt` fires one shell per `CONFIG.machineGun.rateMs`, spawned at `now` with **no `fireT` and no D1 back-date** (a stream is not a click). Release, arc exit or an empty pool stops it; **arc exit emits ONE `out-of-arc` denial at the transition, then silence** (GDD note 21's 'cursor leaves the arc' case, answered here). `held` with a non-stream slot primed is ignored, pinned."
- Client (line 1032-1033): "`mouse.ts` sets `held` = pointer down inside the primed stream's arc; `ownFire.ts`'s click latch is untouched; no prediction (fire is server-resolved)." Tree (line 1769): "`mouse.ts` # held = pointer down in the primed stream's arc (D26)".
- Novel Pattern 13 rules (line 2232-2235): "`held` with a non-stream prime is ignored; arc exit emits one denial then silence; stream shells emit `mz` per shell (Eric) and `hc` per shell; the click counter's semantics are untouched."
- Ammo model (line 1027-1031): "`ammo.ts` refills round-by-round with overshoot carry, so a 24-round pool on a 15 s reload refills one round per 0.625 s. Catalog v3's *'6 s of fire per pool, 15 s reload'* reads as a MAGAZINE reload; both readings are `[DRAFT]` numbers, so the architecture reserves ONE optional switch — `ammo.refill: 'round' | 'magazine'` per equipment row, default `round`". This determines whether the hotbar's machine-gun ammo readout ticks up continuously or refills in a block — UNRESOLVED.
- Rendering of what the client sees while held: the architecture names only the per-shell `mz` flash and per-shell `hc` (D27, line 1045-1050) and a "tracer" projectile draw (tree line 1770: "`projectiles.ts` # + missile, tracer, arcing shell (from the reveal's w)"). No held-state HUD indicator is specified.
- Cost caveat (line 1050-1052, 2463-2465): "20 bots streaming at 4 Hz is 80 `mz`/s at the emitter; `flashBudget.ts` caps the RENDER, and a measurement is owed before the number is trusted."

### 2.7 Smoke as a sight occluder (D24, Novel Pattern 12)

- D24 (line 764): "**One `sightClear()` predicate** = island LOS ∧ no puff crossed (`segCircleHit`), at ALL FIVE sight-tier callers (true sight, the 3/8 detect rung, the muzzle-flash and wounded-smoke halos, the foghorn muffle); radar is untouched BY CONSTRUCTION (its gate is the height march); symmetric, so a puff hides its occupant and blinds an observer inside it; puffs travel as a new frame channel". Rationale: "Smoke is an island for every sensor but radar".
- Entity/CONFIG (line 960-966): `SmokePuff { id, ownerId, x, y, bornAt, until }`; `puffRadius(puff, now) = r0 + (r1 − r0) × min(1, age / expandMs)`; "`CONFIG.smokeScreen.{r0: 40, r1: 60, lifeMs: 30000, layMs: 5000, puffIntervalMs, expandMs [DRAFT]}` — a NEW block; the existing `CONFIG.smoke` is WOUNDED smoke and is untouched". A new `STEP_ORDER` row `stepSmoke` "drops a puff at the stern every interval while laying and expires dead puffs."
- Symmetry (line 974-976): "the segment test hides a target inside a puff, hides everything behind it, and blinds an observer standing in one (every segment from inside starts inside the circle). The GDD's `[DRAFT]` 'hides its own occupant' is therefore not a rule but a consequence."
- **Wire / what the client draws** (line 977-981): "`SmokeView { id, x, y, t0 }` — no radius on the wire; the client runs the shared `puffRadius`. A new `smoke` pseudo-row in the signal registry: visible iff the CENTRE is within `sight + puffRadius` with ISLAND-ONLY LOS (a puff must stay visible from inside another puff or it would vanish around you) OR `ownerId === me` (the mine's `own` posture). `FrameMsg.smoke?`." Tree (line 1771): "`render/smokeScreen.ts` # NEW — puffs from FrameMsg.smoke via shared puffRadius (render/smoke.ts stays WOUNDED smoke)".
- Consequence for the contact layer: a hull inside/behind a puff simply drops out of the frame (consistency rule line 2248: "a 'smoked hull never in frame' property"). Radar blips of it continue (radar never calls `sightClear`). Bots (line 981): "lose smoked contacts exactly as a client does."
- Own smoke: always visible to its owner ("OR `ownerId === me`").
- Lit zones ignore smoke (line 971-973, 2469-2470): "a lit zone ignores smoke exactly as it ignores islands — pinned, ledgered" / "a design question if a star shell should not see into smoke."
- Aim preview: the architecture is silent on whether the burst-circle preview dims through smoke as it does through islands (`clipAtIslands`); only islands are named.

### 2.8 Chaff (D27) — fake blips

- (line 1053-1058): "**CHAFF** is a `FakeSource { x, y, radius, count, until, seed }` on the ship — the jamming buoy's `scatterJamFakes` generalized to a source that is not a buoy; fakes are emitted through the observer's own `blipGate` and `blipShape` exactly as today, owner-exempt, epoch-rescattered per sweep." Tree (line 1755): "`fakes.ts` # NEW — scatterFakes(seed, epoch, cx, cy, radius, count)". Tree (line 1763): "`chaff.ts` # NEW — ship.fakeSource".
- Presentation consequence: fakes are wire-indistinguishable from real blips (same gate, same shaper), so the radar scope draws them exactly as real returns. The owner never sees their own fakes ("owner-exempt"). `CONFIG.chaff` is a new block (line 1437). No dedicated HUD indicator for "chaff active" is named — the only own-ship state is `ship.fakeSource` server-side; `OwnShip` gains `deckLeft`, `draft?`, `shield?` only (line 1455), so chaff's remaining duration is NOT on the wire for the owner.

### 2.9 Decoy buoy view (D29)

- (line 1091-1095): "**Decoy store** replaces the buoy store: `DecoyState { id, ownerId, x, y, hp }`, dropped by `dropDecoy` into the mine's rear arc, no lifetime. `DecoyView { id, x, y, own, hp? }` — `hp` present ONLY when `own` (Eric); `materialize()` strips it for every other observer, the `sunk.seen` per-observer idiom. Whether a decoy PAINTS on radar is unruled: the default is that it does, through the buoy's existing footprint path, ledgered."
- Tree (line 1772): "`render/decoys.ts` # NEW — replaces buoys.ts; owner-only hp readout". Frame channel: "`FrameMsg.buoys` is DELETED with the radar buoy; `FrameMsg.decoys?` and `FrameMsg.smoke?` are added" (line 1453-1454). Naming (line 1804): frame channels are plural nouns — `smoke`, `decoys`.
- Decoy as physical block (line 1003-1004): "`decoy` → a shell damages it (D29); a torpedo or missile DETONATES on it — the physical block, homing or not." Collector (line 992): "decoys = 12u squares". Homing (line 1010-1011): seekers acquire `hitTargets(['hull','decoy'])` minus the owner's hull.
- Non-hull damage writer: `damageDecoy` (line 1081).
- Rationale (line 769): "the ledgered *killed-vs-expired is indistinguishable* thread closes for the one buoy that survives" — i.e., a decoy has no lifetime; it lives until destroyed, and the owner can watch its hp.

### 2.10 Shield block presentation (D28)

- D28 (line 768): SHIELD BLOCK absorbs in the ONE `applyDamage()`, "**from every source (Eric)**". Code comment (line 1071): "Eric: every source, storm and burn included".
- Own-ship state (line 1079-1080): "`ship.shield = { hpLeft, until }`; expires at `until` or `hpLeft === 0`; a second shield while one is up REPLACES it with a fresh 100 / 10 s — no stacking, `[DRAFT]`, ledgered. `OwnShip.shield?`." D21 (line 893): "SHIELD BLOCK — `ship.shield = { hpLeft: 100, until }`".
- **Shooter gets no tell** (line 1059-1062): "the shield is `OwnShip.shield?` and emits nothing — a shooter's `hc` fires on the hit and `dmg` (victim-private) reads 0, so the shooter gets no tell. Ledgered as a design question; the default is the quieter one." Novel Pattern 10 (line 2183): "callers emit their own `hc` / `boom` on the HIT, before calling (a fully-absorbed hit still calls); the gate never emits anything but `dmg`". Gate order (line 1077): "shield → hp → assist ledger → sink check → `dmg`".
- So: the shield holder sees `OwnShip.shield` (hp left + expiry) and receives `dmg` events reading 0 while absorbing; enemies see nothing. No visual for the shield on other players' hulls exists on the wire.

### 2.11 Signals per new line (D27)

- Wire kinds (line 1037-1044): "`shell` (the gun family — deck gun, machine gun, monitor, flak: *in the air*, sight-gated), `torp` (all three torpedoes — one kind; speed is the velocity already on the reveal; detect-gated as today, wake paints as today), **`missile`** (new: a flat flyer, sight-gated like a shell because it flies) with **`missileU`** (its homing update row, the `torpU` shape at the sight rung). The reveal gains ONE field, `w` — the weapon FAMILY needed to draw it (a tracer is not a shell, a plunging shell arcs) — carrying no range-derivable value and no identity. This is a deliberate, ledgered DISCLOSURE WIDENING".
- Gun-shell rules (line 1045-1050): "`sp` (own splash) for the gun family AND the missile and monitor (never torpedoes); `hc` exactly one per shell resolution — per machine-gun shell, per flak shell, per missile, per monitor shell — the broadside's per-shell reading generalized; `mz` per shell for every gun-family weapon and the missile, **including the STREAM (Eric)** — the broadside's `perShellFlash` opt-out becomes the rule for `stream` equipment, while the multi-barrel deck gun's one-click salvo still collapses to one flash (amendments 19/20 intact)."
- Tree (line 1770): "`projectiles.ts` # + missile, tracer, arcing shell (from the reveal's w)"; (line 1769 area) "`net/snapshots.ts` # + missile/missileU interpolation"; (line 1777): "`weaponArc.ts / aimPreview.ts` # the six new arcs; monitor arc preview". Arcs (line 1735): "+ the six new arcs (light twin-sector, heavy/supercav/monitor/missile/machine-gun bow sectors); decoy = the mine's rear sector". Aim (line 1736): "+ missile burst point, monitor landing point, machine-gun range clamp".
- Monitor: "`arcing` flag that skips terrain (as the cannon did) and resolves shell-radius-vs-target at the click" (line 1012-1013). Missile: "en-route direct hit uses `CONFIG.missile.contactDamage`" (line 1013-1014).
- Presentation gaps ledgered (line 1005, 2471-2472): "a destroyed torpedo or missile emits no boom of its own"; "A puff is visible with island-only LOS so it never vanishes around you".
- Six exceptions unchanged (line 1049-1050, 1133-1134, 2251).

### 2.12 Wake drafting (D23)

- D23 (line 763): "**Shared lift function, server-computed self-private scalar, client folds it**: `draftLift()` in `sim/wake.ts` over last tick's ribbons; `OwnShip.draft`; `draftedKinematics` is the THIRD per-tick step in the pinned fold `boosted → slowed → drafted → hooks`".
- Lift (line 935-939): "the MAX (not the sum — *'trails merge'*) over every OTHER hull's ribbon of a per-segment lift inside `cfg.halfWidthU` of the segment, in `[0, cfg.lift]`; own ribbon and torpedo ribbons are excluded. Both scalars are `CONFIG.wake.draft.{lift, halfWidthU}` — **`[DRAFT]`, Eric's to set, no placeholder in this document.**"
- Wire (line 945-948): "`OwnShip.draft?: number` — omitted when 0, the `slowedUntil?` idiom, self-private." Client (line 949-952): "`prediction.setDraft(you.draft)` beside `setBoostStats`; `tickKin` folds it; replay applies the latest scalar to every un-acked tick."
- **HUD readout: none named.** The only client consumers listed are `sim/prediction.ts` (tree line 1769: "setDraft; tickKin folds draftedKinematics"). No `render/` or `hud.ts` entry reads `draft`. Perception note (line 953-955): "the scalar tells a client 'a wake is under you' even when its hull is island-hidden; the kinematics would disclose the same thing one frame later." Bots "get it passively (no tactic)" (line 956).

### 2.13 Shift boost (D30)

- D30 (line 770): "A **permanent slot** (`boost`, slot 1) on every hull … **+25 % of the ladder-raised max (Eric)** — `bonus = factor × kin.maxSpeed` post-fold; its reload is an equipment reload, so the RELOAD ladder scales it through the one `cooldownScale` multiply". Rationale: "the speed-boost EQUIPMENT (card-fitted) is deleted, its module becomes the permanent row".
- Detail (line 1102-1107): "Slot 1, permanent, the `boost` equipment row (`isWeapon: false`, the `actSeq` channel, `Shift` → `actSlot: 1`); `boostUntil` is still its only writer. … `bonus = CONFIG.boost.factor (0.25 [DRAFT]) × kin.maxSpeed` … (Eric: ladder-raised max — a capped Torpedo Boat boosts to 68.75 u/s). `boost.reloadMs` (20 s [DRAFT]) is an equipment reload and takes `cooldownScale` through the one multiply (R40: 15 s under a maxed RELOAD)."
- Cooldown readout: slot 1 is an ordinary slot in the 9-slot ammo array, so its reload rides `ammo` like every other slot (line 859). The hotbar is now 9 slots (line 1774). No separate boost HUD element is named. E8 story 14 (line 2421): "Shift boost universal; retire the boost equipment".
- CONFIG (line 1441-1442): "`boost` gains `factor` and loses its card-fitted identity"; `CONFIG.speedBoost` (as equipment) is deleted (line 1443).

### 2.14 Mines without caps + shoot-any-spotted-mine (D25, D29)

- D29 detail (line 1086-1090): "**Deleted (Eric: no ceiling):** `CONFIG.mine.maxLive` and its stat path, `CONFIG.mine.globalCap`, both eviction branches in `addMine`, and the `maxLive` parameter itself. A mine exists until triggered or destroyed, absolutely. The reachable bound is pools × reloads: 20 hulls × (6 naval + 3 captive) per reload window; a perf pin runs `checkMineTriggers` and D25's collector at 500 live mines". `MineView.own` is not named as deleted; the ML's live-mine count on any HUD is no longer capped.
- D25 (line 765): "a burst detonates any mine inside it, **perception-blind** — *'any mine you can see'* is descriptive". Outcomes (line 1001-1003): "`mine` → `detonateMine(mine)` at its own position with its own blast, **perception-blind** (Eric: *'you can see'* is descriptive); chains resolve in the same tick with a visited set". Ownership (line 1006-1009): "Own mines ARE hit by own shells (the design's clear-your-own-field reading)." Masks (line 995-998): deck gun / machine gun / monitor → `hull | mine | decoy`; FLAK → `hull | mine | decoy | ordnance`; missile → `hull | decoy`; torpedoes + captive fish → `hull | decoy`. "`burstVictims` widens to the same kinds, so a burst detonates mines and a flak burst kills fish in its radius."
- Presentation: a detonated mine uses its own blast (the existing mine boom path); struck ordnance "is removed; it emits no boom of its own (ledgered as a presentation gap)" (line 1004-1005).

### 2.15 Ordnance collision (D25) — other UX-visible bits

- Target kinds (line 988-992): `'hull' | 'mine' | 'decoy' | 'ordnance'`; "decoys = 12u squares; mines + ordnance = small polys". Boundary rule 13 (line 1817-1819): ordnance never enumerates entities itself.
- Owner immunity is HULLS only (line 1006-1009); "The owner's fish against the owner's decoy, and own flak against own torpedoes, are NOT exempt — the GDD's `[DRAFT]` reading, carried as-is".

### 2.16 Bots (D31) — anything player-visible

- (line 1117-1120): bot decks are "40 authored cards each in the player format … A bot is seated through the same `addShip(deck)` path as a human and receives the room's pool." Level-zero offer: "Bots receive it identically" (line 922). Mulligan: "the mulligan policy defaults to never" (line 1126). Nothing new is disclosed to players about bots; they consume `observe()` and lose smoked contacts like a client (line 981). Harness-only additions (line 1127-1129, 1473-1476, 2521-2525).

### 2.17 Other wire changes rolled up (What did NOT move / Events)

- (line 1140-1142): "`PROTOCOL_VERSION` bumps once per wire-changing E8 story (catalog content, `InputMsg.held`, the 9-slot ammo array, `OwnShip.{deckLeft, draft, shield}`, the `missile`/`missileU`/`smoke`/`decoys` rows, the reveal's `w`) — never for the harness or the bots."
- Events (line 1453-1456): "`FrameMsg.buoys` is DELETED with the radar buoy; `FrameMsg.decoys?` and `FrameMsg.smoke?` are added … `OwnShip` gains `deckLeft`, `draft?`, `shield?`; `boons` is renamed `cards`. `InputMsg` gains `held`. `SpendMsg` gains the `MULLIGAN_CHOICE` sentinel and loses `HEAL_CHOICE`."
- Client flow (line 1457-1459): "`net/` mirrors the new fields into `state.ts`, `sim/prediction.ts` reads `draft`, `render/` reads the two channels and the 9-slot ammo array. No render module drives net or sim."
- Deleted types (tree line 1745): "− BuoyView, HEAL_CHOICE". Radar buoy deletion (line 1096-1098): "equipment, `BuoyView`, `buoyGate`, the `gun`/`jamming` doctrines, `ownBuoyScopeBlips` and the `src` blip tag — is deleted".
- Hull repair (line 890-893): "today's `spendHeal` body moves into `hullRepair.activate` (instant + pooled, `tickRepairs` unchanged, afloat-only as today, so a sinking hull can no longer heal". The free per-level auto-heal stays (line 1444-1447, 2453-2454).

---

## 3. RESULTS + HISTORY data shapes

### 3.1 The per-match record (server-only; the source of history)

- `MatchRecord` (Novel Pattern 7, line 2065-2071):
  ```ts
  export interface MatchRecord {
    matchId: string; mode: 'standard' | 'solo'; startedAt: number; endedAt: number;
    participants: Array<{ userId: string | null; role: ShipRole; cls: ClassId; placement: number;
      kills: number; brought: LineId[]; drawn: Array<{ lineId: LineId; atMs: number }>;
      taken:  Array<{ lineId: LineId; atMs: number }> }>;
  }
  ```
  plus (tree line 1756): "`matchRecord.ts` # (E9) + pool: LineId[] on the match row; participants' brought/drawn/taken unchanged".
- Tables (D12, line 627-632): "`matches (id, mode, started_at, ended_at, roster_size, winner_class)` · `match_participants (match_id, user_id nullable FK ON DELETE SET NULL, role, class, placement, kills, deck_brought jsonb[lineId], deck_drawn jsonb[{lineId, atMs}], deck_taken jsonb[{lineId, atMs}])` — the `atMs` stamps are what the history route prints as `T+mm:ss`."
- Bots' and anonymous captains' decks are recorded with `user_id = NULL` (line 726-727).

### 3.2 What the results screen can show

- **MatchRecord is NEVER ResultsMsg** (D18, line 718-721): "the wire results row is broadcast to every client, so a deck field added there would hand every enemy deck to every player … A pin test asserts `ResultsMsg` carries no deck field." Consistency rule (line 2131): "MatchRecord ≠ ResultsMsg | server-only type; the wire results row carries no deck field".
- E8 story 9 (line 2416): "Own-deck results + the per-match record | `game/matchRecord.ts` (+ `pool`), `ui/results.ts` | E9 Pattern 7; D22". So `ui/results.ts` shows the player's OWN deck outcome — derivable client-side from `you.cards` (own applied cards, line 815-816) and the offers the client saw; the architecture does not specify a new wire field for it, and enemy decks can never appear.
- **The match consumable pool is NOT exposed to players.** D22 (line 909-913): "Hidden: it never rides the wire, never appears in `WelcomeMsg`, and reaches the store only as `MatchRecord.pool` on the match row (Eric's metrics); a player's own history shows the pool cards they DREW and nothing else — GDD note 20(a)'s reading, implemented as a filter on the record, ledgered as unruled." Logging (line 1425-1426): `match.pool { matchId, count }` "count only, NEVER contents".

### 3.3 What match history returns to the player

- D16 detail (line 685-687): "`GET /api/account/history?cursor=` returns the caller's own `match_participants` rows (brought / drawn / taken, placement, kills, T+ stamps). Enemy decks are never returned by any route — the query is keyed on the caller's user id, not on match id." Cursor-paged (tree line 1639). Validation (line 2323): "own history to the player, every deck to Eric (D16 + `match_participants`)".
- Drawn-pool filter is UNRULED (line 2455-2457): "GDD note 20(a): a player's history shows the pool cards they drew and nothing else — the facilitator's reading, implemented as a filter on `MatchRecord`, awaiting Eric."
- Progression math available for display (line 1618, 1638): level(xp), tokensAvailable; XP per placement with a Solo-vs-AI discount (`soloXpFactor`, line 723-725, 1356-1357).

---

## 4. CONSTRAINTS on UX

### 4.1 Single service / Story 7-7 not pre-empted

- D9 (line 552): "**In-process module** `server/src/account/`, mounted once in `app.config.ts`, same origin as the game … Zero new deployables; Story 7-7 stays deferred". Executive summary (line 86-87): "the store IN-PROCESS on the one Render service (Story 7-7 stays deferred)". What did NOT move (line 734): "Story 7-7 stays deferred in full; no new deployable, no CORS, no cross-origin cookie."
- Sign-in URLs are same-origin: HTTP paths `/api/account/<noun>`, auth at `/auth/*` (line 1685), admin at `/admin` + `/admin-api` (line 678). OAuth redirect URIs "differ per host" (line 636, 1350). Ledgered for 7-7's revival (line 2380-2382): "the account API is same-origin HTTP with a Bearer token, so option A (full split) needs CORS on `/api/*` and `/auth/*`; options B and C need nothing."
- Staging: "Staging carries its own database and OAuth apps so the account layer is QA'd on the dev host — this is deliberately NOT the ads/analytics blind spot." (line 573-575). On dev the admin console sits BEHIND the staging password page (line 679-681).

### 4.2 Colyseus 0.18 upgrade

- D10 (line 553): "**Upgrade Colyseus 0.17 → 0.18** (all packages, both sides) as the FIRST work item of E9". Detail (line 582-595): pinned versions incl. `@colyseus/schema` 5.0.27 and `@colyseus/sdk` 0.18.2 on the client; "Ships as its own PR with `PROTOCOL_VERSION` bumped (the schema encoder changed) and a full headless-smoke pass BEFORE any account code lands. A framework upgrade and a feature never share a PR." Validation (line 2327): "E9 has no story for the 0.18 upgrade (D10) — `gds-create-epics-and-stories` must add it as story 0". Deck validation (line 2402): "E8 builds on the same runtime E9 does".

### 4.3 What stays DOM vs Pixi

- DOM: sign-in row, deck editor, history, settings' DELETE ACCOUNT control (tree line 1657-1660; mapping line 1676 "DOM chrome only; nothing tactical"); the refit window (`ui/upgradeMenu.ts`, line 1778) gains the mulligan and greyed cards; `ui/results.ts` (line 2416).
- Pixi/render: `hotbar.ts` 9 slots (line 1774), `hud.ts` deckLeft counter and the removed DAMAGE CONTROL rail (line 1775), `projectiles.ts`, `smokeScreen.ts`, `decoys.ts`, `weaponArc.ts` / `aimPreview.ts` (line 1770-1777).
- Client one-way flow (line 1369-1372, 1457-1459): `net/account.ts` is the only writer of the account slice; render never drives net or sim.

### 4.4 Performance budgets / pins for the new surfaces

- Smoke (line 982-984): "A perf pin runs perception at 20 observers × 200 puffs against the 50 ms tick." Live puffs ≤ stacks × `layMs / puffIntervalMs`.
- Mines (line 1088-1090): perf pin at 500 live mines; harness reports live-mine peak.
- Stream flash (line 1050-1052, 2463-2465): 80 `mz`/s at the emitter with 20 bots; "`flashBudget.ts` caps the RENDER"; wire/perception cost unmeasured.
- Metrics (line 1463-1465): "`/metrics` gains `deck: { picks, mulligans, stockRefused, exhausted }`, `world: { minesLivePeak, smokeLivePeak, streamShellsPerTick }`".
- Owed at build (line 2473-2475): "perception at 20 observers × 200 puffs; `checkMineTriggers` + the collector at 500 live mines; the parity test at `draft = 0`."
- Tick law (line 1323-1325, 1419-1421): nothing on the tick awaits the database; `stepSmoke` and the draft read may not "allocate per observer".

### 4.5 PROTOCOL_VERSION notes

- Account amendment (line 735-737): "`PROTOCOL_VERSION` moves for the 0.18 schema encoder (D10) and again when E8 adds `deckId` and consumable slot state to the wire — never for the account API, which is HTTP." Wire (line 1373-1374): "the account API is HTTP JSON and is NOT part of `PROTOCOL_VERSION`; its own contract is the endpoint path set, pinned by test."
- CONFIG blocks (line 1358-1360): "`deck` and `progression` … ride `WelcomeMsg.config`, and bump `PROTOCOL_VERSION` only when the client READS them (the `CONFIG.fleet` precedent)."
- Deck amendment (line 1140-1142): one bump per wire-changing E8 story (list in 2.17). Catalog content is wire contract (line 1432-1434). Read at `HEAD` = PV 49 (line 752, 2481).

### 4.6 "The client must" / "the HUD must" statements (collected)

- "The client shows the reason and offers SAIL STARTER DECK as an explicit act." (line 1317)
- "the client greys the card with the same predicate. No `denied` view is added" (line 888-889)
- "the client, running the same shared predicates (`canStock`, `MULLIGAN_CHOICE` gating), never presents the action" (line 1411-1412)
- "The client replays `you.cards` through the same function to rebuild `equipmentId` per slot and reads `n` from `ammo`" (line 863-865)
- "the client runs the shared `puffRadius`" (line 977-978) — no radius on the wire.
- "`mouse.ts` sets `held` = pointer down inside the primed stream's arc" (line 1032)
- "`prediction.setDraft(you.draft)` … replay applies the latest scalar to every un-acked tick" (line 949-951)
- "the digit's meaning is the window's state, a client concern" (line 874-875)
- "the home screen renders no SIGN IN" without accounts (line 572); SIGN IN "rendered only when liveness says account:true" (line 1657)
- "screens read `/api/account/me`" (line 2135)
- "Settings gains a DELETE ACCOUNT control with a confirm." (line 673)
- "the client switches to them" [account settings] (line 560); seed-on-first-sign-in / overwrite-later / write-both / sign-out-leaves-local (line 697-700)
- Privacy copy: "Every sentence above is a claim about shipped behaviour — `policyCopy.ts`'s standing rule." (line 2350-2351)

### 4.7 Things the architecture forbids the client from doing

- Supplying a deck: "A client-supplied `deck` key is REJECTED by the sanitizer at BOTH doors" (line 712-713); Boundary 10 (line 1695-1697).
- Learning the pool or any enemy deck (line 909-913, 718-721, 686-687).
- Reading the reveal's `w` as identity — it "carr[ies] no range-derivable value and no identity" (line 1042-1043).
- Reading a non-owner decoy's hp (line 1093-1094).

---

## 5. ERIC RULINGS quoted in these amendments

### 5.1 The Deck amendment — the five decisions marked (Eric)

Scope statement (line 749-751): "Decisions marked **(Eric)** are rulings he took live on 2026-09-10; the rest are recommendations he accepted." The five (Eric)-marked decisions and their verbatim marks:

1. **D25 — Collision (line 765; detail line 1001-1003):** "a burst detonates any mine inside it, **perception-blind** — *'any mine you can see'* is descriptive" … "**perception-blind** (Eric: *'you can see'* is descriptive)". Only the fragment *"you can see"* is quoted from Eric.
2. **D27 — Signals (line 767; detail line 1045-1048):** "**the machine-gun stream flashes PER SHELL (Eric)**" … "**Gun-shell rules everywhere (Eric):** `sp` (own splash) for the gun family AND the missile and monitor (never torpedoes); `hc` exactly one per shell resolution … `mz` per shell for every gun-family weapon and the missile, **including the STREAM (Eric)**". Novel Pattern 13 (line 2234): "stream shells emit `mz` per shell (Eric)". No verbatim sentence from Eric is quoted.
3. **D28 — Damage gate (line 768; code line 1071):** "SHIELD BLOCK absorbs there, **from every source (Eric)**" … "`this.absorbShield(victim, amount, this.now);   // Eric: every source, storm and burn included`". No verbatim sentence.
4. **D29 — Mines & decoys (line 769; detail line 1086, 1093):** "**No per-player cap and NO room ceiling (Eric)**" … "**Deleted (Eric: no ceiling):**" … "`DecoyView { id, x, y, own, hp? }` — `hp` present ONLY when `own` (Eric)". The quoted principle *"A mine exists until triggered or destroyed"* (line 769) is presented in quotes but not attributed to Eric by name (line 1087 restates it without quotes as "absolutely").
5. **D30 — Shift boost (line 770; detail line 1105-1106):** "**+25 % of the ladder-raised max (Eric)**" … "(Eric: ladder-raised max — a capped Torpedo Boat boosts to 68.75 u/s)". No verbatim sentence.

Other Eric attributions inside the Deck amendment (not (Eric)-marked decisions):
- D19 (line 834-835): the fractional-step floor — "nothing shows until a whole completes (Eric's standing rule)".
- D22 (line 911): `MatchRecord.pool` "(Eric's metrics)".
- D23 (line 936): *"trails merge"* is quoted (source not named; reads as the GDD/catalog's phrase).
- Headline notice (line 56): "Rulings Eric took live on 2026-09-10 are marked **(Eric)** in place."

### 5.2 The Account Store amendment — Eric rulings

- **D7 superseded (line 550):** "Retired by deck model v3 (Eric, 2026-09-03: accounts ship with the deck, *'go big or go home'*)".
- **Scope (line 541-542):** "GDD open note 16, delegated to this workflow with no added design constraint — Eric, 2026-09-03".
- **D10 (line 553):** "Eric 2026-09-09: *'keep everything CURRENT'*".
- **D13 (line 556, 648-651):** "Eric's pick over a hand-rolled client"; "**The `upgradingToken` branch is decided (Eric 2026-09-09): a caller already holding a valid token who completes OAuth with a SECOND provider gets that identity LINKED to the same user**".
- **D16 (line 559):** "Eric 2026-09-09: *'I DO want @colyseus/admin for ME'*".
- **D17 (line 560, 691-694):** "**Two states, nothing in between** (Eric 2026-09-09)"; verbatim: *"Anonymous accounts don't get anything but the starter deck. If someone wants an account THEN AND ONLY THEN do they get progression and deckbuilding … leave settings connected to localstorage. BUT if someone DOES have an account, then we can switch them to their database account settings."*
- Novel Pattern 9 (line 2111-2112): "Eric's ruling — anonymous is localStorage as today; signed in switches to the account".

---

## 6. OPEN / DEFERRED items and [DRAFT] cells touching presentation

### 6.1 [DRAFT] cells (every one is a CONFIG dial; "none is invented here", line 1448-1449)

- `CONFIG.wake.draft.{lift, halfWidthU}` — "**`[DRAFT]`, Eric's to set, no placeholder in this document.**" (line 938-939; also 1439).
- `CONFIG.smokeScreen.expandMs [DRAFT]` (line 963) — governs how fast a puff visibly grows 40u → 60u.
- `CONFIG.boost.factor (0.25 [DRAFT])` and `boost.reloadMs (20 s [DRAFT])` (line 1105-1107).
- Shield: "a fresh 100 / 10 s — no stacking, `[DRAFT]`" (line 1080); "no tell to the shooter … a second shield replaces rather than stacks. Both defaults, both `[DRAFT]`" (line 2466-2467).
- Machine gun: "*'6 s of fire per pool, 15 s reload'* reads as a MAGAZINE reload; both readings are `[DRAFT]` numbers" — the `ammo.refill: 'round' | 'magazine'` switch is "reserved, not built" (line 1029-1031, 2465-2466). Affects the hotbar ammo readout's behaviour.
- `CONFIG.missile.contactDamage` — "a build-time DRAFT the catalog names" (line 1013-1014).
- Own fish vs own decoy / own flak vs own torpedoes NOT exempt — "the GDD's `[DRAFT]` reading, carried as-is" (line 1007-1009, 2468-2469).
- Smoke self-hiding — "The GDD's `[DRAFT]` 'hides its own occupant' is therefore not a rule but a consequence" (line 975-976).
- Progression: `tokenPrice [DRAFT]`, `matchesToCatalog` "the OPEN intent dial, no placeholder" (line 1356-1358, 2329).
- Validation's list (line 2403-2404): "turning step, boost numbers, machine-gun numbers, flak base, captive pool/clock, shield scope now RULED, smoke self-hiding now a consequence, draft lift + width, the magazine reading of the stream's ammo".

### 6.2 Ledgered / unruled items with a presentation face

- **Decoy on radar** (line 1094-1095, 2468): "Whether a decoy PAINTS on radar is unruled: the default is that it does".
- **Shield tell** (line 1061-1062, 2466-2467): shooter gets no tell — "Ledgered as a design question; the default is the quieter one."
- **Star shell into smoke** (line 973, 2469-2470): "a design question if a star shell should not see into smoke."
- **Two presentation gaps** (line 2471-2472): "A puff is visible with island-only LOS so it never vanishes around you; a destroyed torpedo or missile emits no boom of its own — two presentation gaps."
- **The reveal's `w` field** is a declared disclosure widening (line 1042-1044, 2460-2462): "a sighted shell now names the weapon that fired it. Needed to draw a tracer vs a shell vs an arc".
- **History pool filter** (line 911-913, 2455-2457): what of the pool the player's history shows — awaiting Eric.
- **GDD note 19** (line 1110-1113, 2450-2452): LIGHT TORPEDO 45 u/s vs a boosted TB at 68.75 u/s — "Eric re-scopes the law or moves the number".
- **GDD note 14** (line 1444-1447, 2453-2454): the free per-level auto-heal stays built until the balance pass.
- **Stream flash cost** (line 2463-2465): unmeasured.
- **Draft disclosure** (line 953-955): accepted and ledgered — the scalar tells you a wake is under you even when the hull is island-hidden.
- **E8 ordering** (line 2400-2401, 2476): D25 + D28 need a home before stories 5/12/13/15.
- Account side (line 2368-2382): drizzle RC; six `sync: false` secrets to set before merging; admin password hash; admin on the public host; 7-7 revival CORS line.
- **Level-zero guarantee vacuous for a gunboat deck** (line 917-919): a player with no usable cards at 0:00 sees a plain draw — "pinned so nobody 'fixes' it into a reroll."

---

## 7. Items explicitly delegated to UX / called "presentation" / "the client's call"

- "the digit's meaning is the window's state, **a client concern**" — `1`–`4` dual role (D20, line 874-875).
- "the ledgered *killed-vs-expired is indistinguishable* thread closes for the one buoy that survives" (D29 rationale, line 769) — the decoy's owner-only hp readout answers the old BuoyView-has-no-HP presentation gap (`render/decoys.ts` "owner-only hp readout", line 1772).
- "it emits no boom of its own (**ledgered as a presentation gap**)" — struck ordnance (line 1004-1005); restated as "two presentation gaps" with the puff-visibility rule (line 2471-2472).
- "wake drafting's **prediction seam** (D23 — the named delegation)" and "smoke as a sight occluder incl. the `[DRAFT]` self-hiding (D24 — the named delegation)" — Validation GDD coverage (line 2399-2400) names these two as the GDD's delegations to architecture, now answered; their on-screen reading is not specified.
- "the client greys the card with the same predicate" (line 888) — the ONLY presentation instruction for a refused pick.
- "The client shows the reason and offers SAIL STARTER DECK as an explicit act." (line 1317) — copy/placement unspecified.
- Deck editor "legality feedback via shared deckRules" (line 1658) — form of feedback unspecified.
- "Display names live only in client copy." (D14, line 665) — every card name / tier name is a client-copy concern; ids are camelCase and rename-proof.
- "a `NullWriter` is what a disabled module injects, so rooms carry no `if (accountEnabled)`" (line 2077-2078) and "the home screen renders no SIGN IN" (line 572) — the absence of accounts is a render decision keyed on `/liveness`.
- No HUD readout is named for: draft (2.12), chaff active (2.8), the mulligan control's key/copy (2.4), the held-stream state (2.6), the shield on other hulls (2.10). Each is therefore UX's to specify within the wire facts above.

---

## Summary

Section 1 (client-facing surfaces) yields 8 sub-surfaces with 34 cited facts: an OAuth-only popup/postMessage sign-in with a localStorage Bearer JWT (30 d), a liveness-gated SIGN IN row, a DOM deck editor with client-side legality via the shared `deckRules` (40 cards, ≤3 equipment lines, caps, ownership), several decks per hull selected by `deckId` at join, a cursor-paged own-history route, an Eric-only `/admin`, a self-serve DELETE ACCOUNT in Settings, and the two-state settings source. Section 2 (on-the-water wire/state) yields 17 sub-topics with ~60 cited facts: the 9-slot loadout rebuilt by replaying `you.cards`, `deckLeft`, the countdown level-zero offer + `MULLIGAN_CHOICE`, silent full-slot refusal (grey, no denial), the `held` stream with one arc-exit denial, `SmokeView`/`sightClear`, chaff as wire-indistinguishable fakes, `DecoyView` with owner-only hp, `OwnShip.shield` with no shooter tell, per-shell `mz`/`hc`, `OwnShip.draft` with no readout, the permanent Shift boost at slot 1, uncapped mines, and PV bumps per wire story. Section 3 (results/history) yields 3 sub-topics with 9 facts: the `MatchRecord` shape (brought/drawn/taken with `atMs`, plus `pool`), the pinned absence of any deck field on `ResultsMsg`, the hidden pool, and the history route's contents. Section 4 (constraints) yields 7 sub-topics with ~30 facts: single-origin URLs under a deferred 7-7, the 0.18 upgrade as story 0, the DOM/Pixi split, four perf pins, PV rules, 13 "the client must" statements and 4 prohibitions. Section 5 lists the five (Eric)-marked deck decisions (D25, D27, D28, D29, D30) with their exact marks, 3 further Eric attributions in the deck amendment, and 7 Eric rulings/quotes in the account amendment (D7, scope, D10, D13, D16, D17, NP9). Section 6 lists 10 [DRAFT] cells and 14 ledgered/unruled items with a presentation face. Section 7 lists 10 items the architecture explicitly leaves to the client/UX plus 5 HUD readouts it names no home for.
