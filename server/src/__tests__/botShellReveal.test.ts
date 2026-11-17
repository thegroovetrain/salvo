// A BOT IS NOT OFFERED SHELLS IN FLIGHT (Story 11.2 follow-up, Eric 2026-11-13,
// epic-11 amendment 5). No bot code reads a `shell` reveal, a bot's view is on
// no wire, and with Story 11.2's reaches the scan was the largest share of a
// full-lobby tick. The contract: a captain and a bot standing on the same
// water are offered the same TORPEDO, and only the captain is offered the
// SHELL; the bot pays no eye work for it.
import { describe, it, expect } from 'vitest';
import { CONFIG, pointInIsland, type Vec2 } from '@salvo/shared';
import { World } from '../game/world.js';
import { observe } from '../game/perception.js';

function openWater(w: World): Vec2 {
  // Clear of every island's bounding circle by more than the scene's own span.
  const span = 300;
  for (let r = 0; r < w.map.radius - span; r += 50) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 2 * Math.PI;
      const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
      const clear = w.map.islands.every((isle) => !pointInIsland(p, isle) && Math.hypot(p.x - isle.x, p.y - isle.y) > isle.r + span);
      if (clear) return p;
    }
  }
  throw new Error('no open water on this seed');
}

function scene(): { w: World; captain: string; bot: string } {
  const w = new World(11, 4);
  const at = openWater(w);
  const cap = w.addShip('cap', 'CAP', 'captain', undefined, undefined, undefined);
  Object.assign(cap.state, { x: at.x, y: at.y, heading: 0, speed: 0 });
  const bot = w.addBot(undefined, undefined);
  Object.assign(bot.state, { x: at.x, y: at.y + 60, heading: 0, speed: 0 });
  // A third hull owns the ordnance, so neither observer sees it as its own.
  const far = w.addShip('far', 'FAR', 'captain', undefined, undefined, undefined);
  Object.assign(far.state, { x: at.x + 200, y: at.y, heading: 0, speed: 0 });
  const base = {
    ownerId: 'far', vx: CONFIG.gun.shellSpeed, vy: 0, distLeft: 5000, bornAt: w.now,
    damage: CONFIG.gun.damage, hitRadius: CONFIG.gun.shellRadius,
    targetX: null, targetY: null, burstRadius: 0, contactDamage: CONFIG.gun.damage, hits: CONFIG.gun.hits,
  };
  // Both well inside every eye reach that applies (the torpedo reach is the short one).
  const near = CONFIG.vision.torpedoSight / 4;
  w.shells.set('sh', { ...base, id: 'sh', x: at.x + near, y: at.y + 30, kind: 'shell', family: 'cannon' });
  w.shells.set('tp', { ...base, id: 'tp', x: at.x + near, y: at.y + 30, kind: 'torp', family: null, vx: CONFIG.torpedo.speed });
  return { w, captain: 'cap', bot: bot.id };
}

const kinds = (w: World, id: string): string[] => observe(w, id).events.map((e) => e.k);

describe('a bot is not offered shells in flight', () => {
  it('the captain is offered the shell and the torpedo; the bot only the torpedo', () => {
    const { w, captain, bot } = scene();
    const cap = kinds(w, captain);
    expect(cap).toContain('shell');
    expect(cap).toContain('torp');
    const b = kinds(w, bot);
    expect(b).not.toContain('shell');
    expect(b).toContain('torp');
  });

  it('a pass for the bot starts no more eye work with shells in the air than without', () => {
    const { w, bot } = scene();
    const work = (): number => {
      const before = w.fogWalks + w.losTests;
      observe(w, bot);
      return w.fogWalks + w.losTests - before;
    };
    const withShell = work();
    w.shells.delete('sh');
    w.ships.get(bot)!.seenBallistics.clear();
    expect(withShell).toBe(work());
  });
});
