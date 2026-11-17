# Sound synthesis research — Story 10.13 The Sound Pass (2026-11-11)

Research record for the sound pass: WebAudio-only recipes; [mine] = the researcher's own recipe on sourced physics, [S#] = sourced.

**About the sources.** I could not reach the text of Farnell's *Designing Sound* chapters on engines, explosions and guns. The SuperCollider port on Wikibooks is reachable, but its "Motors" and "Cars" pages are empty. So the engine and gun recipes below are mine, built on sourced physics: blade rate, DEMON modulation, pulse-train engines, N-wave and Friedlander blast shapes. They are tagged **[mine]**. Sourced techniques are tagged **[S#]**; the list is at the end.

## 0. Shared building blocks (build once at load)

- **Noise buffers.** Pre-generate 4 s mono buffers of white, pink and brown noise once.
  - Pink: Paul Kellet filter.
  - Brown: `b = (b + 0.02*w)/1.02`, then ×3.5.
  - Every one-shot starts at a **random offset** (`src.start(t, Math.random()*3)`). This is the cheapest anti-repetition trick. **[mine]**
- **Pre-render one-shots.** Render each heavy one-shot into 4–6 variants with `OfflineAudioContext` at load, then play them as buffers. That is still sample-free, because the audio is generated at runtime, but it cuts a 12-node gun voice down to 1 node. **[mine]** (Tone.js uses `Tone.Offline` the same way for reverb IRs **[S5]**.)
- **Soft clip.** A `WaveShaper` with curve `tanh(k·x)/tanh(k)`, k = 2–4, `oversample='4x'`. Use it on blast bodies and the engine bus.
- **Envelopes.** Use `setValueAtTime`, `linearRampToValueAtTime` for attacks, and `setTargetAtTime(0, t, τ)` for decays. Exponential ramps must end at 0.0001 or above, never 0.
- **Modal-resonator helper** (metal, wood, bubbles): a noise burst or 1-sample click feeds parallel `bandpass` biquads at high Q. Each mode decays with τ ≈ Q/(π·f), so T60 ≈ 2.2·Q/f seconds. Raise Q for a longer ring. **[mine]**

## 1. Ship engine (continuous)

Physics anchor:
- Propeller **blade rate = blades × shaftRPM/60** Hz; shaft rate = RPM/60 **[S10]**.
- Broadband cavitation noise is **amplitude-modulated at blade rate**, which naval sonar calls "DEMON" **[S11]**.
- Blade-rate harmonics up to 6× are audible at full power **[S12]**.
- A WW2 battleship turns about 30–200 shaft RPM with 4–5 blades, so blade rate is about **2–17 Hz**. You hear that as a *throb*, not a pitch.
- Engine audio is built from *pulse trains*, not sustained tones **[S9]**.

**A — "Steam turbine": deep throb under a faint gear whine, with water rushing past.** **[mine on S10–S12]**

Set `rpm = 30 + 170·speed`, `fBR = blades·rpm/60`.
1. **Rumble.** Brown noise → lowpass (Q 0.7), cutoff `70 + 110·throttle` Hz → gain `0.35 + 0.45·throttle`.
2. **Throb.**
   - Pink noise → bandpass `55 + 60·speed` Hz, Q 1.5 → GainNode with base gain 0.5.
   - An LFO feeds that gain param. The LFO is an `OscillatorNode` with a custom `PeriodicWave` of harmonics [1, 0.5, 0.25] (a peaky pulse) at `fBR`. LFO gain (modulation depth) is `0.25 + 0.3·speed`.
   - Use 2 shafts, each with its own LFO detuned ±1.5%. Their slow beating gives the real "chug".
3. **Gear/turbine whine.** Two triangle oscillators at `fG = 280 + 520·throttle` and `2.01·fG` → bandpass at fG, Q 6 → gain 0.015–0.04, rising with throttle. Add vibrato from a 0.3 Hz sine at ±0.4% depth.
4. **Hull wash.** Pink noise → bandpass `600 + 900·speed` Hz, Q 0.5 → gain `speed^1.5 × 0.5`. Slow random AM comes from two summed sines at 0.13 and 0.31 Hz, depth 0.3. Above speed 0.6, add highpass 3 kHz noise for spray at gain 0.1·(speed−0.6).
5. Sum all paths → soft clip (k 1.5) → engine bus.

Drive every parameter with `setTargetAtTime(v, now, 0.15–0.4)` at about 10 Hz. Do not touch `.value` every frame.

**Boost (flank surge):**
- Ramp the throttle target to 1 with τ 0.6 s.
- Overshoot the whine pitch +15% for 1.5 s, then settle.
- Raise the rumble's soft-clip drive from k 1.5 to 3.
- Raise wash gain +4 dB.
- At boost start, a pink-noise swell → lowpass 400→1500 Hz over 1.2 s.

**B — "Diesel": a pulse-train engine with an audible firing rate, a grittier chug.** Based on the pulse-train plus exhaust-resonator model in **[S9]**; the SpudzzDev Web Audio engine does a full worklet version **[S13]**.
- Firing rate (4-stroke): `fF = (cyl/2)·rpm/60`. With 8–12 cylinders at 250–650 RPM that is about **17–65 Hz**.
- Source: an oscillator with a PeriodicWave approximating a fast-rise, exponential-fall pulse (harmonics 1/n^0.8).
- Add jitter so it is not machine-perfect: brown noise → gain `0.02·fF` → `osc.frequency`.
- Then: soft clip → 3 parallel "pipe/hull" bandpasses at 110, 240 and 480 Hz (Q 4, gains 1/0.6/0.3) → lowpass `200 + 1200·throttle`.
- Layer A's wash path (4) on top.

**C — "Cheap single-path": low CPU, decent.** **[mine]** Only A's throb (2) and wash (4) paths. Use it for a low-quality setting.

**Four hull variants** (set the parameters, keep the same graph). Values are **[mine]**; tune them by ear.

| Hull | Blades/shafts | rpm max | Whine fG | Rumble cutoff | Character |
|---|---|---|---|---|---|
| Heavy | 3 / 4 | 160 | 220–500 | 60–140 | slow, deepest throb |
| Standard | 4 / 4 | 200 | 280–800 | 70–180 | baseline |
| Fast | 4 / 2 | 260 | 450–1300 | 90–240 | higher whine, quicker throb |
| Light | 5 / 2 | 320 | 600–1800 | 110–300 | buzzy, little sub |

**Other ships' engines** **[mine]**:
- Each remote ship gets one chain: shared brown buffer (random offset) → bandpass at its blade-rate band → one LFO at its fBR → lowpass → gain → StereoPanner.
- Distance mapping: `gain = r0/(r0 + k·(d−r0))`, cutoff `= clamp(2500·e^(−d/D), 120, 2500)`, `pan = clamp(dx/W, −0.8, 0.8)`.
- Cap voices at the **3–4 nearest audible**. Fade the others out (τ 0.3 s) and disconnect them.
- Update at 10 Hz.

## 2. Main battery (15–18 inch)

Physics: a gun report is a muzzle blast with a Friedlander-type pressure pulse (very fast rise, then exponential decay with a negative phase), plus the shell's N-wave crack **[S14][S15]**.

**A — "Layered cannon": huge thump, crack, then rolling thunder.** **[mine]** Pre-render 6 variants.
1. **Sub thump.** Sine starting at 60 Hz, exponential ramp to 26 Hz over 300 ms. Gain: attack 2 ms, then `setTargetAtTime` τ 0.35. Through soft clip k 3 to add harmonics, so small speakers still get "weight".
2. **Blast body.** White+brown mix → lowpass Q 0.8, cutoff exponential ramp 2500→140 Hz over 700 ms. Gain: attack 1 ms to 1.0, τ 0.45.
3. **Crack.** White → highpass 1.8 kHz. Gain: attack 0.5 ms, τ 18 ms. Optionally a Friedlander click buffer: `p(t) = (1 − t/T)·e^(−b·t/T)`, T 6–10 ms, b 2.
4. **Rolling tail.** Brown → lowpass 260 Hz. Gain τ 1.4 s, with random AM from a 4–7 Hz LFO jittered per shot, depth 0.4.
5. **Horizon echoes.** Two DelayNodes at 0.42 s and 0.95 s ±20%, gains 0.35 and 0.2, each lowpassed at 500 Hz.
6. Send heavily to the global reverb (§12) at −6 dB.
- **Salvo:** fire turret guns with a 30–80 ms random stagger, each as its own variant. This doubling reads as "battleship".
- **Variation:** ±8% on the thump start frequency, ±15% on body τ, ±2 dB.

**Distant version:**
- Drop the crack.
- Apply the distance lowpass, around 350 Hz at range.
- Pre-delay of `d/343 m/s`, scaled to gameplay and capped at 1.5 s.
- Lengthen the tail ×1.5, gain −15 to −25 dB.
- Reverb send stays high, so the wet/dry ratio rises with distance.

**B — "Physical Friedlander": tighter and more "real recording".** **[mine on S14/S15]** Generate one Friedlander pulse buffer (T 25 ms, b 1.5, with a negative tail) mixed with 30% white noise. Run it through soft clip k 4, then a lowpass envelope 3 kHz→200 Hz over 400 ms, then the convolver (IR 4 s). Fewer nodes, less rumble control.

## 3. Secondary guns (5–6 inch QF)

**A — "Sharp QF bark": short and dry, stacks cleanly.** **[mine]**
- Crack: white → highpass 1.2 kHz, τ 25 ms.
- Body: white → bandpass 320 Hz, Q 1.2, τ 70 ms.
- Thump: sine 110→55 Hz over 70 ms, τ 60 ms.
- Short tail: brown → lowpass 400 Hz, τ 180 ms.

Anti-mud measures:
- Highpass the reverb send at 180 Hz, send −14 dB.
- Voice cap 4 with oldest-voice stealing (fade 15 ms).
- Each new shot ducks the previous tail −6 dB.
- Jitter cutoffs ±10% so a rapid series does not machine-gun.

**B — "Brassy pom-pom": a slight metallic ring.** Same as A plus a 2-mode ring at 1.1 kHz and 1.62 kHz (Q 25, gain 0.08) for breech and mount clatter.

## 4. Torpedo

**Launch A — "Compressed-air whoosh then splash".** **[mine]**
- Thump: sine 70→40 Hz, 80 ms.
- Air: pink noise → bandpass with Q 2, center exponential ramp 3.5 kHz → 700 Hz over 300 ms. Gain: attack 15 ms, τ 120 ms.
- 250–400 ms later, a small splash (§7 recipe, scale 0.5).

**Run (optional), "faint screw whine":**
- Sine 1.4–1.9 kHz (per torpedo ±5%), vibrato 6 Hz ±0.3%.
- Plus highpass 2 kHz noise with AM at about 40 Hz (fast screw blade rate).
- Lowpass 2.5 kHz, gain about −30 dB, distance-mapped like engines.
- Cap at 2 voices.

## 5. Mine drop

**A — "Heavy plop with a gurgle".** Physics: splash sound is dominated by entrained bubbles, not the impact **[S7][S8]**. Bubble pitch follows Minnaert, f ≈ 3.26/r Hz (r in m), so big bubbles sit at 100–300 Hz.
- Impact: white → lowpass 900 Hz, τ 40 ms.
- Big-bubble "bloop": sine 140 Hz rising ×1.6 over 120 ms. The rising-pitch bubble follows the SC model, which sweeps freq ×1→×e over 0.1 s with a perc envelope of 10 ms attack and 80 ms decay **[S1]**. Gain τ 90 ms.
- Then 4–8 small bubbles at 600–2500 Hz, random onsets within 400 ms, each with the [S1] bubble envelope.
- Slosh: brown → bandpass 300 Hz, Q 0.7, τ 300 ms.

**Chain rattle (optional)** **[mine]**: 12–20 clicks at 25–40 Hz with ±30% jitter, lasting about 500 ms. Each click is white noise, 6 ms, → bandpass 2.5–4.5 kHz (random), Q 12. Precede the plop by 400 ms.

## 6. Special shells (distinguishing cues)

**Flash/star shell, A — "Pop, then a bright sizzling flare".** **[mine + S1]**
- Muffled launch (secondary-gun recipe at −6 dB, lowpass 1 kHz).
- 0.6–1 s later, the burst: highpass 2.5 kHz noise crack with τ 30 ms, plus a sine 900→300 Hz "fwump", τ 80 ms.
- Then a 2–3 s sizzle using the fire recipe [S1]:
  - Hiss: highpass 1 kHz noise, amplitude from a squared-squared slow random LFO.
  - Crackles: white bursts of 0–20 ms decay at random about 15/s, each through bandpass 100–1000 Hz random, Q high.

**Generic ways to give a shell its own identity** **[mine]**:
- **AP:** add a short metallic ring to the gun report (modes 1.3 kHz / 2.1 kHz, Q 40, gain 0.1) and a harder crack (highpass 2.5 kHz, +3 dB). On impact, a "punch-through" double hit: clang, then a muffled internal boom 60 ms later, lowpass 400 Hz.
- **Fouling:** a wet signature. The impact gets the §5 bubble cluster plus a downward-gliding bandpass "gloop" (800→250 Hz, Q 5, 200 ms).
- **Shell flight whistle** (use sparingly, as an identity cue): narrowband noise (bandpass Q 15) gliding 1.6 kHz → 700 Hz over the flight time, gain swelling in. Give each special shell its own center frequency.

## 7. Hits and misses

**Steel-hull hit, A — "Clang + boom".** **[mine on S3/S4]**
- Metallic layer: a click/noise burst (3 ms) feeding 5–6 bandpasses at base f0 = 180–320 Hz × inharmonic ratios [1, 1.47, 2.09, 2.56, 3.39, 4.17]. Q 40–80 gives a 0.3–0.8 s ring. Gains fall about 3 dB per mode.
- Inharmonic partials are the key to "metal". Synth Secrets builds metal and bells from inharmonic FM pairs **[S3][S4]**.
- Explosion body: the §3 secondary report ×1.5 duration.
- Randomize f0 ±15% per hit.

**Steel-hull hit, B — "FM clang", cheaper.** Carrier 210 Hz, modulator ratio 1.41 (inharmonic) **[S4]**. FM index 8 decaying to 0 with τ 150 ms. Gain τ 400 ms. Plus the noise body.

**Miss splash, A — "Water column".** **[mine on S7]**
- Impact: white → bandpass with Q 1, center falling 2.5 kHz → 400 Hz over 350 ms. Gain: attack 5 ms, τ 150 ms.
- Body: brown → lowpass 600 Hz, τ 250 ms, with a 30 ms "whump" sine at 90 Hz.
- Spray/fall-back tail, starting 300 ms in and lasting 1.5 s: about 60–120 droplets/s, thinning out. Each droplet is a sine at 1–4 kHz with the [S1] bubble envelope (1 ms attack, 10–30 ms decay) or a short highpass noise tick. The rain/running-water recipes in [S1] use random triggers at 170/s with 800–2400 Hz pitch.
- **Cheap alternative:** highpass 1.5 kHz noise with amplitude from squared random AM at 25 Hz, τ 500 ms.

**Own hull hit** **[mine]**: the steel-hit recipe with these changes:
- f0 lowered to 120–200 Hz, Q 60–100 so the hull "groans".
- Sub thump sine 50→25 Hz, τ 0.4 s, soft clipped.
- Bus all music and engine audio −8 dB for 600 ms.
- Pan at center.
- Optional debris rattle: 6–10 small metal clicks (5–8 kHz modes, τ 20 ms) over 400 ms.

## 8. Hull repair (damage control)

**A — "Hammer + pump", 1.5 s cue.** **[mine]**
- 4–6 hammer strikes at 3.5 Hz ±20%. Each is a 3-mode metal ring with f0 900–1100 Hz random, ratios [1, 2.3, 3.7], Q 25, plus a highpass noise tick.
- Under it, a pump chug: brown → bandpass 150 Hz, Q 2, gain modulated by a 2 Hz pulse LFO at depth 0.6.

**B — "Welding sizzle".** The fire recipe from [S1] (hiss + crackles) through bandpass 3 kHz, Q 0.8. Arc buzz: a sawtooth at 100 Hz (mains hum), gain 0.03, lowpass 1.5 kHz. 1–2 s.

**C — "Ratchet".** 10 clicks at 12 Hz, each with metal modes at 2.2/3.4 kHz, Q 15, τ 15 ms. Then one heavy clunk: f0 400 Hz, Q 20.

## 9. Smoke screen

**A — "Pressurized hiss".** **[mine]**
- White → bandpass 2.8 kHz, Q 0.7. Gain: attack 80 ms, hold, τ 600 ms release.
- A parallel lowpass 500 Hz "whoosh" whose cutoff opens 300→900 Hz over the first 400 ms.
- A small valve "thunk" at the start: sine 120→60 Hz, 60 ms.
- Jitter the hiss AM with random 8–15 Hz modulation, depth 0.15, so it sputters.

**B — "Smoke generator roar".** Brown → lowpass 250 Hz with a 1 Hz random AM, plus A's hiss at −6 dB. Sounds like burning fuel oil.

## 10. Radio beacon

**A — "Morse on shortwave".** **[mine]**
- Carrier: sine at 650–750 Hz. That is the classic CW (continuous-wave Morse) tone, so give each beacon its own pitch.
- Drift: a 0.1 Hz sine at ±3 Hz depth.
- Keying through a GainNode with 5 ms ramps; hard keying clicks.
- Morse timing at 18–20 WPM: dot = 1200/WPM ms, about 60 ms; dash = 3 dots; gaps are 1, 3 and 7 dots.
- Fading: an extra gain from a 0.15–0.3 Hz LFO at depth 0.4.
- Static bed:
  - Pink noise → bandpass 300–3000 Hz (two biquads) at −24 dB.
  - Plus crackles: random 2–10 ms bursts at about 3/s, highpass 1 kHz.
  - Then the whole bus through bandpass 400–2800 Hz (a "radio speaker" band) and a mild soft clip k 2.

**B — "Heterodyne".** Two sines a few Hz apart (700 and 703 Hz) give a beating whistle. Use this for "beacon nearby / tuning in".

## 11. Airdrop pickup

**A — "Haul aboard".** **[mine]**
- A small splash (§7 at 0.4 scale).
- Then 2 wooden knocks 120 ms apart. Wood = a click into 3 bandpasses at 210/470/820 Hz, Q 10, τ 60–90 ms. Low Q is what makes it wood rather than metal.

**B — "Ship's bell confirmation"**: a realistic but satisfying "got it". One bell strike made with FM: carrier 880 Hz, modulator ratio 1.4, index 5→0 with τ 0.3 s, gain τ 1.2 s. Or partial ratios [0.5, 1, 1.2, 1.5, 2, 2.6, 3] (the hum/prime/tierce bell model) via sines **[S3]**. A double strike ("ding-ding", 250 ms apart) reads as positive.

## 12. General: realism, size, mixing, performance

- **Open-water IR** **[mine, built on S5/S6]**. There are no walls, so keep reflections sparse:
  - Stereo buffer, 3.5 s.
  - 0–120 ms: 6–10 sparse impulses at random times (8–120 ms), amplitude falling (superstructure and sea-surface reflections), independent per channel.
  - From 150 ms: white noise with exponential decay, gain `10^(−3t/T60)`, T60 2.5–3.5 s.
  - The tail is lowpassed with a cutoff sliding 4 kHz → 300 Hz across its length. This is the reverbGen `lpFreqStart/lpFreqEnd` approach; its example is decay 2.5 s, fade-in 0.1 s, LP 15 kHz→1 kHz **[S5]**. It is based on Moorer's finding that decaying noise makes a good reverb. You can render the filtered noise through an OfflineAudioContext **[S6]**.
  - Use **one** shared ConvolverNode on a send bus, never one per voice.
- **Distance.** Lowpass `clamp(2500·e^(−d/D), 120…)`, pre-delay `d/c` (capped), more wet than dry far away, gain rolloff as in §1, StereoPanner from the screen-x offset.
- **Size.** Layer sub (sine), body (filtered noise), transient (highpass noise) and tail. Soft clip the sub to add harmonics so laptops still hear the weight. Very short transients plus long tails make a sound feel big.
- **Randomization** per event: noise offset, filter frequency ±10%, decay ±15%, gain ±2 dB, salvo stagger, and choosing among 4–6 pre-rendered variants.
- **Ducking.** On main-battery fire or own-hull hit, bring the engine and ambience bus −6 to −8 dB with `setTargetAtTime` (τ 10 ms down, τ 300 ms back up). That is a sidechain done in code; the Web Audio API has no native sidechain.
- **Master chain:**
  - Bus compressor: threshold −18, knee 6, ratio 4, attack 10 ms, release 250 ms.
  - Then a "limiter" DynamicsCompressor: threshold −3, knee 0, ratio 20, attack 1 ms, release 100 ms.
  - Then master gain.
- **CPU:**
  - One AudioContext only.
  - Pre-render one-shots.
  - Cap voices per category: main 6, secondary 6, splashes 6, hits 4, remote engines 4, total at most 32.
  - Steal the oldest voice with a 15 ms fade.
  - Disconnect nodes `onended`.
  - Update continuous parameters at 10–20 Hz with `setTargetAtTime`, not per frame.
  - BiquadFilter and Gain are cheap. Convolver and many oversampled WaveShapers are expensive.
  - Avoid AudioWorklet unless you need a true per-sample engine like [S13]. Nothing above requires one.
- **Autoplay pitfalls:**
  - Create or `resume()` the context inside the first pointerdown/keydown handler **[S16][S17]**.
  - Watch `statechange`. On iOS/Safari, re-resume after the `"interrupted"` state (phone call, background).
  - Suspend the context on `visibilitychange` hidden.
  - Generate noise buffers and IRs *after* the first gesture, or during the home screen, so there is no load-time stall.
  - The web.dev "Racer" case study tried pure synthesis for an engine and fell back to samples **[S18]**. That is a warning to budget tuning time for the engine and to layer it (recipe 1A) rather than relying on one oscillator.

## Sources

- [S1] Designing Sound in SuperCollider (Farnell recipes ported; fire, bubbles, running water, rain, alarms): https://en.wikibooks.org/wiki/Designing_Sound_in_SuperCollider/Print_version
- [S2] Farnell procedural-audio interview: https://designingsound.org/2012/01/18/procedural-audio-interview-with-andy-farnell/
- [S3] Sound On Sound, Synth Secrets, "Synthesizing Bells": https://www.soundonsound.com/techniques/synthesizing-bells ; "Analysing Metallic Percussion": https://www.soundonsound.com/techniques/analysing-metallic-percussion ; series index: https://github.com/rupa/synth-secrets
- [S4] FM synthesis of metallic sounds (non-integer ratios): https://www.synthtopia.com/content/2018/09/02/fm-synthesis-of-metallic-sounds/ ; https://beatkitchen.io/guides/synthesis/07-fm-synthesis
- [S5] reverbGen (Moorer decaying-noise IR, LP sweep): https://github.com/adelespinasse/reverbGen ; Tone.js Reverb: https://tonejs.github.io/docs/14.7.58/Reverb
- [S6] gskinner, Making Reverb with Web Audio API: https://blog.gskinner.com/?p=3842
- [S7] Zheng & James, Harmonic Fluids (splash sound comes from entrained bubbles): https://www.cs.cornell.edu/projects/HarmonicFluids/
- [S8] Moss et al., Sounding Liquids (bubble resonance, real-time): https://gamma.cs.unc.edu/SoundingLiquids/soundingliquids.pdf ; van den Doel: https://www.cs.ubc.ca/~kevinlb/LCI/03/vandendoel-040312.html
- [S9] Doerfler & Wyse 2026, pulse-train engine synthesis with exhaust resonators: https://arxiv.org/html/2603.09391
- [S10] Propeller blade-rate/shaft-rate noise: https://web.itu.edu.tr/takinaci/NoiseSimulation/JMST-2011-136-Final-Ver4.pdf ; https://blog.vibrationdata.com/?p=150472
- [S11] Tip-vortex cavitation noise, DEMON blade-rate modulation: https://arxiv.org/html/2405.15133v1
- [S12] DTIC, blade-rate harmonics up to 6× at full power: https://apps.dtic.mil/sti/pdfs/ADA346182.pdf
- [S13] SpudzzDev/en, Web Audio physically informed engine (AudioWorklet): https://github.com/SpudzzDev/en
- [S14] Maher et al., gunshot N-wave and muzzle blast: https://montana.edu/rmaher/publications/nesar_whitaker_maher_aesconf_0624_22631.pdf
- [S15] Procedural gunshot synthesis (Springer chapter): https://rd.springer.com/chapter/10.1007/978-3-319-53088-8_4
- [S16] MDN Web Audio best practices: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- [S17] Chrome, Web Audio autoplay policy and games: https://developer.chrome.com/blog/web-audio-autoplay
- [S18] web.dev, The Sounds of Racer: https://web.dev/case-studies/racer-sound
- MDN ConvolverNode: https://developer.mozilla.org/en-US/docs/web/api/convolvernode
