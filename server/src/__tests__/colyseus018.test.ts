// Story 8.0 — the three regressions the Colyseus 0.18 upgrade makes possible.
//
// Each one is a SILENT break: nothing here is caught by the compiler, and two
// of the three would first present as wrong numbers on a live server rather
// than as an error anywhere.
//
//   (a) THE 63-FIELD CAP. @colyseus/schema 5 refuses a Schema class with more
//       than MAX_FIELDS fields AT CLASS-DEFINITION TIME — i.e. at import, so
//       the whole process fails to boot rather than one room failing to
//       create. Field indexes ride the low 6 bits of the operation byte and
//       index 63 collides with SWITCH_TO_STRUCTURE, so indexes 0..62 (63
//       fields) are legal and index 63 (the 64th field) throws.
//   (b) THE PV JOIN GATE. PROTOCOL_VERSION moved 49 → 50 for the schema 5
//       encoder + the 0.18 JOIN_ROOM handshake. A gate that admitted 49 would
//       let a stale bundle in to fail later at decode.
//   (c) setMetadata IS NOW A FULL REPLACE. 0.17 shallow-merged into
//       `_listing.metadata`; 0.18 assigns over it wholesale (@colyseus/core
//       0.18.13 Room.mjs:663-669). Both rooms already write whole objects, so
//       nothing had to change — but a future "just publish the one key that
//       moved" edit is now a SILENT WIPE of every other key, and /liveness
//       reads those keys. Pinned from both sides: the runtime write must carry
//       every key, and the key list must stay complete as the type grows.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Schema, MapSchema, Metadata, type } from '@colyseus/schema';
import { PROTOCOL_VERSION } from '@salvo/shared';
import * as schemaModule from '../rooms/schema/ArenaState.js';
import { ArenaState, PlayerMeta } from '../rooms/schema/ArenaState.js';
import { ArenaRoom, type ArenaListingMeta } from '../rooms/ArenaRoom.js';
import { StandardQueueRoom, type QueueListingMeta } from '../rooms/StandardQueueRoom.js';
import { protocolVersionError } from '../rooms/roomOptions.js';

// =============================================================================
// (a) every Schema class stays under the 63-field cap
// =============================================================================

/**
 * MAX_FIELDS is NOT re-exported from `@colyseus/schema`'s barrel (only
 * `Metadata` is), so the number is restated here rather than imported — and
 * the guard below proves the restatement is the one the library enforces, by
 * driving a real class into the throw.
 *
 * Verified: `export declare const MAX_FIELDS = 63`
 * (@colyseus/schema 5.0.32 build/Metadata.d.ts:12).
 */
const MAX_FIELDS = 63;

/** Field count of a Schema class, read through the public metadata API. */
function fieldCount(klass: typeof Schema): number {
  return Object.keys(Metadata.getFields(klass) as Record<string, unknown>).length;
}

describe('schema 5: every Schema class stays under MAX_FIELDS', () => {
  // The registry is EXPLICIT rather than a directory scan: a new Schema class
  // that nobody adds here is exactly the case a scan would silently miss too
  // (it would have to be imported to be seen), and the list doubles as the
  // answer to "what actually syncs".
  const SCHEMA_CLASSES: ReadonlyArray<readonly [string, typeof Schema]> = [
    ['ArenaState', ArenaState],
    ['PlayerMeta', PlayerMeta],
  ];

  /**
   * Every Schema subclass the module actually exports, discovered by
   * inspecting the module's own namespace rather than restated by hand — so
   * a third Schema class added to that file without a row in
   * `SCHEMA_CLASSES` fails this test the moment it is exported, instead of
   * the registry silently agreeing with itself.
   */
  const exportedSchemaClasses = (
    Object.entries(schemaModule) as Array<[string, unknown]>
  ).filter(
    (entry): entry is [string, typeof Schema] =>
      typeof entry[1] === 'function' && (entry[1] as typeof Schema).prototype instanceof Schema,
  );

  it('rooms/schema/ArenaState.ts declares exactly the two classes pinned here', () => {
    // Guards the registry itself in BOTH directions: every exported Schema
    // subclass has a row in SCHEMA_CLASSES, and every row is an exported
    // Schema subclass. A directory scan can't see what a file exports
    // without importing it — this imports the module as a namespace and
    // reads real exports, so the guard fails the moment a third Schema class
    // is exported from that module without a row here.
    expect(exportedSchemaClasses.map(([name]) => name).sort()).toEqual(
      SCHEMA_CLASSES.map(([name]) => name).sort(),
    );
    // And both really carry schema metadata (a mis-typed row would pass
    // vacuously otherwise). isValidInstance takes an INSTANCE — it reads
    // `klass.constructor[Symbol.metadata]` (@colyseus/schema 5.0.32
    // index.mjs:1518-1521).
    for (const [, klass] of SCHEMA_CLASSES) {
      const Ctor = klass as unknown as new () => Schema;
      expect(Metadata.isValidInstance(new Ctor())).toBeTruthy();
    }
  });

  for (const [name, klass] of SCHEMA_CLASSES) {
    it(`${name} is under the cap`, () => {
      const n = fieldCount(klass);
      expect(n).toBeGreaterThan(0); // non-vacuous: a class with no metadata would read 0
      // A class with EXACTLY MAX_FIELDS (63) fields is legal — the throw is
      // `index >= MAX_FIELDS` (@colyseus/schema 5.0.32 index.mjs:1151-1152),
      // and the 63rd field lands at index 62. So the pin is <=, not <.
      expect(n).toBeLessThanOrEqual(MAX_FIELDS);
    });
  }

  it('ArenaState 15 / PlayerMeta 8 — the shipped counts, so growth is visible', () => {
    // NOTE for the record: the story text said ArenaState 14. Measured on the
    // shipped class it is 15 (23 `@type` decorators in the file, 8 of them on
    // PlayerMeta) — the story figure was stale, and neither number is close to
    // the cap.
    expect(fieldCount(ArenaState)).toBe(15);
    expect(fieldCount(PlayerMeta)).toBe(8);
  });

  it('THE GUARD IS REAL: defining a 64th field (index 63) throws at class-definition time', () => {
    // Non-vacuity proof for the whole block. `Metadata.addField` throws on
    // `index >= MAX_FIELDS` (@colyseus/schema 5.0.32, index.mjs:1151-1152), and
    // decorators run while the class body is being evaluated — so this is a
    // BOOT failure, not a runtime one. Built through Metadata.setFields rather
    // than 64 hand-written decorators so the test states the cap, not a wall
    // of fields.
    const overCap: Record<string, 'number'> = {};
    for (let i = 0; i < MAX_FIELDS + 1; i += 1) overCap[`f${i}`] = 'number';
    expect(() => {
      class TooManyFields extends Schema {}
      Metadata.setFields(TooManyFields, overCap as never);
    }).toThrow(/up to 63 fields/);
  });

  it('exactly 63 fields (indexes 0..62) is still legal — the true cap boundary', () => {
    const atCap: Record<string, 'number'> = {};
    for (let i = 0; i < MAX_FIELDS; i += 1) atCap[`f${i}`] = 'number';
    expect(() => {
      class AtCap extends Schema {}
      Metadata.setFields(AtCap, atCap as never);
    }).not.toThrow();
    // And prove it actually LANDED all 63, not merely that no throw fired.
    const AtCapKlass = class extends Schema {} as unknown as typeof Schema;
    Metadata.setFields(AtCapKlass, atCap as never);
    expect(fieldCount(AtCapKlass)).toBe(MAX_FIELDS);
  });

  it('62 fields is legal too — one under the boundary', () => {
    const under: Record<string, 'number'> = {};
    for (let i = 0; i < MAX_FIELDS - 1; i += 1) under[`f${i}`] = 'number';
    expect(() => {
      class UnderCap extends Schema {}
      Metadata.setFields(UnderCap, under as never);
    }).not.toThrow();
  });

  it('a MapSchema field costs ONE slot, not one per entry', () => {
    // ArenaState.players is the only collection on the wire; if a map ever
    // billed per key the cap arithmetic above would be meaningless.
    class OneMap extends Schema {
      @type({ map: PlayerMeta }) roster = new MapSchema<PlayerMeta>();
    }
    expect(fieldCount(OneMap)).toBe(1);
  });
});

// =============================================================================
// (b) the PV join gate moved with the framework
// =============================================================================

describe('the PV join gate refuses 49 and admits 50', () => {
  it('PROTOCOL_VERSION is 50', () => {
    expect(PROTOCOL_VERSION).toBe(50);
  });

  it('refuses the immediately-previous protocol', () => {
    // 49 is the one that matters: a client built one commit before this story
    // speaks a wire the 0.18 handshake and the schema 5 encoder have both moved.
    expect(protocolVersionError(49)).toMatch(/refresh/i);
  });

  it('refuses a missing pv', () => {
    expect(protocolVersionError(undefined)).toMatch(/refresh/i);
  });

  it('refuses a FUTURE pv too (the gate is equality, not a floor)', () => {
    expect(protocolVersionError(51)).toMatch(/refresh/i);
  });

  it('admits exactly the current protocol', () => {
    expect(protocolVersionError(PROTOCOL_VERSION)).toBeNull();
    expect(protocolVersionError(50)).toBeNull();
  });
});

// =============================================================================
// (c) both rooms write EVERY listing-metadata key on every call
// =============================================================================

/**
 * Compile-time completeness: if `ArenaListingMeta` / `QueueListingMeta` gains a
 * field that is not added to the key arrays below, `Exclude<...>` stops being
 * `never` and this file fails to type-check. That is the half a runtime
 * assertion cannot cover — a runtime check only sees what the code DID write.
 */
type AssertNever<T extends never> = T;
type _ArenaKeysComplete = AssertNever<Exclude<keyof ArenaListingMeta, (typeof ARENA_META_KEYS)[number]>>;
type _QueueKeysComplete = AssertNever<Exclude<keyof QueueListingMeta, (typeof QUEUE_META_KEYS)[number]>>;

const ARENA_META_KEYS = ['mode', 'humans'] as const;
const QUEUE_META_KEYS = ['pooled', 'min', 'cap', 'deadlineAt'] as const;

interface MetaRoom extends Record<string, unknown> {
  setMetadata: ReturnType<typeof vi.fn>;
}

/** Every object either room handed to `setMetadata`, in call order. */
function writes(r: MetaRoom): Array<Record<string, unknown>> {
  return r.setMetadata.mock.calls.map((c) => c[0] as Record<string, unknown>);
}

function bareArena(options: Record<string, unknown> = {}): MetaRoom {
  const r = new ArenaRoom() as unknown as MetaRoom;
  r.lock = vi.fn(() => Promise.resolve());
  r.unlock = vi.fn(() => Promise.resolve());
  r.disconnect = vi.fn(() => Promise.resolve());
  r.broadcast = vi.fn();
  r.onMessage = vi.fn();
  r.setTimestep = vi.fn();
  r.clock = { setInterval: vi.fn(), setTimeout: vi.fn() };
  r.clients = [];
  r.setMetadata = vi.fn(() => Promise.resolve());
  r.allowReconnection = vi.fn(() => new Promise(() => undefined));
  (r.onCreate as (o: unknown) => void)(options);
  return r;
}

function bareQueue(): { r: MetaRoom; tick: () => void } {
  const ticks: Array<() => void> = [];
  const r = new StandardQueueRoom() as unknown as MetaRoom;
  r.clients = [];
  r.clock = {
    currentTime: 0,
    setInterval: (fn: () => void) => {
      ticks.push(fn);
      return 0;
    },
    setTimeout: () => 0,
  };
  r.setMetadata = vi.fn(() => Promise.resolve());
  (r.onCreate as () => void)();
  return {
    r,
    tick: () => {
      for (const fn of ticks) fn();
    },
  };
}

describe('0.18 setMetadata REPLACES: every listing write carries every key', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    delete process.env.HC_DEV_OPTIONS;
  });
  afterEach(() => vi.restoreAllMocks());

  it('ArenaRoom.publishListing writes exactly ArenaListingMeta, every time', () => {
    const r = bareArena();
    const all = writes(r);
    expect(all.length).toBeGreaterThan(0);
    for (const meta of all) expect(Object.keys(meta).sort()).toEqual([...ARENA_META_KEYS].sort());
  });

  it('...including a solo room, whose mode is the key a partial write would drop', () => {
    const r = bareArena({ solo: true });
    const all = writes(r);
    expect(all.length).toBeGreaterThan(0);
    for (const meta of all) expect(Object.keys(meta).sort()).toEqual([...ARENA_META_KEYS].sort());
    expect(all[all.length - 1].mode).toBe('soloVsAi');
  });

  it('StandardQueueRoom writes exactly QueueListingMeta, every time', () => {
    const { r, tick } = bareQueue();
    tick();
    tick();
    const all = writes(r);
    expect(all.length).toBeGreaterThan(0);
    for (const meta of all) expect(Object.keys(meta).sort()).toEqual([...QUEUE_META_KEYS].sort());
  });

  it('a null deadlineAt is still WRITTEN, never omitted', () => {
    // The trap this pin exists for: `deadlineAt` is null while the pool is
    // unarmed, and the natural "skip the null" edit is exactly the partial
    // write 0.18 turns into a wipe of pooled/min/cap.
    const { r } = bareQueue();
    const first = writes(r)[0];
    expect(first).toHaveProperty('deadlineAt');
    expect(first.deadlineAt).toBeNull();
  });
});
