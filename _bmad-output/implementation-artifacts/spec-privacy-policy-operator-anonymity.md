---
title: 'The privacy policy speaks as Hullcracker.io'
type: 'chore'
created: '2026-08-19'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: [oversized]
baseline_revision: '9a7d37b'
---

<intent-contract>

## Intent

**Problem:** The published privacy policy names the operator in the flesh — `WHO RUNS THIS` gives
his legal name, his entity type and his country of residence, and `CONTACT` repeats all three.
(The exact prior wording is in `git show 9a7d37b:client/src/privacy/policyCopy.ts`; it is not
restated here, since restating it in a tracked file of a public repo is the thing being undone.)
Eric has ruled that his real-world identity must not be reachable from the game's text, superseding
Story 7.2's R11.

**Approach:** Rewrite `client/src/privacy/policyCopy.ts` so the policy speaks as **Hullcracker.io**
and never as a person: the legal name, the "individual operator" framing and the country of
residence are deleted, and every first-person operator reference (`we`/`us`/`our`) becomes either
"Hullcracker.io" or a concrete non-personal noun ("the game", "the game server", "the hosting
provider"). Facts, structure, headings and section order are unchanged — this is a change of VOICE
and IDENTITY DISCLOSURE only, never of what the policy claims the code does.

## Boundaries & Constraints

**Always:**
- Every factual claim in the policy stays exactly as true as it is today. `policyCopy.ts`'s own
  docstring rule governs: a sentence here is a claim about shipped behaviour, so no rewrite may
  weaken, strengthen or blur a disclosure while changing its voice.
- `POLICY_CONTACT` stays `contact@hullcracker.io` (R10 is untouched — the address is not personal).
- The second-person voice for the reader (`you`, `your`) is preserved everywhere.
- Section headings, section order, bullet content and the `PolicySection` shape are unchanged.
- Prose register per R9/EXPERIENCE.md:53 — plain English, nothing terse or naval. Avoid stacking
  "Hullcracker.io" repeatedly inside one paragraph where a concrete noun ("the game", "the game
  server") refers to the same actor without personhood.

**Block If:**
- A rewrite would require asserting a fact not already in the file (e.g. inventing a legal entity,
  a jurisdiction, or a governing-law clause to replace the deleted identity).

**Never:**
- Never add a company, entity, address, jurisdiction or governing-law clause to fill the gap.
- Never touch analytics, consent, ads, liveness or any runtime behaviour — this cycle is text only.
- Never change `POLICY_UPDATED` away from today's stamp (`19 August 2026`), which is already correct
  for a contents change made today.
- Never edit the how-to-play copy, home copy or any other player-facing surface: a sweep confirmed
  the operator's identity appears in no shipped file but `policyCopy.ts` (lines 97 and 332).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rendered policy | `/privacy` page built from `POLICY_SECTIONS` | No occurrence of the operator's legal name, "individual operator", or a country of residence for the operator | No error expected |
| Operator reference | `WHO RUNS THIS` and `CONTACT` sections | Both name `Hullcracker.io` as the runner and carry `contact@hullcracker.io` | No error expected |
| First-person voice | Any section's paragraphs, bullets or trailing prose | No standalone `we`/`us`/`our`/`ours` token anywhere in the policy data | No error expected |
| Reader voice | Any section | `you`/`your` still present — the policy still addresses the reader directly | No error expected |
| Third-party countries | `WHAT ANALYTICS NEVER SEES` | "processed outside your country, including in the United States" survives — that is Google's processing location, not the operator's home | No error expected |

</intent-contract>

## Code Map

- `client/src/privacy/policyCopy.ts` -- the frozen policy copy, as data. Sole carrier of the
  operator identity (`:97` WHO RUNS THIS, `:332` CONTACT) and of every `we/us/our`. The only file
  this cycle changes in `client/src/`.
- `client/src/privacy/main.ts` -- renders `POLICY_SECTIONS` through the standard page chrome; reads
  the copy and must not need changing.
- `client/src/__tests__/page.test.ts` -- covers the page chrome and the `PRIVACY POLICY` title only;
  asserts nothing about policy content today.
- `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` -- R11 lives here and must be
  superseded by a dated amendment in the same change (amendments protocol clause 1).

## Tasks & Acceptance

**Execution:**
- [x] `client/src/privacy/policyCopy.ts` -- rewrite `WHO RUNS THIS` and `CONTACT` so Hullcracker.io
      is the named runner and no person, entity type or country of residence appears -- this is the
      IRL-identity removal Eric asked for.
- [x] `client/src/privacy/policyCopy.ts` -- convert every operator `we`/`us`/`our` in paragraphs,
      bullets and `trailing` prose to `Hullcracker.io` or a concrete non-personal noun, recasting
      sentences where a bare substitution would read badly -- "when referring to anyone, just refer
      to Hullcracker.io".
- [x] `client/src/privacy/policyCopy.ts` -- update the file's header docstring to record that the
      policy speaks as Hullcracker.io and that the operator identity is deliberately absent, so a
      later agent does not "restore" it as a missing disclosure.
- [x] `client/src/__tests__/privacyPolicy.test.ts` -- NEW pin test over `POLICY_SECTIONS`, covering
      every row of the I/O matrix -- the copy is frozen and currently has zero content coverage, so
      nothing stops the identity creeping back.
- [x] `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` -- append a dated
      amendment superseding R11 and recording the legal consideration flagged below.
- [x] `VERSION`, `package.json`, `package-lock.json` -- bump 0.17.107 -> 0.17.108 (cycle 108).
- [x] `CLAUDE.md`, `_bmad-output/gds-workflow-status.yaml`,
      `_bmad-output/implementation-artifacts/sprint-status.yaml` -- one-line cycle stamps each.

**Acceptance Criteria:**
- Given the shipped client, when the whole repo's `client/` and `server/` source is searched for the
  operator's legal name, then there are zero matches outside review/ledger prose.
- Given `/privacy` rendered from `POLICY_SECTIONS`, when a reader looks for who runs the site, then
  they are told Hullcracker.io and given `contact@hullcracker.io`, and are told nothing about a
  person, an entity type, or a country of residence.
- Given the rewritten copy, when each factual claim is compared against the pre-change text, then the
  set of disclosed behaviours is identical — no disclosure added, removed, narrowed or widened.
- Given `npm run check`, when it runs, then lint, all three type-checks and the full test suite pass
  with the new pin test included.

## Spec Change Log

### 2026-08-19 — One deliberate deviation from the intent contract's `Always` list

- **Triggering finding:** orchestrator review of the returned implementation. The `Always` bullet
  "Section headings ... are unchanged" left `WHY WE ARE ALLOWED TO DO THIS` — the single
  first-person token in the document — standing after every "we" in the body had been removed.
- **What was amended:** nothing inside `<intent-contract>` (it is read-only at this stage). The
  heading ships as `WHY THIS IS ALLOWED`, and the deviation is recorded here, in epic-7 amendment
  19, in `CLAUDE.md` and in both trackers rather than absorbed silently.
- **Known-bad state avoided:** a policy whose body scrupulously avoids referring to the operator in
  first person, under a heading that does exactly that — and a pin test that would have had to
  carve out an exemption for it, which is how exemptions become permanent.
- **Why the constraint yields:** it was written to stop structural drift, not to preserve a
  first-person heading. Eric's instruction ("when referring to anyone, just refer to
  'Hullcracker.io'") is the requirement the constraint exists to serve. It is a one-word revert.
- **KEEP:** the verbatim pinning of `WHO RUNS THIS` and `CONTACT`, and the absence of any name
  denylist in the test — see the Review Triage Log entry for why the latter is load-bearing.

## Review Triage Log

### 2026-08-19 — Review pass (Blind Hunter + Edge Case Hunter, deduplicated)

- intent_gap: 0
- bad_spec: 0
- patch: 14: (high 3, medium 5, low 6)
- defer: 0
- reject: 2: (medium 1, low 1)
- addressed_findings:
  - `[high]` `[patch]` An agentless passive STRENGTHENED a claim the code cannot support: "we never
    send Google anything about your match for advertising purposes" became "nothing about your match
    is ever sent", an absolute contradicted by the five GA4 events and by Consent Mode ADVANCED
    granting `ad_user_data`/`ad_personalization` outside the EEA/UK/CH. Restored `Hullcracker.io` as
    the subject. This was the highest-consequence finding in the pass — a voice edit had
    manufactured a privacy promise the game does not keep.
  - `[high]` `[patch]` `CLAUDE.md` asserted headings were frozen, the opposite of what shipped; a
    future agent reading it would have "restored" the old heading and broken the new pin. Corrected
    in `CLAUDE.md` and both trackers.
  - `[high]` `[patch]` The pin test's first-person regex covered the PLURAL only, missing
    `I`/`me`/`my`/`mine`/`myself`/`ourselves` — and the operator is one person, so the singular is
    the likeliest regression. Extended, with `us` matched case-sensitively so a future "the US"
    cannot false-trip it.
  - `[medium]` `[patch]` "never sent to us as a profile" had narrowed to "the game's servers",
    promising about one recipient where the operator has several routes (analytics console, AdSense
    reports). Restored to `Hullcracker.io`, twice.
  - `[medium]` `[patch]` The COPPA-adjacent CHILDREN undertaking lost its actor to the passive
    ("it will be looked into"). Restored to `Hullcracker.io will look into it`.
  - `[medium]` `[patch]` The test named the redacted surname in three regex literals, writing it
    into a tracked file of a public repo — the guard republishing what the ruling removes. Name
    denylist deleted; `WHO RUNS THIS` and `CONTACT` pinned VERBATIM instead, which admits no name
    because it admits no other text. A standing "do not add one" note ships with it.
  - `[medium]` `[patch]` "There is no company behind it" was collateral damage of the identity
    deletion — it names no person and no place, and a reader is entitled to it. Restored, which also
    resolves the circularity of "run by Hullcracker.io" as the whole answer to WHO RUNS THIS.
  - `[medium]` `[patch]` The residence sweep was scoped to two sections, so a location reintroduced
    into any other section passed. Now swept policy-wide by PHRASING (`based in`, `located in`,
    `operated from`, `resident in`), which also catches a city or a different country.
  - `[low]` `[patch]` The file's own header comment said "our own logs" / "outside our control" /
    "our banner" three lines after declaring that no sentence says "our". Converted.
  - `[low]` `[patch]` Two more agentless recasts dropped the committing party (the fonts intention,
    the server-log purpose). Both given `Hullcracker.io` as subject.
  - `[low]` `[patch]` `/USA/i` unbounded matched inside "usage"; `section()` used `find()`, so a
    duplicate heading could hide a second block; the processing-location pin was coupled to one
    section's name; a `trailing`-only section counted as empty; `POLICY_UPDATED` was pinned to
    today's exact date, forcing a test edit on every future policy change without proving the stamp
    current. All six corrected (bounded, uniqueness-asserted, swept policy-wide, counted, format
    regex).
  - `[low]` `[patch]` No pin covered the privacy page's `<head>`, the obvious place a byline lands.
    Added, by shape (`author`/`copyright`/`byline`, any email address) rather than by name.
  - `[low]` `[patch]` An email-address allowlist now asserts every address in the policy IS
    `POLICY_CONTACT`, so a personal address cannot sit beside the frozen one.
  - `[medium]` `[patch]` `deferred-work.md`'s Global Privacy Control entry reasoned from R11's
    now-superseded controller wording. Premise corrected in place; the GPC question is unaffected,
    since the obligation follows from serving those states.
  - `[reject]` "NO FACT MOVED" is asserted in three places and is not literally true — accurate, and
    fixed as part of the patches above rather than tracked as its own finding.
  - `[reject]` A suggestion to restate the non-entity fact as "Hullcracker.io is not a registered
    company": superseded by restoring the original sentence verbatim, which says the same thing in
    Eric-approved words.

## Design Notes

**Why full first-person conversion rather than a two-line redaction.** Eric's instruction had two
halves: remove IRL-traceable information, *and* "when referring to anyone, just refer to
Hullcracker.io". Deleting only the two identity lines satisfies the first half and leaves ~40
sentences saying "we", which is a reference to the operator by another name. Defining "we" once as
Hullcracker.io was considered and rejected as a dodge of a plainly worded instruction. The
conversion is confined to one file and changes no fact.

**Concrete nouns are preferred over repetition.** "our game server" becomes "the game server", "our
hosting provider, Render" becomes "the hosting provider, Render". Both refer to Hullcracker.io's
infrastructure without a person and without a fourth "Hullcracker.io" in the same paragraph.

**Flagged, not blocking.** GDPR Art. 13(1)(a) and comparable regimes expect a privacy notice to
identify the controller, and "Hullcracker.io" is a trading name rather than a legal identity. This
is recorded in the amendment as a known consequence of Eric's ruling; the ruling governs, and the
policy keeps a working contact address, which is the practical route for any request.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean, three type-checks clean, full suite green including the
  new pin test.
- `git grep -In "$(git show 9a7d37b:client/src/privacy/policyCopy.ts | grep -o 'run by [A-Z][a-z]* [A-Z][a-z]*' | cut -d' ' -f4)" -- client server shared` -- expected: no
  matches. (Derived from history rather than typed, so the check itself never writes the name into a
  tracked file.)
- `npm test -w client -- privacyPolicy` -- expected: the new pin test passes.

## Auto Run Result

Status: done

**What shipped.** The published privacy policy no longer names its operator and no longer speaks in
the first person. `WHO RUNS THIS` and `CONTACT` name Hullcracker.io and the contact address; the
legal name, the entity type and the country of residence are gone. Throughout the document the
actor is `Hullcracker.io` — never a passive that hides who is committing — and the one heading
carrying first person moved with the body. Every behavioural disclosure is unchanged.

**Files changed (10).**
- `client/src/privacy/policyCopy.ts` — the redaction, the voice conversion, one heading, and a
  header docstring recording that the absence IS the ruling.
- `client/src/__tests__/privacyPolicy.test.ts` — NEW. The copy's first content coverage: the two
  identity sections pinned verbatim, first-person swept (singular and plural) over headings and
  body, location phrasing swept policy-wide, an email allowlist, the page `<head>`, and the
  disclosures that must survive a future redaction pass. Carries no name denylist, deliberately.
- `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` — amendment 19, superseding
  R11.
- `_bmad-output/implementation-artifacts/deferred-work.md` — the Global Privacy Control entry's
  premise corrected; it reasoned from R11.
- `CLAUDE.md`, `_bmad-output/gds-workflow-status.yaml`, `sprint-status.yaml` — cycle stamps.
- `VERSION`, `package.json`, `package-lock.json` — 0.17.107 -> 0.17.108.

**Review findings.** 14 patched (3 high, 5 medium, 6 low), 0 deferred, 2 rejected, 0 spec loopbacks.
The high-severity three: a passive recast that turned a scoped promise into an absolute the shipped
consent defaults cannot support; `CLAUDE.md` asserting the opposite of what shipped on the heading;
and a first-person pin blind to the singular, which is the likeliest regression for a one-person
operator. See the Review Triage Log.

**Verification.** `npm run check` exit 0 — lint clean, three type-checks clean, 5264 tests across
188 files (shared 746, server 1489, client 3029). The surname appears nowhere under `client/`,
`server/` or `shared/`. `PROTOCOL_VERSION` unchanged at 41; no wire, runtime or gameplay code
touched.

**Residual risks.**
1. **The erasure reaches HEAD, not history.** The name remains in prior commits of `policyCopy.ts`,
   in commit authorship, in this planning ledger, and in any already-deployed build until the next
   deploy. Rewriting a public remote's history was not asked for and was not attempted.
2. **No named data controller.** GDPR Art. 13(1)(a) expects one; "Hullcracker.io" is a trading name.
   Flagged for Eric, ruled on by Eric, recorded in amendment 19 so a future compliance pass finds a
   decision rather than an oversight. An LLC would resolve it without a personal name.
3. **`There is no company behind it` was restored** after being cut in the first pass. It names no
   person and no place, but it does disclose that no corporate entity exists — a one-sentence
   revert if Eric would rather it stayed out.
