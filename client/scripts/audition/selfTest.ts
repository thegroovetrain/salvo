// The audition page's SELF-TEST (Story 10.13): render every cue candidate
// (near, and far for sounds heard out on the water) and every engine set × hull
// through an OfflineAudioContext and the real master chain, and report each
// render's length, peak and loudness. `soundAudition.mjs --selftest` calls it
// in headless Chromium and fails on silence, non-finite samples or clipping.

import { CUE_SLOTS, ENGINE_CANDIDATES } from '../../src/audio/synth/candidates/index.js';
import { Synth } from '../../src/audio/synth/render.js';
import { createMasterChain } from '../../src/audio/synth/master.js';
import { cueLengthS, distanceShape, type CueRecipe } from '../../src/audio/synth/recipe.js';
import { EngineVoice } from '../../src/audio/engineGraph.js';
import type { EngineInput, EngineProfile } from '../../src/audio/engine.js';

export interface SelfTestItem {
  id: string;
  lengthS: number;
  peak: number;
  /** RMS of the loudest 100 ms window: a rough "how loud does it get". */
  rms: number;
  /** Peak of the same render WITHOUT the master chain (how hard it drives the chain). */
  rawPeak: number;
}

const SAMPLE_RATE = 44100;
/** The shared reverb's tail outlives the voice by about this long. */
const REVERB_TAIL_S = 3.2;
const MAX_RENDER_S = 15;
const FAR = 0.8;
const ENGINE_RENDER_S = 2;
const RMS_WINDOW_S = 0.1;

/** A deterministic LCG in [0, 1), so a self-test run is repeatable. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function offline(lengthS: number, master: boolean): { ctx: OfflineAudioContext; input: AudioNode } {
  const ctx = new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * lengthS), SAMPLE_RATE);
  if (!master) return { ctx, input: ctx.destination };
  const chain = createMasterChain(ctx);
  chain.output.connect(ctx.destination);
  return { ctx, input: chain.input };
}

/** Peak, loudest-window RMS and finiteness over every channel. */
function measure(buf: AudioBuffer): { peak: number; rms: number } {
  const win = Math.max(1, Math.floor(RMS_WINDOW_S * buf.sampleRate));
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  let peak = 0;
  let best = 0;
  for (let start = 0; start < buf.length; start += win) {
    let sum = 0;
    let n = 0;
    for (const data of chans) {
      for (let i = start; i < Math.min(buf.length, start + win); i++) {
        const v = data[i];
        if (!Number.isFinite(v)) return { peak: NaN, rms: NaN };
        peak = Math.max(peak, Math.abs(v));
        sum += v * v;
        n++;
      }
    }
    best = Math.max(best, Math.sqrt(sum / Math.max(1, n)));
  }
  return { peak, rms: best };
}

/** Render one shot; `master` false measures what the chain is fed. */
async function cueOnce(recipe: CueRecipe, d01: number, lengthS: number, master: boolean): Promise<{ peak: number; rms: number }> {
  const { ctx, input } = offline(lengthS, master);
  const synth = new Synth(ctx, input, { rand: seeded(7) });
  if (!synth.play(recipe, { distance01: d01, rand: seeded(11) })) return { peak: 0, rms: 0 };
  return measure(await ctx.startRendering());
}

async function renderCue(id: string, recipe: CueRecipe, d01: number): Promise<SelfTestItem> {
  const lengthS = Math.min(MAX_RENDER_S, cueLengthS(recipe) + distanceShape(d01).preDelayS + REVERB_TAIL_S);
  const m = await cueOnce(recipe, d01, lengthS, true);
  const raw = await cueOnce(recipe, d01, lengthS, false);
  return { id, lengthS, ...m, rawPeak: raw.peak };
}

async function engineOnce(profile: EngineProfile, input: EngineInput, master: boolean): Promise<{ peak: number; rms: number }> {
  const { ctx, input: sink } = offline(ENGINE_RENDER_S, master);
  const voice = new EngineVoice(ctx, sink, profile, { rand: seeded(5) });
  voice.update(input, 0);
  return measure(await ctx.startRendering());
}

async function renderEngine(id: string, profile: EngineProfile, input: EngineInput): Promise<SelfTestItem> {
  const m = await engineOnce(profile, input, true);
  const raw = await engineOnce(profile, input, false);
  return { id, lengthS: ENGINE_RENDER_S, ...m, rawPeak: raw.peak };
}

const IDLE: EngineInput = { throttle: 0, speed01: 0, boost: false };
const FULL: EngineInput = { throttle: 1, speed01: 1, boost: false };
const BOOSTED: EngineInput = { throttle: 1, speed01: 1.15, boost: true };

async function cueItems(): Promise<SelfTestItem[]> {
  const out: SelfTestItem[] = [];
  for (const slot of CUE_SLOTS) {
    for (const c of slot.candidates) {
      out.push(await renderCue(`${slot.id}.${c.id}`, c.recipe, 0));
      if (slot.world) out.push(await renderCue(`${slot.id}.${c.id}.far`, c.recipe, FAR));
    }
  }
  return out;
}

async function engineItems(): Promise<SelfTestItem[]> {
  const out: SelfTestItem[] = [];
  for (const set of ENGINE_CANDIDATES) {
    for (const [hull, profile] of Object.entries(set.profiles)) {
      out.push(await renderEngine(`engine.${set.id}.${hull}.idle`, profile, IDLE));
      out.push(await renderEngine(`engine.${set.id}.${hull}.full`, profile, FULL));
      out.push(await renderEngine(`engine.${set.id}.${hull}.boost`, profile, BOOSTED));
    }
  }
  return out;
}

export async function auditionSelfTest(): Promise<SelfTestItem[]> {
  return [...(await cueItems()), ...(await engineItems())];
}
