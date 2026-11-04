---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments:
  - _bmad-output/implementation-artifacts/epic-10-context-amendments.md (amendment 6(d))
  - _bmad-output/brainstorming/brainstorming-session-2026-11-03.md
  - _bmad-output/forge/beacons-battleships-index/forged-idea.md
workflowType: 'research'
lastStep: 6
research_type: 'domain'
research_topic: 'battleship-topdown-plans'
research_goals: 'top-down profiles, turret positions and firing arcs for Yamato, Bismarck, HMS Warspite, USS Iowa as spec input for story 10.4'
user_name: 'Eric'
date: '2026-11-04'
web_research_enabled: true
source_verification: true
---

# Research Report: Battleship Top-Down Plans (Story 10.4 reference)

**Date:** 2026-11-04
**Author:** Eric (research run by Claude, four parallel researchers, one per hull)
**Research Type:** domain (naval reference, not market)

---

## Research Overview

Reference material for the **10.4 Four Battleships design sitting** (Epic 10 amendment 6(d)): "each ship's top-down profile at the game's scale, turret positions and per-turret arcs from real naval drawings, rendered for his yes — the spec input for the sprites, `silhouette.ts` and the arc tables."

Method: web search + direct fetch of drawings; where a drawing was downloaded, turret and superstructure positions were read off it by pixel measurement (marked **[measured]**, about ±0.01 of length overall). Everything else is cited. Nothing was copied into the repo; this document holds URLs only.

Conventions used throughout: **LOA** = length overall. **Fraction from bow** means 0 = bow tip, 1 = stern tip along the centerline. Arcs are given as "±N° from the turret's rest bearing" (dead ahead for forward turrets, dead astern for aft turrets).

---

## Research Scope Confirmation

**Confirmed 2026-11-04 (Eric: "C").** Domain research on the four historical battleships that replace the SPEEDBOAT / REPEATER / DREADNOUGHT classes: Yamato, Bismarck, HMS Warspite, USS Iowa. The stock genre / market / regulatory / engine sections of this skill do not fit and are replaced by naval-reference sections:

1. Reference drawings per ship — direct image URL, source, license.
2. Hull geometry — length, beam, ratio, superstructure extent, for one shared game scale.
3. Main battery layout — turret count, guns per turret, centerline position as a fraction of hull length, facing.
4. Firing arcs — published training arcs or superstructure-blocked arcs per turret.
5. Secondaries — real placement, flavor only (ruling: secondaries are uniform).
6. Synthesis — comparison table, trace-safe vs. off-repo images.

**Out of scope:** stats, damage, speed, armor beyond proportion. Those are Eric's harness.

---

## 1. Yamato (IJN, 1941 as completed / April 1945 final fit)

### 1.1 Reference drawings

| # | Image | Source / author | License | Px | View | Trace-safe? |
|---|---|---|---|---|---|---|
| Y-A | https://upload.wikimedia.org/wikipedia/commons/0/08/Yamato1945.png | Commons user Alexpl, own work from Kure Maritime Museum volumes, Skulski, Conway ([file page](https://commons.wikimedia.org/wiki/File:Yamato1945.png)) | CC-BY-SA 3.0 / GFDL | 4177×2026 | **Full plan + profile**, 7 Apr 1945 fit, bow RIGHT, 13 m scale bar | **YES**, credit Alexpl, share-alike. **Primary source**; all Yamato fractions below are measured on it. |
| Y-B | https://upload.wikimedia.org/wikipedia/commons/f/fc/Musashi1942.png | Alexpl ([file page](https://commons.wikimedia.org/wiki/File:Musashi1942.png)) | CC-BY-SA 4.0 | 4177×2026 | Plan + profile, sister ship 1942 = the 1941 Yamato layout (4×15.5 cm, 6×12.7 cm) | YES. Stand-in for the 1941 fit. |
| Y-C | https://upload.wikimedia.org/wikipedia/commons/d/d1/Musashi1944.png | Alexpl | CC-BY-SA 3.0 / GFDL | 4177×2026 | Plan + profile, Oct 1944 | YES |
| Y-D | https://upload.wikimedia.org/wikipedia/commons/f/fa/Builders_plans_for_the_Japanese_battleship_Yamato_%28NH_111711%29.png | NHHC photo NH 111711, a captured Japanese sheet with a dimension table ([file page](https://commons.wikimedia.org/wiki/File:Builders_plans_for_the_Japanese_battleship_Yamato_(NH_111711).png)) | Commons tags PD-US (Alien Property Custodian) + PD-Japan; NHHC did not author it | 5996×3443 | Profile + **schematic** plan, 1941 fit | Probably yes, but the plan is not to scale amidships. Use for the dimension table, not for tracing. |
| Y-E | https://upload.wikimedia.org/wikipedia/commons/d/d8/Japanese_battleship_Yamato_seen_from_an_attacking_aircraft%2C_7_April_1945_%2880-G-320642%29.jpg | US Navy 80-G-320642 | Public domain | 1740×1311 | Oblique aerial, mostly smoke | PD but useless for tracing |
| Y-F | 80-G-309662 on https://www.ibiblio.org/hyperwar/OnlineLibrary/photos/sh-fornv/japan/japsh-xz/yamato.htm | US Navy | Public domain | 740×605 | Oblique aerial 19 Mar 1945 | PD, low-res |
| Y-G | the-blueprints.com IJN Yamato 1941 (Dan Saranga) | commercial, login-gated | all rights reserved | — | vector plan | **NO** |
| Y-H | Jean Secardin line drawing, maritimequest.com | © Secardin | all rights reserved | — | — | **NO** |

Not found: an ONI 41-42 Yamato page scan; a Wikipedia infobox silhouette (none exists); any free Kure museum general-arrangement plan (the Skulski / Kojinsha drawing sets are commercial). navweaps notes the original Japanese blueprints were largely destroyed ([tech-084](https://navweaps.com/index_tech/tech-084.php)).

### 1.2 Hull geometry

| Item | Value | Source |
|---|---|---|
| Length overall | 263.0 m | [Wikipedia](https://en.wikipedia.org/wiki/Japanese_battleship_Yamato); NH 111711 table |
| Waterline length | 256.0 m | [Yamato class](https://en.wikipedia.org/wiki/Yamato-class_battleship); NH 111711 |
| Beam max | 38.9 m (waterline 36.9 m) | same |
| Draft | 10.4 m trial; 11 m in the ship infobox | same |
| LOA : beam | **6.76** | derived |
| Scale check on Y-A | beam reads 39.1 m against a 263 m hull: drawing is to scale | [measured] |

Superstructure along LOA **[measured on Y-A]**: bare forecastle 0–0.31; raised block 0.44–0.71; tower-bridge massif 0.49–0.63 (center 0.51); **funnel center 0.59**; aircraft deck 0.77–1.0 with catapults on the stern quarters.

### 1.3 Main battery

Nine 46 cm/45 Type 94 in three triple turrets; gun axes 350 cm apart ([navweaps](https://navweaps.com/Weapons/WNJAP_18-45_t94.php)).

| Turret | Fraction from bow [measured, Y-A] | ≈ m from bow | Facing | Notes |
|---|---|---|---|---|
| No. 1 | **0.31** | 81 | forward | lowest |
| No. 2 | **0.39** | 103 | forward, superfires over No. 1 | cross-check: wreck survey puts the bow break at ~90 m, just ahead of No. 2 ([ja.wikipedia](https://ja.wikipedia.org/wiki/大和_(戦艦))) |
| No. 3 | **0.74** | 195 | aft | single aft turret, no aft superfiring pair |

The schematic NH 111711 reads 0.39 / 0.46 / 0.77 because its midships is compressed; prefer Y-A.

### 1.4 Firing arcs

- **Sourced:** 46 cm triple train **±150°**, 2°/s ([navweaps](https://navweaps.com/Weapons/WNJAP_18-45_t94.php), citing USNTMJ report O-45(N)). 15.5 cm triple ±150° ([navweaps](https://navweaps.com/Weapons/WNJAP_61-60_3ns.php)). 12.7 cm twins generic: ±70° amidships mounts, ±150° bow/stern mounts ([navweaps](https://navweaps.com/Weapons/WNJAP_5-40_t89.php)).
- **Estimated (no Yamato-specific blast tables found):** No. 1 fires dead ahead to ±150°, nothing ahead of it. No. 2 same, dead-ahead fire over No. 1; the tower at 0.51 blocks the last 30°. No. 3 fires dead astern to ±150°; forward blocked by the aft 15.5 cm turret and superstructure.
- **Bearing count:** bow-on 6 guns (No. 1 + No. 2), broadside 9, stern-on 3. Matches the amendment 6(d) "bow-on 6, stern-on 3" ruling for the 3×3 ships.

### 1.5 Secondaries (flavor only)

| Fit | 15.5 cm/60 triple | 12.7 cm/40 Type 89 twin |
|---|---|---|
| 1941 | 4 turrets: one superfiring over No. 2 (≈0.46), one ahead of No. 3 (≈0.69), two wing turrets abreast the funnel | 6 twins, three per side amidships |
| 1945 | 2 turrets, fore and aft centerline only (wings removed Feb 1944) | 12 twins, six per side on the superstructure deck between ≈0.46 and 0.70 |

Sources: [Wikipedia class article](https://en.wikipedia.org/wiki/Yamato-class_battleship), [combinedfleet](http://www.combinedfleet.com/yamato.htm), navweaps pages above.

### 1.6 Not found

Published frame/meter positions for the turrets, tower or funnel; Yamato-specific blast-restriction arcs; an ONI recognition sheet online; official Kure general-arrangement plans online.

---

## 2. Bismarck (Kriegsmarine, 1941)

### 2.1 Reference drawings

| # | Image | Source / author | License | Px | View | Trace-safe? |
|---|---|---|---|---|---|---|
| B-A | https://upload.wikimedia.org/wikipedia/commons/e/e9/Tirpitz-1.jpg | US Navy ONI 204 sheet "TIRPITZ—BB4", Aug 1942 ([file page](https://commons.wikimedia.org/wiki/File:Tirpitz-1.jpg)); sister ship, identical hull and layout | Public domain (US federal work) | 1016×621 | Profile + **full plan** + "density of fire" diagram | **YES. Primary source.** Shows Tirpitz; layout identical to Bismarck for a sprite. |
| B-B | https://upload.wikimedia.org/wikipedia/commons/0/0d/Battleship_Tirpitz_drawing.jpg | crop of B-A | Public domain | 930×370 | crop | YES |
| B-C | https://www.coatneyhistory.com/TirpitzONI2.JPG | same ONI 204 sheet, higher-res scan ([page](https://www.coatneyhistory.com/Tirpitz.htm)) | drawing is US PD; scanner asks that the scan not be re-posted | 1828×1139 | Profile + full plan | Trace from it, do not redistribute the file; cite B-A. |
| B-D | https://www.kbismarck.com/bism41.gif | Manuel P. González López, kbismarck.com ([drawings page](https://www.kbismarck.com/drawings.html)) | © kbismarck.com, no reuse terms published → all rights reserved | 3014×1189 | Profile + color plan with scale bar | **NO** for copying. Read proportions from it only (the frame-derived turret fractions below were cross-checked on it). |
| B-E | https://upload.wikimedia.org/wikipedia/commons/0/0e/Battleship_Bismark.svg | charner1963 via Openclipart | CC0 | SVG | **Profile only** | YES, side view only |
| B-F | https://upload.wikimedia.org/wikipedia/commons/f/fe/Bundesarchiv_Bild_193-04-1-26%2C_Schlachtschiff_Bismarck.jpg | Bundesarchiv Bild 193-04-1-26 (the Wikipedia infobox photo) | CC-BY-SA 3.0 DE | 1633×800 | Oblique bow-quarter photo | reusable with attribution; not a plan |

Not found: any free plan drawing of Bismarck herself; any overhead photo on Commons; no Wikipedia silhouette. Royal Museums Greenwich holds original Bismarck deck plans (objects 533639 / 533640) under Crown copyright, images not online.

### 2.2 Hull geometry

| Item | Value | Source |
|---|---|---|
| Length overall | 251 m (kbismarck 250.5 m; ONI 817 ft) | [Wikipedia](https://en.wikipedia.org/wiki/German_battleship_Bismarck); [kbismarck](https://www.kbismarck.com/genedata.html) |
| Waterline length | 241.6 m | same |
| Beam max | 36.0 m | same |
| Draft | 9.3 m standard, 9.9 m max | same; [navweaps INRO](https://navweaps.com/index_inro/INRO_Bismarck.php) |
| LOA : beam | **6.97** | derived |

Superstructure along LOA **[measured on B-D profile, ±0.01]**: superstructure front just aft of Bruno ≈0.33; foretop / conning tower center ≈0.44; **funnel center ≈0.50**; mainmast ≈0.585; aft end of superstructure ≈0.68; catapult/hangar gap at deck level ≈0.52–0.54.

### 2.3 Main battery

Eight 38 cm SK C/34 in four twin turrets; gun axes 3.75 m apart ([navweaps](https://www.navweaps.com/Weapons/WNGER_15-52_skc34.php)). Frame numbers are meters from frame 0 at the aft perpendicular ([kbismarck armament](https://www.kbismarck.com/armament.html), datum inferred from the belt arithmetic on [kbismarck protection](https://www.kbismarck.com/proteccioni.html)).

| Turret | Facing | Frame (m) | Fraction from bow, frame-derived | Fraction, measured on B-D | Fraction, eyeballed on B-A | **Recommended** |
|---|---|---|---|---|---|---|
| Anton | forward, lower | 192.55 | 0.203 | 0.228 | ≈0.22 | **0.215** |
| Bruno | forward, superfires over Anton | 174.35 | 0.276 | 0.300 | ≈0.30 | **0.29** |
| Caesar | aft, superfires over Dora | 64.35 | 0.715 | 0.727 | ≈0.73 | **0.72** |
| Dora | aft, lower | 46.15 | 0.788 | 0.801 | ≈0.80 | **0.795** |

The ~2 % gap between methods is the gunhouse overhanging the barbette axis plus artist tolerance; Dora agrees within 1 %. Turret body ≈9 m wide.

### 2.4 Firing arcs

- **Sourced** ([kbismarck armament](https://www.kbismarck.com/armament.html); [navweaps](https://www.navweaps.com/Weapons/WNGER_15-52_skc34.php)): Anton and Bruno train 215°–0°–145°, i.e. **±145° from dead ahead**. Caesar and Dora 035°–180°–325°, i.e. **±145° from dead astern**. Train rate 5°/s.
- The ONI 204 "density of fire" diagram on B-A agrees: 4 guns bear in the bow ±30° sector, 8 guns from 30° to 140° either side, 4 guns in the stern ±40° sector. The blind sector is therefore 35° either side of the bow for the aft pair and 35° either side of the stern for the forward pair. Nothing published distinguishes Anton from Bruno or Caesar from Dora.
- **Bearing count:** bow-on 4 guns, broadside 8, stern-on 4. Matches the amendment 6(d) "bow-on 4, stern-on 4" ruling for the 4×2 ships.

### 2.5 Secondaries (flavor only)

| Battery | Count | Placement [measured on B-D / B-A, ±0.02] | Source |
|---|---|---|---|
| 15 cm SK C/28 twin turrets | 6 twins, 3 per side | wing turrets at the upper-deck edge: forward pair ≈0.385, middle pair abreast the funnel ≈0.50, aft pair ≈0.60; arcs about ±75° from broadside | [kbismarck](https://www.kbismarck.com/armament.html); [navweaps](http://www.navweaps.com/Weapons/WNGER_59-55_skc28.php) |
| 10.5 cm C/33 heavy AA | 8 twins, 4 per side | first superstructure deck, inboard of the 15 cm turrets, ≈0.40–0.63 | [navweaps](http://www.navweaps.com/Weapons/WNGER_41-65_skc33.php) |

### 2.6 Not found

A free plan of Bismarck herself (Tirpitz ONI sheet stands in); published frame numbers for secondaries, funnel or towers; any per-turret arc difference within a pair; kbismarck reuse terms.

---

## 3. HMS Warspite (Royal Navy, 1937 rebuild / WWII)

### 3.1 Reference drawings

| # | Image | Source / author | License | Px | Config | Trace-safe? |
|---|---|---|---|---|---|---|
| W-A | http://ibiblio.org/hyperwar/USN/ref/ONI/ONI-201/img/oni201-14.PNG | US Navy ONI 201 *Warships of the British Commonwealth*, "QUEEN ELIZABETH Class — WARSPITE" plate, profile + **full plan** + height/length table ([index](http://ibiblio.org/hyperwar/USN/ref/ONI/ONI-201/index.html)) | US federal work, public domain by inference; the page states no license | 1348×801 (plan only ~640 px long) | **1937 rebuilt** block tower, single funnel, hangar | **YES. Primary for the rebuilt superstructure.** Low resolution. |
| W-B | http://ibiblio.org/hyperwar/USN/ref/ONI/ONI-201/img/oni201-15.PNG | ONI 201 photo plate; lower-left is a near-vertical overhead, Nov 1942 | as W-A | 1207×701 (overhead ~320×420 px) | 1942 | yes, tiny; proportion cross-check only |
| W-C | https://upload.wikimedia.org/wikipedia/commons/b/b1/Queen_Elizabeth_class_diagrams_Brasseys_1923.jpg | Brassey's Naval Annual 1923 plate 3, elevation + deck plan ([file page](https://commons.wikimedia.org/wiki/File:Queen_Elizabeth_class_diagrams_Brasseys_1923.jpg)) | Public domain | 1200×669 | **1915-era** two funnels, tripod; hull and barbettes unchanged by the rebuild | **YES for hull outline and turret stations**; superstructure wrong |
| W-D | https://upload.wikimedia.org/wikipedia/commons/0/0b/Queen_Elizabeth_class_battleship_main_weapon.svg | sas1975kr, own work | Public domain | vector | stylized turret-position diagram | yes, but not scale-accurate |
| W-E | https://upload.wikimedia.org/wikipedia/commons/1/10/Queen_Elizabeth_class_silhouette.jpg | Antiochus the Great | CC-BY-SA 4.0 | 692×182 | its own description says *aircraft carrier*; probably the 2017 carrier | **do not use** |
| W-F | https://upload.wikimedia.org/wikipedia/commons/c/c0/HMS_Warspite%2C_Indian_Ocean_1942.jpg | IWM A 11787, Lt D. C. Oulds RN (the Wikipedia infobox image) | Crown copyright expired, public domain | 1258×974 | 1942, oblique aerial | yes; superstructure massing, not a plan |
| W-G | https://upload.wikimedia.org/wikipedia/commons/3/32/The_Second_British_Naval_Action_Off_Narvik._13_April_1940%2C_Aerial_Photographs_From_a_Fleet_Air_Arm_Aircraft._A39.jpg | IWM A 39 | Crown copyright expired on Commons; IWM's own scan terms are non-commercial | 1812×1772 | 1940, oblique | legally yes, limited value |
| W-H | RMG as-fitted 1937 plans NPC5160 / 5163 / 5164 / 5168 ([object 1176506](https://rmg.co.uk/collections/objects/rmgc-object-1176506) etc.) | Portsmouth Yard, Sep 1937 | © Crown copyright, National Maritime Museum; **no image online** | — | **1937 true as-fitted deck plans, sheets 1–10** | not usable without buying a scan |
| W-I | the-blueprints.com HMS Warspite 1942 (Saranga); naval-encyclopedia.com warspite-BP.gif | commercial / unknown provenance | all rights reserved / unknown | — | 1942 | **NO** |
| W-J | Robert Brown, *Battleship Warspite: Detailed in the Original Builders' Plans* (Seaforth); Kagero TopDrawings 18 | print | all rights reserved | — | 1937 as-fitted | NO, but the authoritative source if exactness is wanted |

No Warspite-specific line drawing exists on Commons (63 files in [the category](https://commons.wikimedia.org/wiki/Category:HMS_Warspite_(ship,_1913))); the 1923 class plate is the only plan.

### 3.2 Hull geometry

| Item | Value | Source |
|---|---|---|
| Length overall | 643 ft 9 in = **196.2 m** | [QE class](https://en.wikipedia.org/wiki/Queen_Elizabeth-class_battleship); [Warspite](https://en.wikipedia.org/wiki/HMS_Warspite_(03)) |
| Waterline length | 634 ft 6 in = 193.4 m (ONI plate: "634½' W.L.") | same; W-A |
| Beam after bulges / 1937 | 104 ft = **31.7 m** (as built 27.6 m) | same; W-A "BEAM: 104'" |
| Draught 1937 | 9.9 m | same |
| LOA : beam | **6.19** (the stubbiest of the four) | derived |
| Funnel | the two funnels were trunked into one in 1924–26; single funnel kept in 1937 | same |

Superstructure along LOA **[measured on W-A, ±0.02]**: forward edge of the block tower ≈0.35; tower core 0.42–0.47; **funnel center ≈0.52**; athwartships catapult ≈0.57; hangar/crane block ends ≈0.66; max beam 0.45–0.55. 6 in casemate recesses run along the hull side from the bridge forward to abreast B turret; none aft.

### 3.3 Main battery

Eight BL 15 in Mk I in four twin turrets A, B, X, Y in two superfiring pairs ([QE class](https://en.wikipedia.org/wiki/Queen_Elizabeth-class_battleship); mounts converted to 30° elevation in 1934–37, [navweaps](http://www.navweaps.com/Weapons/WNBR_15-42_mk1.php)). Barbettes were never moved, so the 1923 plate is valid for stations.

| Turret | Fraction from bow, ONI 1937 [measured] | Fraction, Brassey's 1923 [measured] | Facing | **Recommended** |
|---|---|---|---|---|
| A | 0.19 | 0.19 | forward | **0.19** |
| B | 0.27 | 0.26 | forward, superfires over A | **0.265** |
| X | 0.69 | 0.69 | aft, superfires over Y | **0.69** |
| Y | 0.77 | 0.77 | aft | **0.77** |

Pair spacing ≈0.075–0.08 LOA (~50 ft).

### 3.4 Firing arcs

- **Sourced:** 15 in Mk I family trains **±150°**, 2°/s ([navweaps](http://www.navweaps.com/Weapons/WNBR_15-42_mk1.php)); given once for the mount, not per ship.
- **Estimated:** A reaches its ±150° stop (only B's face behind it). B is blocked astern by the block tower starting ≈0.35, only 0.08 LOA behind it, so a wide dead sector astern. X is blocked ahead by the hangar/crane block ending ≈0.66, only 0.03 LOA ahead of it: tight. Y reaches its stop. Practical: A and Y ≈300°, B and X somewhat less.
- **Bearing count:** bow-on 4, broadside 8, stern-on 4.

### 3.5 Secondaries (flavor only)

| Weapon | Count (post-1937) | Placement | Source |
|---|---|---|---|
| BL 6 in Mk XII casemate | 8 (infobox); all removed 1944 | upper-deck casemates on the broadside, abreast/abaft B turret and the bridge; 4 per side implied, not stated | [Warspite](https://en.wikipedia.org/wiki/HMS_Warspite_(03)); W-A |
| QF 4 in Mk XVI twin HA | 4 twins | main deck either side, flanking the funnel/bridge ≈0.49–0.54 [measured] | [naval-encyclopedia](https://naval-encyclopedia.com/ww2/uk/queen-elizabeth-class-battleships.php); [uboat.net](https://www.uboat.net/allies/warships/4057.html) |
| Octuple 2-pdr pom-pom | 4 | around the funnel | same |
| Aircraft | hangar for 4, athwartships catapult, 2 cranes abaft the funnel | 0.57–0.66 | W-A |

Wikipedia's 6 in count is internally inconsistent (text implies 10, infobox says 8).

### 3.6 Not found

Per-turret arcs; barbette station numbers; a free high-res plan of the 1937 configuration (the RMG as-fitted sheets exist but are not online); a Commons drawing of Warspite herself.

---

## 4. USS Iowa (BB-61, 1943–45)

### 4.1 Reference drawings

| # | Image | Source / author | License | Px | View | Trace-safe? |
|---|---|---|---|---|---|---|
| I-A | https://upload.wikimedia.org/wikipedia/commons/8/88/Iowa_classe_battleships_drawing.jpg | ONI recognition drawing, Iowa class WWII, profile + **full plan**, bow RIGHT ([file page](https://commons.wikimedia.org/wiki/File:Iowa_classe_battleships_drawing.jpg)) | PD-USGov-Military-Navy | 1900×700 | plan + profile | **YES. Primary source**; all Iowa fractions measured on it. |
| I-B | https://upload.wikimedia.org/wikipedia/commons/c/c9/ONI_identification_image_Iowa_class_battleship.jpg | ONI 54-B sheet (Nov 1943), LOA 887' and heights printed ([file page](https://commons.wikimedia.org/wiki/File:ONI_identification_image_Iowa_class_battleship.jpg)) | PD-USGov | 844×237 | profile + small plan | YES, low-res |
| I-C | https://www.ibiblio.org/hyperwar/OnlineLibrary/photos/images/h44000/h44528.jpg | NH 44528 NHHC recognition silhouette ([page](https://www.ibiblio.org/hyperwar/OnlineLibrary/photos/usnshtp/bb/bb61cl-d.htm)) | US Navy | 740×370 | profile only | YES |
| I-D | https://www.ibiblio.org/hyperwar/OnlineLibrary/photos/images/s-file/s511-21.jpg | S-511-21 BuShips Spring Styles 1940 preliminary design | US Navy | 2000×1005 | profile only, pre-build | YES |
| I-E | https://upload.wikimedia.org/wikipedia/commons/2/21/An_overhead_view_of_the_battleship_USS_IOWA_%28BB-61%29_with_its_guns_trained_to_fire_a_broadside_to_starboard_-_DPLA_-_713c2970ba2eb19067a3aceacd161ff9.jpeg | DN-SC-86-04793, PH1 Jeff Hilton, 1 Jul 1984 ([NARA 6404904](https://catalog.archives.gov/id/6404904)) | PD US DoD | 3000×1944 | **true vertical overhead**, 1984 refit (hull + turrets valid, deck fit not) | YES for hull outline and turret footprint |
| I-F | http://navsource.net/archives/01/061/016142.jpg | USN aerial, 10 Jun 1944, oblique ~45°, WWII fit ([NavSource page](https://www.navsource.net/archives/01/61a.htm)) | photo is US Navy PD; NavSource claims rights on its pages, no 80-G number given | 2200×2016 | oblique high-angle | GRAY: trace geometry, do not redistribute the file |
| I-G | http://navsource.net/archives/01/061/016108k.jpg | USN blimp photo, 12 Nov 1943 | as I-F | 1000×1334 | oblique, superstructure detail | GRAY as I-F |
| I-H | https://upload.wikimedia.org/wikipedia/commons/1/1e/BB61_MS32-1B.jpg | US Navy, c.1944 | PD-USGov | 1764×827 | port profile photo | YES |
| I-I | A.D. Baker III drawings (Friedman, *U.S. Battleships*); Jean Secardin line art; the-blueprints.com Iowa 1945 | print / private / commercial | all rights reserved | — | — | **NO** |

Booklet of General Plans: HNSA/maritime.org scans were unreachable (504 / 404); NARA holds the BB-61 BGP ([DPLA record](https://dp.la/item/0a418d39f0cba5194e22aed99f3e4554)); Model Monkey redistributes US Navy sheets at $0 behind a checkout, most usefully the **BB-63 Missouri 1941–44 profile + superstructure deck plans** which it says match Iowa's original appearance ([product page](https://model-monkey.com/product-page/uss-missouri-bb-63-1944-profile-and-upper-superstructure-decks)). Not fetched. No Wikipedia silhouette exists.

### 4.2 Hull geometry

| Item | Value | Source |
|---|---|---|
| Length overall | 887 ft 3 in = **270.43 m** | [Iowa class](https://en.wikipedia.org/wiki/Iowa-class_battleship); I-B |
| Waterline length | 860 ft = 262.1 m | same |
| Beam max | 108 ft 2 in = **32.97 m** | same |
| Draft | 37 ft 2 in full load (11.3 m) | same |
| LOA : beam | **8.20** (the slimmest of the four) | derived |
| Frames | 217 at 4 ft; frame 0 just abaft the bow 20 mm tub | [crew handbook](https://mathscinotes.com/wp-content/uploads/2017/12/IowaCrewHandbook.pdf) (unofficial) |

Superstructure along LOA **[measured on I-A]**: block ≈0.39–0.70; fore tower / conning tower ≈0.46–0.54; **funnel 1 ≈0.515, funnel 2 ≈0.61**; aft tower / mainmast ≈0.60–0.64.

### 4.3 Main battery

Nine 16 in/50 Mark 7 in three triple turrets, two forward (II superfiring over I), one aft ([Armament of the Iowa class](https://en.wikipedia.org/wiki/Armament_of_the_Iowa-class_battleship)); gun axes 122 in apart ([navweaps](https://navweaps.com/Weapons/WNUS_16-50_mk7.php)).

| Turret | Facing | Gunhouse center, fraction from bow [measured, I-A] | ≈ ft from bow | Frame cross-check (handbook) |
|---|---|---|---|---|
| I | forward | **0.284** | 252 | citadel starts frame 50 "just forward of Turret 1" |
| II | forward, superfires over I | **0.364** | 323 | armored deck starts frame 87 "aft of Turret 2" |
| III | aft | **0.741** | 657 | frames 151–166 bracket Turret 3 |

Caveat: these are gunhouse centroids; the barbette pivot sits ~0.01 toward amidships because the gunhouse overhangs toward the guns.

### 4.4 Firing arcs

- **Sourced** ([navweaps](https://navweaps.com/Weapons/WNUS_16-50_mk7.php)): WWII "All Turrets: **±150°**", train 4°/s. (1980s restricted: I ±139°, II ±126°, III ±128°.) Wikipedia: "rotated about 300°… fired back beyond the beam, over the shoulder."
- **Interpretation:** the 60° dead sector is dead astern for I and II, dead ahead for III. No WWII per-turret blind-arc tables online.
- **Bearing count:** bow-on 6, broadside 9, stern-on 3.

### 4.5 Secondaries (flavor only)

Twenty 5 in/38 in ten Mark 28 twin mounts, five per side on the superstructure deck edge, symmetric, at approximately **0.47, 0.50, 0.535, 0.59, 0.63** of LOA [measured, I-A; visible on I-F] ([Armament article](https://en.wikipedia.org/wiki/Armament_of_the_Iowa-class_battleship)). 1943 AA: 76×40 mm quads, 52×20 mm.

### 4.6 Not found

An 80-G-numbered WWII vertical overhead; official barbette frame numbers; a reachable Booklet of General Plans scan; per-turret WWII blind arcs beyond ±150°.

---

## 5. Synthesis

### 5.1 Comparison table (the sitting's input)

| | **Yamato** | **Bismarck** | **Warspite** (1937) | **Iowa** |
|---|---|---|---|---|
| LOA (m) | 263.0 | 251.0 | 196.2 | 270.4 |
| Beam (m) | 38.9 | 36.0 | 31.7 | 33.0 |
| LOA : beam | 6.76 | 6.97 | 6.19 | 8.20 |
| Layout (ruled) | 3×3 | 4×2 | 4×2 | 3×3 |
| Turret centers, fraction from bow | 0.31 · 0.39 · **0.74** | 0.215 · 0.29 · **0.72 · 0.795** | 0.19 · 0.265 · **0.69 · 0.77** | 0.284 · 0.364 · **0.741** |
| (bold = aft-facing) | | | | |
| Superfiring | No. 2 over No. 1 | Bruno over Anton; Caesar over Dora | B over A; X over Y | II over I |
| Sourced train limit | ±150° | **±145°** | ±150° | ±150° |
| Guns bearing bow / broadside / stern | 6 / 9 / 3 | 4 / 8 / 4 | 4 / 8 / 4 | 6 / 9 / 3 |
| Funnel(s), fraction from bow | 0.59 | 0.50 | 0.52 | 0.515, 0.61 |
| Superstructure extent | 0.44–0.71 | 0.33–0.68 | 0.35–0.66 | 0.39–0.70 |
| Real secondaries | 2–4 × 15.5 cm triples + 12.7 cm twins | 6 × 15 cm twins, 3 per side | 8 × 6 in casemates + 4 × 4 in twins | 10 × 5 in twins, 5 per side |
| Primary trace source | Y-A (CC-BY-SA, Alexpl) | B-A (ONI 204 Tirpitz, PD) | W-C hull + W-A superstructure (both PD) | I-A (ONI, PD) |

Every fraction is a pixel measurement on the named drawing (±0.01, Warspite ±0.02). Bismarck's are the midpoint of frame-derived and measured values. No published station/frame numbers were found for any turret on any ship except Bismarck's kbismarck frame table.

### 5.2 What the four drawings confirm against the rulings

- The amendment 6(d) bearing counts hold on the real ships: 3×3 hulls give 6 bow / 9 broadside / 3 stern, 4×2 hulls give 4 / 8 / 4.
- The published train limits are nearly uniform: ±150° on three ships, ±145° on Bismarck. The real differentiator is not the mechanical stop but **where the superfiring partner and the superstructure sit**, which the fractions above capture. Yamato's lone aft turret and Iowa's long bare forecastle are the two visibly distinct layouts; Bismarck and Warspite are both symmetric 2+2 and will read alike top-down, which the forge already accepted as a weak point.

### 5.3 Game scale (for the sitting, not a ruling)

The sim's silhouette polygon is the hitbox, normalized so bow-to-stern equals the class `hull.length` and max width equals `hull.beam` (`shared/src/sim/silhouette.ts`; current battleship 124 × 32 u, ratio 3.9). The real ships are 6.2–8.2 long per beam, so a to-scale top-down sprite is roughly **twice as slender** as today's battleship polygon. If Iowa is pinned at today's 124 u (0.4585 u/m):

| | Yamato | Bismarck | Warspite | Iowa |
|---|---|---|---|---|
| Length (u) | 120.6 | 115.1 | 90.0 | 124.0 |
| Beam (u) | 17.8 | 16.5 | 14.5 | 15.1 |

Open questions for Eric at the sitting: (a) true proportions vs. a readability fattening, and whether beam or length carries the hitbox feel; (b) whether the four hulls keep their real relative lengths (Warspite 27 % shorter than Iowa) or get normalized; (c) turret pivot vs. gunhouse-center as the arc origin.

### 5.4 License posture

| Posture | Items |
|---|---|
| **Trace freely, no credit needed** (US federal / expired Crown / PD) | B-A, B-B, W-A, W-B, W-C, W-D, W-F, I-A, I-B, I-C, I-D, I-E, I-H, Y-E, Y-F |
| **Trace with attribution + share-alike** | Y-A, Y-B, Y-C (CC-BY-SA, credit Alexpl); B-F (CC-BY-SA 3.0 DE, Bundesarchiv) |
| **Read proportions only; never copy or commit the file** | B-C (scanner's no-repost request), B-D (kbismarck), I-F, I-G (NavSource host claims) |
| **Do not use** | Y-G, Y-H, Y-I, W-E (wrong ship), W-I, I-I, all the-blueprints.com, Secardin, Baker/Friedman, Kagero, Brown |
| **Unresolved provenance** | Y-D (NH 111711, PD claim plausible, NHHC item page unreachable) |

Our own silhouette polygons traced from PD drawings are ours. A polygon traced from Y-A inherits CC-BY-SA; cleanest is to trace Yamato's hull outline from Y-A but keep the deliverable a hand-authored polygon (as the existing board SVG outlines are), and credit Alexpl in the research doc, which this does.

### 5.5 Recommended next step

Run the design sitting as a live artifact: the four primary drawings side by side, our silhouette polygons overlaid at one scale, turret dots at the fractions above, arc wedges at ±150° (±145° Bismarck) with superstructure-blocked sectors dimmed, dials for scale and arc. Eric's yes on that page becomes the spec input for `gds-create-story 10-4`.

---

## 6. Sources

Primary drawings: Y-A https://commons.wikimedia.org/wiki/File:Yamato1945.png · B-A https://commons.wikimedia.org/wiki/File:Tirpitz-1.jpg · W-A http://ibiblio.org/hyperwar/USN/ref/ONI/ONI-201/index.html · W-C https://commons.wikimedia.org/wiki/File:Queen_Elizabeth_class_diagrams_Brasseys_1923.jpg · I-A https://commons.wikimedia.org/wiki/File:Iowa_classe_battleships_drawing.jpg · I-E https://catalog.archives.gov/id/6404904

Gun data: navweaps.com pages WNJAP_18-45_t94, WNGER_15-52_skc34, WNBR_15-42_mk1, WNUS_16-50_mk7 (linked inline). Ship data: Wikipedia articles for each ship and class (linked inline); kbismarck.com genedata / armament / proteccioni; combinedfleet.com/yamato.htm; uboat.net/allies/warships/4057.html; naval-encyclopedia.com QE class page; the unofficial Iowa crew handbook (mathscinotes.com).
