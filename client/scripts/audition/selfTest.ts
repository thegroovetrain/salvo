// The audition page's SELF-TEST (Story 10.13): render every cue candidate
// (near, and far for sounds heard out on the water) and every engine set × hull
// through an OfflineAudioContext and the real master chain, and report each
// render's length, peak and loudness (engines also: energy below 200 Hz,
// 200 Hz–1 kHz and above 1 kHz).
// `soundAudition.mjs --selftest` calls it
// in headless Chromium and fails on silence, non-finite samples or clipping.

import { CUE_SLOTS, ENGINE_CANDIDATES, SINKING_DEMO_S, STORM_CANDIDATES } from '../../src/audio/synth/candidates/index.js';
import { bandRms, type Bands } from './bands.js';
import { StormBedVoice, type StormBedProfile } from '../../src/audio/stormBed.js';
import { klaxonSeriesS, scheduleSinkingDemo } from './sinking.js';
import { Synth } from '../../src/audio/synth/render.js';
import { createMasterChain } from '../../src/audio/synth/master.js';
import { cueLengthS, distanceShape, type CueRecipe } from '../../src/audio/synth/recipe.js';
import { EngineVoice, RemoteEngineVoice } from '../../src/audio/engineGraph.js';
import type { EngineInput, EngineProfile } from '../../src/audio/engine.js';

export interface SelfTestItem {
  id: string;
  lengthS: number;
  peak: number;
  /** RMS of the loudest 100 ms window: a rough "how loud does it get". */
  rms: number;
  /** Peak of the same render WITHOUT the master chain (how hard it drives the chain). */
  rawPeak: number;
  /** RMS of the last half second (the sinking demo must end in silence). */
  tailRms?: number;
  /** Engines: RMS per band over the settled part of the render (bands.ts). */
  bands?: Bands;
}

const SAMPLE_RATE = 44100;
/** The shared reverb's tail outlives the voice by about this long. */
const REVERB_TAIL_S = 3.2;
const MAX_RENDER_S = 15;
const FAR = 0.8;
const ENGINE_RENDER_S = 3;
/** Engine band energy is measured from here on (after the fade-in and the boost surge). */
const ENGINE_SETTLED_S = 1.5;
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

type Build = (ctx: BaseAudioContext, sink: AudioNode) => void;

async function voiceOnce(build: Build, master: boolean): Promise<{ peak: number; rms: number; bands: Bands }> {
  const { ctx, input } = offline(ENGINE_RENDER_S, master);
  build(ctx, input);
  const buf = await ctx.startRendering();
  return { ...measure(buf), bands: bandRms(buf, ENGINE_SETTLED_S) };
}

/** A continuous engine voice: through the master chain (with band energy) and raw. */
async function renderVoice(id: string, build: Build): Promise<SelfTestItem> {
  const m = await voiceOnce(build, true);
  const raw = await voiceOnce(build, false);
  return { id, lengthS: ENGINE_RENDER_S, ...m, rawPeak: raw.peak };
}

const renderEngine = (id: string, profile: EngineProfile, input: EngineInput): Promise<SelfTestItem> =>
  renderVoice(id, (ctx, sink) => new EngineVoice(ctx, sink, profile, { rand: seeded(5) }).update(input, 0));

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

/** Another ship (Bismarck) flat out right alongside, per set: the remote voice must stay dark too. */
async function remoteItems(): Promise<SelfTestItem[]> {
  const out: SelfTestItem[] = [];
  for (const set of ENGINE_CANDIDATES) {
    const profile = set.profiles.bismarck;
    out.push(await renderVoice(`engine.${set.id}.remote.alongside`, (ctx, sink) => {
      new RemoteEngineVoice(ctx, sink, profile, { rand: seeded(5) }).update({ speed01: 1, distance01: 0, pan: 0 }, 0);
    }));
  }
  return out;
}

/** Render `build` through the master chain and raw; the RMS of the last `tailS` is optional. */
async function renderWith(id: string, lengthS: number, build: (ctx: BaseAudioContext, sink: AudioNode) => void, tailS = 0): Promise<SelfTestItem> {
  const once = async (master: boolean) => {
    const { ctx, input } = offline(lengthS, master);
    build(ctx, input);
    const buf = await ctx.startRendering();
    return { ...measure(buf), tail: tailS > 0 ? tailRms(buf, tailS) : undefined };
  };
  const m = await once(true);
  const raw = await once(false);
  return { id, lengthS, peak: m.peak, rms: m.rms, rawPeak: raw.peak, tailRms: m.tail };
}

function tailRms(buf: AudioBuffer, tailS: number): number {
  const from = Math.max(0, buf.length - Math.floor(tailS * buf.sampleRate));
  let sum = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) for (const v of buf.getChannelData(c).subarray(from)) sum += v * v;
  return Math.sqrt(sum / Math.max(1, (buf.length - from) * buf.numberOfChannels));
}

async function klaxonItems(): Promise<SelfTestItem[]> {
  const out: SelfTestItem[] = [];
  for (const c of CUE_SLOTS.find((s) => s.klaxon)?.candidates ?? []) {
    const series = klaxonSeriesS(c.recipe);
    const len = series[series.length - 1] + cueLengthS(c.recipe) + REVERB_TAIL_S;
    out.push(await renderWith(`klaxon.${c.id}.x3`, len, (ctx, sink) => {
      const synth = new Synth(ctx, sink, { rand: seeded(7) });
      for (const d of series) synth.play(c.recipe, { delayS: d, rand: seeded(11) });
    }));
    out.push(await renderWith(`klaxon.${c.id}.sinking`, SINKING_DEMO_S + 1, (ctx, sink) => void scheduleSinkingDemo(ctx, sink, c.recipe, seeded(13)), 0.5));
  }
  return out;
}

const STORM_RENDER_S = 4;
const STORM_STEP_S = 0.1;

function storm(ctx: BaseAudioContext, sink: AudioNode, profile: StormBedProfile): void {
  const v = new StormBedVoice(ctx, sink, profile, { rand: seeded(17) });
  for (let t = 0; t <= STORM_RENDER_S; t += STORM_STEP_S) v.update(1, t);
}

async function stormItems(): Promise<SelfTestItem[]> {
  const out: SelfTestItem[] = [];
  const engine = ENGINE_CANDIDATES[0].profiles.bismarck;
  out.push(await renderWith(`storm.engineAlone.${ENGINE_CANDIDATES[0].id}.bismarck.full`, STORM_RENDER_S, (ctx, sink) => new EngineVoice(ctx, sink, engine, { rand: seeded(5) }).update(FULL, 0)));
  for (const c of STORM_CANDIDATES) {
    out.push(await renderWith(`storm.${c.id}`, STORM_RENDER_S, (ctx, sink) => storm(ctx, sink, c.profile)));
    out.push(await renderWith(`storm.${c.id}+engine`, STORM_RENDER_S, (ctx, sink) => {
      storm(ctx, sink, c.profile);
      new EngineVoice(ctx, sink, engine, { rand: seeded(5) }).update(FULL, 0);
    }));
  }
  return out;
}

export async function auditionSelfTest(): Promise<SelfTestItem[]> {
  return [...(await cueItems()), ...(await klaxonItems()), ...(await stormItems()), ...(await engineItems()), ...(await remoteItems())];
}
