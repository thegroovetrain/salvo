// The tone CATALOG + the pure cue math that decides which tone an event earns
// and how it sits in the mix — no AudioContext import, fully unit tested.
// audio/context.ts is the thin AudioContext adapter that consumes this table;
// kept separate so the mapping/exhaustiveness is testable without a browser
// audio stack. Envelope shape follows DESIGN.md's carried-forward
// playTone(freqStart, freqMid, freqEnd, duration, volume, type) approach.
//
// NOT "PURE" IN THE `shared/` SENSE, and the header used to claim otherwise:
// Story 4.7 gave this file a VALUE import of shared `CONFIG` (the `damageBands`
// thresholds behind `hpBandEdge` — read, never restated) and one of client
// `CLIENT_CONFIG` (the world cue's gain floor and pan cap). Both are constant
// tables with no I/O and no cycle, and render/gunneryFeed.ts set the precedent
// for a pure rules module reading CLIENT_CONFIG. Pure of SIDE EFFECTS and of the
// audio stack; not free of configuration.

import { CONFIG, type BoonRarity, type EquipmentId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

/** Every distinct cue the client can play. */
export type ToneId =
  | 'fireGun'
  | 'fireTorp'
  | 'fireMine'
  | 'fireBroadside'
  | 'fireStarShells'
  | 'placeDecoy'
  | 'denied'
  | 'damage'
  | 'kill'
  | 'point'
  | 'fitCommon'
  | 'fitRare'
  | 'fitExclusive'
  | 'heal'
  | 'burn'
  | 'hitCall'
  | 'slowed'
  | 'dazzled'
  | 'sink'
  | 'bounty'
  | 'aggroLock'
  | 'aggroRelease'
  // --- the SOUND MAP (Story 4.7): things that happen out in the world --------
  | 'gunReport'
  | 'impact'
  | 'splash'
  | 'sunkWitness'
  | 'hpHurt'
  | 'hpCritical'
  | 'tick'
  | 'matchStart'
  | 'stormWarn'
  | 'telegraphUp'
  | 'telegraphDown';

export interface ToneSpec {
  freqStart: number; // Hz
  freqMid: number; // Hz — reached at 40% of duration
  freqEnd: number; // Hz — reached at duration
  duration: number; // s
  volume: number; // 0..1 peak gain
  type: OscillatorType;
  /** Layer a short filtered noise burst under the tone (cracks/whooshes). */
  noise?: boolean;
}

/** Max tone duration (s) — "each ≤ ~150ms except sink (~400ms)" per the plan. */
export const MAX_TONE_S = 0.15;
export const MAX_SINK_TONE_S = 0.45;

export const TONES: Record<ToneId, ToneSpec> = {
  // Guns: sharp crack — fast downward chirp + a noise transient.
  fireGun: { freqStart: 900, freqMid: 320, freqEnd: 150, duration: 0.09, volume: 0.5, type: 'square', noise: true },
  // Torpedo: low whoosh, longer than the gun crack but still brief.
  fireTorp: { freqStart: 180, freqMid: 140, freqEnd: 90, duration: 0.14, volume: 0.4, type: 'sawtooth', noise: true },
  // Mine: soft low plop, no noise layer (a drop, not a launch).
  fireMine: { freqStart: 220, freqMid: 150, freqEnd: 90, duration: 0.12, volume: 0.4, type: 'sine' },
  // Broadside barrage (Story 7-5 wave 2, inherited from the cannon it replaced):
  // a HEAVIER gun report — lower + more body than the gun crack, with a bigger
  // noise transient (the Battleship's big shells, several at once).
  fireBroadside: { freqStart: 520, freqMid: 200, freqEnd: 80, duration: 0.14, volume: 0.55, type: 'square', noise: true },
  // Star shell (Story 1.7): a distinct utility POP — a bright airy rising whistle
  // (a flare climbing into the sky), no heavy noise: not a gun, not a fish.
  fireStarShells: { freqStart: 360, freqMid: 640, freqEnd: 900, duration: 0.13, volume: 0.4, type: 'triangle' },
  // Decoy buoy placement (Story 1.8): a hollow water "bloop" — same soft sine
  // drop family as the mine plop but pitched a touch higher + brighter so
  // seeding a buoy is audibly distinct from dropping a mine.
  placeDecoy: { freqStart: 340, freqMid: 260, freqEnd: 160, duration: 0.13, volume: 0.38, type: 'sine' },
  // Denied press (Story 1.10 — FR12 "never silence"): a curt low square BLAT,
  // pitched fast downward with no noise layer — reads as a refusal, distinct
  // from every success cue (the gun family cracks start ≥520Hz with noise, the
  // ability drops are soft sines, damage is a triangle thud). Fired ONLY via
  // the exactly-one-feedback path (predicted denial OR an unmatched server
  // denial — weapons AND abilities), mute-aware like every tone (Audio.play).
  denied: { freqStart: 240, freqMid: 110, freqEnd: 80, duration: 0.09, volume: 0.42, type: 'square' },
  // Taking damage: dull triangle thud.
  damage: { freqStart: 220, freqMid: 160, freqEnd: 110, duration: 0.1, volume: 0.45, type: 'triangle' },
  // Kill confirm: short ascending chime.
  kill: { freqStart: 500, freqMid: 900, freqEnd: 1200, duration: 0.15, volume: 0.5, type: 'triangle' },
  // Point earned (banked, unspent): one bright continuous rise — a "ping" that
  // reads as a reward-available prompt, distinct from the upgrade two-note.
  point: { freqStart: 700, freqMid: 1100, freqEnd: 1500, duration: 0.12, volume: 0.4, type: 'triangle' },
  // --- THE FIT FAMILY (Story 2.9) — one template, three weights -------------
  // A boon FITTED. All three are the retired `upgrade` two-note verbatim in
  // shape — flat first note, stepping up a fourth at the 40% mark and holding
  // ("do-mi", distinct from the kill chime's continuous glide and the point
  // ping) — so the family reads as ONE cue heard three ways. Only the WEIGHT
  // moves with the card's tier: the root drops, the note lengthens, and the
  // level rises as the tier climbs, which is how a heavier instrument sounds
  // without becoming a different instrument. Draft specs (the draft-copy rule);
  // every one has a visual twin in audio/twinMap.ts.
  fitCommon: { freqStart: 660, freqMid: 880, freqEnd: 880, duration: 0.1, volume: 0.36, type: 'triangle' },
  fitRare: { freqStart: 550, freqMid: 733, freqEnd: 733, duration: 0.13, volume: 0.45, type: 'triangle' },
  fitExclusive: { freqStart: 440, freqMid: 587, freqEnd: 587, duration: 0.15, volume: 0.52, type: 'triangle' },
  // --- DAMAGE CONTROL (cycle 46) ---------------------------------------------
  // A banked level spent on the heal. The fit family's two-note INVERTED: where
  // a fit steps UP a fourth and holds (a permanent thing acquired), this settles
  // DOWN onto a held root — a hull steadying, not a capability gained — so the
  // two can never be confused even though both answer the same keypress family.
  // A soft sine, deliberately the roundest voice in the catalog: it is neither a
  // gun (square/noise), nor damage (triangle thud), nor a refusal (the curt
  // square blat). It sits between the fit weights in pitch and under all of them
  // in level, because the spend it confirms buys survival rather than power.
  // Draft spec, UNRATIFIED (the standing draft-copy rule); the visual twin is
  // the HP rail's jump + its incoming band (audio/twinMap.ts).
  heal: { freqStart: 620, freqMid: 466, freqEnd: 466, duration: 0.13, volume: 0.34, type: 'sine' },
  // --- THE VICTIM TELLS (Story 2.9) — what a doctrine did TO YOU --------------
  // Burning: a damage tick taken inside an enemy INCENDIARY zone. Deliberately
  // the damage thud's quieter, airier sibling — same triangle family, pitched
  // under it with a noise hiss (fire, not impact) — because it IS damage, only
  // a DoT tick rather than a slam (the shake is scaled down to match).
  burn: { freqStart: 150, freqMid: 120, freqEnd: 90, duration: 0.11, volume: 0.32, type: 'triangle', noise: true },
  // --- THE HIT CALL (Story 4.3, amendments 17/18) ----------------------------
  // Something YOU fired or laid connected — possibly at a hull you cannot see.
  // A MUFFLED BOOM: the lowest tone in the catalog, a soft triangle that punches
  // down to 85Hz in the first 40% and then ROLLS BACK UP as it fades, which is
  // what a detonation sounds like from far enough away that the crack is gone
  // and only the swell reaches you. Deliberately no noise layer — a transient
  // would make it a nearby crack, and the whole character of this cue is
  // distance.
  //
  // WHY IT CANNOT BE MISTAKEN FOR ITS NEIGHBOURS, all three of which are things
  // happening TO you while this is something happening FOR you:
  //   • the CONTOUR is unique in the low register — damage (220→110), burn
  //     (150→90) and stormWarn (160→70) all fall monotonically to their floor
  //     and stop; this one dips and comes back, so it lands as a swell, not a
  //     hit;
  //   • it starts BELOW all three (130 < 150 < 160 < 220), so even the contour
  //     aside it sits in its own octave;
  //   • it is not the storm's sawtooth growl, and unlike burn it carries no
  //     hiss.
  // Draft spec (the draft-copy rule); the visual twin is the Hit Call bloom
  // (audio/twinMap.ts), which stands alone — with Story 4.1 deferred there is no
  // listening ring to back it up, so the bloom is the whole muted answer.
  hitCall: { freqStart: 130, freqMid: 85, freqEnd: 120, duration: 0.12, volume: 0.42, type: 'triangle' },
  // Fouled (PROP-FOULING): a sagging low sine — the engine losing revs. Falls
  // like the denied blat but soft and round, never that curt square refusal.
  slowed: { freqStart: 300, freqMid: 190, freqEnd: 130, duration: 0.14, volume: 0.34, type: 'sine' },
  // Dazzled (DAZZLE BURST): a bright glassy sting that washes UP and thins out —
  // the optical opposite of the fouled sag, and audibly nothing like the star
  // shell's own launch whistle (that one is the firer's, this one is the
  // victim's: shorter, higher, no body).
  dazzled: { freqStart: 900, freqMid: 1400, freqEnd: 1250, duration: 0.12, volume: 0.34, type: 'sine' },
  // Own sink: the one long tone — alarm warble sliding down into a low boom.
  sink: { freqStart: 320, freqMid: 180, freqEnd: 60, duration: 0.4, volume: 0.55, type: 'sawtooth' },
  // --- THE BOUNTY (Story 4.6, Eric ruling 2026-08-10) -------------------------
  // The throne landed on YOU. A two-tone KLAXON: a square that drops a fifth at
  // the 40% mark and comes straight back up, which is the shape of an alert
  // horn rather than of any event in the catalog. It fires on exactly one
  // occasion — the local player taking the bounty — so it has to read as a
  // status change, never as an action landing.
  //
  // WHY IT CANNOT BE MISTAKEN FOR ITS NEIGHBOURS: it is the only V-CONTOURED
  // cue in the HIGH register (hitCall dips and returns two octaves below it,
  // at 130Hz, on a soft triangle), and the only NON-FLAT square up there — the
  // tick (700 flat) and both telegraph detents (1200/800 flat) are the
  // register's other squares and none of them moves in pitch. Everything else
  // near this pitch glides one way and stops: kill rises 500→1200, point
  // 700→1500, dazzled washes up and thins. Draft spec (the standing draft-copy
  // rule); the visual twin is the toast + the bar's own BOUNTY register.
  bounty: { freqStart: 990, freqMid: 660, freqEnd: 990, duration: 0.15, volume: 0.46, type: 'square' },
  // --- THE AGGRO STINGS (Story 5.6, epic-5 amendment 40) ----------------------
  // A PvE fleet ship has taken you as its target — or has just lost you. Eric
  // asked for BOTH edges to be *"very visually obvious"*, and the audio follows
  // the same pairing: the two cues are the SAME contour played in opposite
  // directions, so they are a matched pair by construction rather than by
  // adjective, exactly as the bracket's one `spread` channel runs down on
  // acquire and up on release.
  //
  // THE LOCK is a hard ASCENDING triangle sting — a mid-register snap UP that
  // stops dead. It is not the klaxon (that square shape is the bounty's alone
  // and fires on a status change about YOU, not about a threat), it is well
  // below `dazzled`'s glassy wash and well above `hitCall`'s 130Hz thud, and it
  // rises where `slowed` sags. Deliberately SHORTER and quieter than `damage`:
  // being aimed at is not being hit, and the catalog must not let the two
  // trade places in a fight.
  aggroLock: { freqStart: 420, freqMid: 700, freqEnd: 760, duration: 0.11, volume: 0.36, type: 'triangle' },
  // THE RELEASE is the same contour inverted and softened — a descending sine
  // that thins out, *"a distinct, softer descending cue"* (amendment 40). Lower
  // peak volume than its own lock, because losing a hunter is relief rather
  // than an event demanding a reaction; sine rather than triangle so the two
  // differ in TIMBRE as well as in direction and survive a noisy mix.
  aggroRelease: { freqStart: 700, freqMid: 460, freqEnd: 340, duration: 0.13, volume: 0.26, type: 'sine' },
  // --- THE SOUND MAP (Story 4.7, Eric ruling 2026-08-10) ----------------------
  //
  // Six cues for things that happen OUT IN THE WORLD rather than to you — the
  // first entries in this catalog that are not self-cues. Every one rides an
  // event the client is ALREADY receiving through the existing perception
  // boundary (`mz`, `boom`, `burst`, `sp`, a witnessed `sunk`, own-HP band
  // crossings), so a modified client that deleted the whole family would learn
  // nothing it did not already have: no new wire field, no new event kind, no
  // new perception exception, no server change. That is precisely why these are
  // TONES and not a sensor — audible enemy gunfire that told you something new
  // would be a passive acoustic sensor, which is the sonar family Eric tabled
  // until after public beta.
  //
  // !!! UNRATIFIED IMPLEMENTER DRAFT — EVERY TIMBRE BELOW AWAITS ERIC'S EAR !!!
  // Game feel is never invented without Eric (the standing house rule; the
  // `heal` tone above is the precedent and carries the same stamp). What is
  // reviewable here is the SEPARATION ARGUMENT written against each spec — which
  // register a cue occupies, which contour it traces, which voice it speaks
  // with, and which neighbour it was most at risk of blurring into. The exact
  // numbers are a first draft for a listening pass; retuning any of them is
  // Eric's call and costs nothing structural, because nothing outside this table
  // reads a frequency.
  //
  // WHY THE REGISTERS ARE LAID OUT THE WAY THEY ARE, in one line: the pair that
  // must never be confused is HIT vs MISS — bracket-and-walk is the whole point
  // of the Gunnery Conversation (Story 4.3) — so `impact` was placed at the
  // bottom of the catalog and `splash` near the top, opposite ends, opposite
  // voices, opposite materials. Everything else was placed around that spine.
  //
  // ANOTHER ship's gun, heard from where you are. It is `fireGun` after the air
  // has had its way with it: distance eats the high harmonics first, so the
  // report that reaches you is DARKER (a triangle, none of the square's hard
  // edge), DULLER (starts at 320 where your own crack starts at 900) and SHORTER
  // (0.08s — at range you get the thump, not the snap). The noise transient
  // survives, quietly, because a report IS a transient; what distance changed is
  // its colour, not its nature.
  //
  // WHY IT CANNOT BE MISTAKEN FOR ITS NEIGHBOURS:
  //   • `fireGun` (900→320→150, square + noise) — three channels move at once:
  //     the start pitch drops to a third, the voice loses its edge, and the level
  //     drops 0.5 → 0.3. Your own crack also arrives with a reload timer
  //     restarting under your hand; this one never does.
  //   • `damage` (220→160→110, triangle, no noise) was the real risk, being the
  //     same family in the same octave. This starts ABOVE it (320 > 220) and ends
  //     BELOW it (90 < 110) — a 3.6× sweep against damage's 2× — is shorter, is
  //     quieter, and carries a transient the thud deliberately has not. Damage
  //     also lands centred with a screen shake; this is PANNED, out at the flash
  //     already drawn on your screen.
  //   • it is not `burn` (150 start, a hiss under a DoT tick), an octave below.
  gunReport: { freqStart: 320, freqMid: 170, freqEnd: 90, duration: 0.08, volume: 0.3, type: 'triangle', noise: true },
  // Ordnance CONNECTING or detonating out in the world — a shell into a hull, a
  // gun shell bursting at its clicked point. The heaviest short cue in the
  // catalog: a sawtooth (every harmonic — the ripping voice the alarm family
  // already speaks with) collapsing 4.3× in pitch behind a hard transient.
  //
  // WHY IT CANNOT BE MISTAKEN FOR ITS NEIGHBOURS:
  //   • `hitCall` (130→85→120, soft triangle, NO transient) will sometimes fire
  //     in the SAME FRAME as this one, so the separation had to be total: this
  //     starts twice as high, speaks in the grittiest voice in the catalog
  //     against the softest, carries the transient that cue deliberately refuses,
  //     and falls monotonically where hitCall dips and swells back. hitCall says
  //     "YOU connected" (self-private, centred); this says "something detonated
  //     THERE" (panned to the mark).
  //   • `denied` (240→110→80, curt square blat) is the nearest thing in pitch and
  //     the one that mattered most, because a misclick is the most frequent cue
  //     in the game: it is separated on voice (square vs sawtooth), on the
  //     transient (it has none — "curt, no transient" is its whole character), on
  //     length (0.09 vs 0.13), and on placement (a refusal answers YOUR keypress
  //     and stays centred).
  //   • `sink` (320→180→60) shares the sawtooth voice but is 3× longer and is
  //     still at 180Hz where this one has already collapsed to 100.
  //   • `stormWarn` (160→110→70, sawtooth, no noise) falls 2.3×; this falls 4.3×
  //     from well above it, and carries a transient the growl has not.
  impact: { freqStart: 260, freqMid: 100, freqEnd: 60, duration: 0.13, volume: 0.44, type: 'sawtooth', noise: true },
  // A shell falling into WATER. The catalog's only high, soft, noise-forward
  // cue: a sine (no edge whatsoever) with a spray hiss under it, sliding down
  // and thinning out at the lowest level of any tone here (0.24) — a miss should
  // be INFORMATION, never an event.
  //
  // It sits at the opposite end of the catalog from `impact` deliberately (see
  // the spine above): hit and miss must separate without thinking, so they share
  // no channel at all — not register, not waveform, not level, not attack.
  //
  // WHY IT CANNOT BE MISTAKEN FOR ITS NEIGHBOURS:
  //   • `heal` (620→466→466, sine) is the nearest voice at the nearest pitch, and
  //     is separated by CONTOUR the way the fit family and heal separate from
  //     each other: heal SETTLES onto a held root (mid === end) and carries no
  //     hiss, while this keeps falling and is mostly hiss. heal is also self-only
  //     and centred.
  //   • `point` (700→1100→1500) and `kill` (500→900→1200) start in the same place
  //     and RISE through two octaves; nothing about a miss rises.
  //   • `fireMine` (220) and `placeDecoy` (340) are the catalog's other soft sine
  //     drops, an octave or more below and both transient-free — the hiss is what
  //     says "water", and both of those are your own hand, centred.
  splash: { freqStart: 700, freqMid: 460, freqEnd: 280, duration: 0.1, volume: 0.24, type: 'sine', noise: true },
  // A hull you can SEE going down. Witnessed sinkings only: the Public
  // Register's fog kills stay silent, because `sunk` carries no position and the
  // only position available would be a stale contact — the feed line already
  // carries the fact, and this cue would carry the PLACE.
  //
  // The heaviest event on the water gets the catalog's deepest fall: 190 down to
  // 45Hz, the lowest floor any tone reaches — a hull sinking out of hearing.
  //
  // WHY IT CANNOT BE MISTAKEN FOR ITS NEIGHBOURS:
  //   • `sink` — YOUR death — is the one tone over the 150ms ceiling (0.4s), a
  //     sawtooth ALARM warbling down while the elimination modal opens. This is a
  //     third of its length, a soft triangle, and never centred: it is someone
  //     else's ship, over there.
  //   • `kill` (500→900→1200, the ascending chime) is your CREDITED kill and
  //     rises through two octaves where this falls through two. The two will
  //     regularly fire together — when you sink a hull you can see — and that is
  //     the point: the chime is the credit, the groan is the hull, and they are
  //     audibly different facts about the same second.
  //   • `impact` is the other low PANNED world cue, and is separated by attack:
  //     that one has a transient and a sawtooth's grit, this has neither. A hull
  //     going under is a groan, not a crack.
  //   • `hitCall` (130→85→120) is the catalog's other transient-free low
  //     triangle, separated by CONTOUR exactly as it separates itself from its
  //     own neighbours — it dips and comes back; this one never comes back.
  sunkWitness: { freqStart: 190, freqMid: 95, freqEnd: 45, duration: 0.15, volume: 0.38, type: 'triangle' },
  // --- THE BAND STINGS — your own hull crossing a damage band ----------------
  // Fired once per DOWNWARD crossing of `CONFIG.damageBands` (0.5 / 0.25) by
  // `hpBandEdge` below. These are SELF cues and are never panned: a bearing to
  // yourself is meaningless (amendment 55 settled that with the foghorn's own
  // honk, which gets a hull bloom instead of a chevron).
  //
  // They join the ALARM family on purpose. `stormWarn` and `sink` are the
  // catalog's sawtooths, and these carry the same class of message — your ship
  // is in trouble — so stormWarn → hpHurt → hpCritical → sink is meant to be
  // heard as ONE voice getting worse rather than four unrelated noises. What
  // separates them from that family is CONTOUR: both alarm siblings fall
  // monotonically, while these WHOOP — up to a peak at the 40% mark, then down
  // THROUGH their own start to a floor beneath it. That
  // inverted-V-through-the-start shape is unclaimed in the catalog: matchStart
  // (400→900→650) and dazzled (900→1400→1250) are the only other rise-then-fall
  // cues and both settle ABOVE where they began.
  //
  // WHY THEY CANNOT BE MISTAKEN FOR THE TWO CUES THEY FIRE ALONGSIDE:
  //   • `damage` (220→160→110, the triangle thud) is the hit that pushed you over
  //     the line and lands in the same frame — different voice, different contour
  //     (a monotonic fall against a whoop), and a different KIND of statement:
  //     the thud says you were touched, the sting says where you now ARE.
  //   • `denied` (240→110→80, the curt square blat) answers a keypress: different
  //     voice again, shorter, and it never rises.
  // Neither carries a noise transient, deliberately — nothing strikes you at the
  // moment a band is crossed; the crossing is bookkeeping about a hit you have
  // already heard.
  //
  // hpCritical is the HEAVIER of the pair on five independent channels — lower
  // start (200 < 300), lower peak (360 < 520), lower floor (120 < 190), longer
  // (0.15 > 0.12) and louder (0.5 > 0.4) — so "worse" is audible without either
  // one having to become a different instrument.
  hpHurt: { freqStart: 300, freqMid: 520, freqEnd: 190, duration: 0.12, volume: 0.4, type: 'sawtooth' },
  hpCritical: { freqStart: 200, freqMid: 360, freqEnd: 120, duration: 0.15, volume: 0.5, type: 'sawtooth' },
  // Countdown tick (last 5s): short, neutral, clock-like.
  tick: { freqStart: 700, freqMid: 700, freqEnd: 700, duration: 0.06, volume: 0.3, type: 'square' },
  // Match start: bright rising-then-settling tone.
  matchStart: { freqStart: 400, freqMid: 900, freqEnd: 650, duration: 0.14, volume: 0.5, type: 'triangle' },
  // Storm-enter warning: descending growl.
  stormWarn: { freqStart: 160, freqMid: 110, freqEnd: 70, duration: 0.15, volume: 0.5, type: 'sawtooth' },
  // Engine-telegraph detent clicks: tiny, dry ticks — a brass bell chime. The
  // ahead click sits a fifth above the astern click so ringing up vs down the
  // scale is audibly distinct without reading as a "real" cue.
  telegraphUp: { freqStart: 1200, freqMid: 1200, freqEnd: 1200, duration: 0.04, volume: 0.28, type: 'square' },
  telegraphDown: { freqStart: 800, freqMid: 800, freqEnd: 800, duration: 0.04, volume: 0.28, type: 'square' },
};

/** Pure: the telegraph-click tone for a step direction (+1 ahead / -1 astern). */
export function telegraphTone(dir: number): ToneId {
  return dir > 0 ? 'telegraphUp' : 'telegraphDown';
}

/** Equipment with a discrete own-fire/placement cue routed through fireTone. The
 *  instant abilities that have NO such cue here are excluded at the type level:
 *  speedBoost (a pure speed window) and radarBuoy (its placement cue is played
 *  as 'placeDecoy' from the buoy reconcile own-spawn hook, not via fireTone).
 *  The MINE stays included even though it is now an ability (Story 1.8) — its
 *  'fireMine' drop cue still fires, via the Mines reconcile own-spawn hook
 *  (main.ts); the buoy's cue rides the same hook shape. */
type FiringEquipmentId = Exclude<EquipmentId, 'speedBoost' | 'radarBuoy'>;

const FIRE_TONE: Record<FiringEquipmentId, ToneId> = {
  gun: 'fireGun',
  torpedo: 'fireTorp',
  mine: 'fireMine',
  broadside: 'fireBroadside',
  starShells: 'fireStarShells',
};

/** Pure: which tone a weapon's own-fire cue plays. */
export function fireTone(id: FiringEquipmentId): ToneId {
  return FIRE_TONE[id];
}

/** Boon rarity -> its fit cue (Story 2.9). The tier is the ONE audible axis:
 *  a common lands light, a rare fuller, an exclusive heaviest. */
const FIT_TONE: Record<BoonRarity, ToneId> = {
  common: 'fitCommon',
  rare: 'fitRare',
  exclusive: 'fitExclusive',
};

/** Pure: the fit cue for a fitted boon's rarity tier. Fail-open to the common
 *  weight — a junk/unknown rarity must still be AUDIBLE (FR22: a
 *  presentation-silent boon is a defect), never silent. */
export function fitTone(rarity: BoonRarity | undefined): ToneId {
  return rarity !== undefined && Object.hasOwn(FIT_TONE, rarity) ? FIT_TONE[rarity] : 'fitCommon';
}

/** One semitone, in the CENTS `Audio.play`'s `detune` option speaks (the Web
 *  Audio unit — see audio/context.ts). */
const SEMITONE_CENTS = 100;

/**
 * Boon CATEGORY -> the fit cue's transposition, in cents (Story 2.9). The TIER
 * picks the instrument's weight (fitTone); the CATEGORY moves it up or down the
 * scale, so two commons fitted back to back on different slots are audibly
 * different events without becoming different cues. The nine v1 categories are
 * laid across ±4 semitones in the deck's own order — the four weapon families
 * below the root, the utilities above it, SHIP at the root — which keeps the
 * interval between any two neighbours a clean semitone. Draft mapping (the
 * draft-copy rule); the table is pinned exhaustive over the catalog by
 * __tests__/tones.test.ts, so a tenth category cannot ship untransposed.
 */
const FIT_CATEGORY_CENTS: Readonly<Record<string, number>> = {
  guns: -4 * SEMITONE_CENTS,
  broadside: -3 * SEMITONE_CENTS,
  torpedoes: -2 * SEMITONE_CENTS,
  mines: -1 * SEMITONE_CENTS,
  ship: 0,
  intel: 1 * SEMITONE_CENTS,
  speedBoost: 2 * SEMITONE_CENTS,
  starShells: 3 * SEMITONE_CENTS,
  radarBuoy: 4 * SEMITONE_CENTS,
};

/**
 * Pure: the fit cue's detune (cents) for a fitted line's category. Fails OPEN to
 * the root — an unknown/junk category still gets the untransposed cue rather
 * than silence (FR22: a presentation-silent boon is the defect).
 */
export function fitDetune(category: string): number {
  return Object.hasOwn(FIT_CATEGORY_CENTS, category) ? FIT_CATEGORY_CENTS[category] : 0;
}

/** The categories the fit transposition covers (test seam — pinned against the
 *  live catalog so a new category cannot ship without a voice). */
export const FIT_CATEGORIES: readonly string[] = Object.keys(FIT_CATEGORY_CENTS);

// --- match-phase edge cues (countdown tick + match-start) -------------------

/** Countdown seconds at/under which a tick plays. */
const TICK_WINDOW_S = 5;

export interface AudioCueState {
  lastPhase: string;
  /** Last countdown second a tick fired for (dedupes multiple frames of the
   *  same second); null when not in the tick window / not counting down. */
  lastTickSec: number | null;
}

export const INITIAL_CUE_STATE: AudioCueState = { lastPhase: 'connecting', lastTickSec: null };

export interface AudioCueResult {
  tick: boolean;
  matchStart: boolean;
  state: AudioCueState;
}

/**
 * Pure edge-detector: given the previous cue state and this frame's match
 * phase/countdown deadline, decide whether a tick or match-start cue should
 * fire THIS frame, and return the updated state to carry into next frame.
 * `secondsRemaining` is precomputed by the caller (ui/phase.ts's
 * secondsUntil) so this module stays clock-agnostic.
 *
 * `suppressStart` (Story 7.2, Eric ruling R13) forces the match-start edge low
 * for ONE call while leaving everything else — the countdown tick, and the
 * returned state — byte-identical. It exists for the fresh-page resume, where
 * `INITIAL_CUE_STATE.lastPhase` (`'connecting'`, i.e. *not yet observed*) reads
 * to this function as an ordinary previous phase and manufactures a start edge
 * for a match that began minutes ago. It is a PARAMETER rather than a rule
 * about `'connecting'` because a fresh join whose first observed frame is
 * already `'active'` is a real start, and only the caller knows which it is.
 * It must not suppress the tick: a player who resumes mid-countdown should
 * still hear it.
 */
export function audioCues(
  prev: AudioCueState,
  phase: string,
  secondsRemaining: number,
  suppressStart = false,
): AudioCueResult {
  // 'countdown' only, deliberately: the gathering join window also renders big
  // center seconds but stays silent — the audible tick is reserved for "locked,
  // really starting" (spec design note for the 30s join window).
  const inTickWindow = phase === 'countdown' && secondsRemaining <= TICK_WINDOW_S;
  const tick = inTickWindow && secondsRemaining !== prev.lastTickSec;
  const matchStart = !suppressStart && phase === 'active' && prev.lastPhase !== 'active';
  return {
    tick,
    matchStart,
    state: { lastPhase: phase, lastTickSec: inTickWindow ? secondsRemaining : null },
  };
}

/** Pure: true the instant the own ship crosses from inside to outside the storm. */
export function stormEnterEdge(prevInStorm: boolean, inStorm: boolean): boolean {
  return inStorm && !prevInStorm;
}

// --- THE SOUND MAP's two pure helpers (Story 4.7) ---------------------------
//
// Both live here rather than beside their call sites for the same reason the
// tone table does: they are the testable half. `worldCue` decides how a cue is
// PLACED, `hpBandEdge` decides WHETHER one fires — and neither needs an
// AudioContext, a Pixi stage or a socket to answer.

/** Where a world cue sits in the mix: between the ears, and how loud it is at
 *  the distance the thing actually happened. */
export interface WorldCue {
  /** StereoPannerNode units: -1 hard left … +1 hard right (never either — see
   *  `CLIENT_CONFIG.audio.panMax`). */
  pan: number;
  /** Multiplier on the spec's own volume, in [worldFloorGain, 1]. */
  gain: number;
}

/**
 * Pure: attenuate and place a cue that happened at a point out in the world.
 *
 * `dx`/`dy` are the cue's position MINUS the listener's, in WORLD UNITS — the
 * caller does that subtraction, because the listener is the own hull when you
 * have one and `cameraCenter()` while spectating (the foghorn's precedent).
 *
 * THE PAN IS A LATERAL WORLD OFFSET, NOT A SCREEN POSITION, and the difference
 * is deliberate. The camera is axis-aligned and north-up, so a world dx and a
 * screen dx point the same WAY and no rotation is needed — but they are not the
 * same NUMBER: render/camera.ts fits radar range to the short axis and then
 * applies the player's 0.5-1.5 zoom (and the spectator's own factor) on top, and
 * none of that scale is applied here. `dx` is normalised by the fixed world
 * distance `reachU` instead, which is the upside: a cue's pan is a property of
 * the water, so it does not swing across the stereo field when the player zooms
 * or when the camera changes scale — the same cue at the same place sounds from
 * the same side every time. If the camera ever learns to ROTATE, this is the one
 * place that has to change, because the direction would stop agreeing.
 *
 * `reachU` IS A FALLOFF SCALE, NOT A GATE. The server has already decided which
 * events reach this client — that decision IS the perception boundary — so a
 * reach test here would be a SECOND implementation of a perception rule, which
 * is exactly the desync/leak class this project forbids (the `effectiveStats()`
 * argument, applied to sensing rather than to stats). Every world cue therefore
 * passes the SAME reach, `CONFIG.vision.radar` (the eighths ladder's 8/8 rung,
 * full intel range). Per-cue rungs (muzzleFlash for `mz`, sight for `boom`) were
 * considered and rejected on that ground: they would have re-derived the
 * server's answer client-side.
 *
 * PAST THE REACH THE CUE IS CLAMPED, NEVER DROPPED (review gate). An earlier
 * draft returned null there and called it dead code; it is not. A captain with
 * intel-range boons legitimately fires out to `stats.radarRange` far past the
 * BASE radar this scale is fixed at, so their own fall-of-shot — already drawn
 * on screen at its true point — arrives from beyond it; and while spectating,
 * frames are unfogged, so events routinely land farther than the base reach from
 * the camera. Both used to collapse to a dead-centre floor cue, throwing away the
 * bearing that IS the cue. Clamping is the only correct answer because the client
 * must never re-gate what it may sound: distance past the falloff scale means
 * "as far away as this model can express", never silence and never a lost
 * bearing. The gain is already continuous at the boundary (it reaches the floor
 * exactly AT the reach), so only the pan was ever lying.
 *
 * The null return that remains is for genuinely UNUSABLE input only — non-finite
 * coordinates, or a reach that cannot be divided by.
 *
 * The curve is LINEAR TO A FLOOR, not inverse-square. That is a legibility
 * choice over a physically honest one, which amendment 115 permits outright
 * ("realism is the idea source; fun wins on mechanics"): 1/d² spends nearly its
 * whole range inside the first eighth and leaves everything past truesight
 * indistinguishably near-silent, so a distant gun would arrive as a rumour
 * rather than as information. The floor is the load-bearing half — a cue's job
 * is to point your ear at a mark already drawn on your screen, and a mark you
 * cannot hear has no cue at all.
 */
export function worldCue(dxWorld: number, dyWorld: number, reachU: number): WorldCue | null {
  if (!Number.isFinite(dxWorld) || !Number.isFinite(dyWorld) || !Number.isFinite(reachU)) return null;
  if (reachU <= 0) return null;
  const d = Math.sqrt(dxWorld * dxWorld + dyWorld * dyWorld);
  const floor = CLIENT_CONFIG.audio.worldFloorGain;
  // Held at the floor past the reach rather than gated away (see above). The pan
  // below was ALREADY clamped to the same boundary, which is why the two agree.
  const gain = floor + (1 - floor) * Math.max(0, 1 - d / reachU);
  const pan = Math.max(-1, Math.min(1, dxWorld / reachU)) * CLIENT_CONFIG.audio.panMax;
  return { pan, gain };
}

/** Which damage band the hull just fell through. */
export type HpBand = 'hurt' | 'critical';

/**
 * A usable hull fraction, or null.
 *
 * NULL IS NOT ZERO — the same warning render/attention.ts carries about its own
 * `hpFrac`: there is no own hull while spectating or across the respawn gap, and
 * a missing hull that read as 0 would fire the critical sting at the moment you
 * die and again every time you look at the scoreboard. `maxHp <= 0` is the
 * caller's job to turn into null for exactly this reason (never `hp / 0`).
 */
function liveFrac(v: number | null): number | null {
  return v !== null && Number.isFinite(v) ? v : null;
}

/**
 * Pure: did the hull cross a `CONFIG.damageBands` threshold DOWNWARD this frame,
 * and if so which one?
 *
 * The thresholds are READ from shared CONFIG, never restated: 0.5 / 0.25 exist
 * exactly once in the codebase (amendment 41's binding — the HP rail's colours,
 * the server's wounded-smoke tiers and this sting are all the same two numbers,
 * so a future retune moves all three together).
 *
 * Three properties that are the whole design:
 *   • DOWNWARD ONLY. Recovering upward is silent — a heal has its own cue, and a
 *     rail climbing back through a band is good news that needs no alarm.
 *   • IT RE-ARMS BY CONSTRUCTION. There is no latch to reset: the edge is a
 *     function of the two adjacent frames, so healing above a band and taking it
 *     again later fires again, with nothing to get stuck.
 *   • THE WORSE ONE ONLY. A hit that carries you through both bands in one step
 *     (0.6 → 0.1) reports `'critical'` and nothing else — two stings stacked in
 *     one frame would be a smear, and the lesser one is no longer true.
 *
 * The comparison follows shared CONFIG's stated rule that a band bound is an
 * EXCLUSIVE LOWER BOUND FOR THE BETTER STATE, so landing on exactly 0.5 is
 * healthy and silent — the same reading `hpColor()` and the smoke tiers use.
 */
export function hpBandEdge(prevFrac: number | null, frac: number | null): HpBand | null {
  const prev = liveFrac(prevFrac);
  const now = liveFrac(frac);
  if (prev === null || now === null) return null;
  const { amberBelow, criticalBelow } = CONFIG.damageBands;
  if (now < criticalBelow && prev >= criticalBelow) return 'critical';
  if (now < amberBelow && prev >= amberBelow) return 'hurt';
  return null;
}
