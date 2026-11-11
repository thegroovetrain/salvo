// THE STANDARD QUEUE'S BOT-FILL SWITCH (Story 10.11, epic-10 amendment 20) —
// the ONE place the queue's environment is read. queue.ts stays pure (no env,
// no Colyseus); StandardQueueRoom and /liveness both ask this module, so the
// queue modal and the home screen can never disagree about the arm minimum.
//
//   HC_QUEUE_BOT_FILL  a NUMBER OF SECONDS (Eric 2026-11-10): how long the
//                      standard queue holds before it fills the empty seats
//                      with bots. A finite number > 0 turns bot fill ON — one
//                      captain arms, the hold is that many seconds, and the
//                      arena forms filled to CONFIG.map.playerCap. Unset,
//                      empty, 0, negative or non-numeric turns it OFF: the
//                      queue arms at CONFIG.match.minHumans, holds
//                      CONFIG.match.queueTimerMs and seats no bots.
//
// A production switch, set per service on Render — deliberately NOT gated on
// HC_DEV_OPTIONS (a smoke simply boots the server with a small value).
//
// The parser takes the env as an argument (defaulting to process.env), so the
// tests exercise it without mutating the process environment.

import { CONFIG } from '@salvo/shared';

/** The slice of an environment this module reads. */
export type QueueEnv = Readonly<Record<string, string | undefined>>;

/** What the queue room (and /liveness) are built from. */
export interface QueueFillSettings {
  /** True: an expiring pool forms an arena filled with bots to the cap. */
  botFill: boolean;
  /** Captains required to ARM the pool: 1 with bot fill, else
   *  CONFIG.match.minHumans (a bot-less arena still needs that many people). */
  armMinimum: number;
  /** ms an armed pool is held before it forms. */
  queueTimerMs: number;
}

/** The bot-fill hold in whole ms, or null when HC_QUEUE_BOT_FILL is off. */
function botFillHoldMs(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  // Whole ms (the wire's startsInMs stays an integer), and never rounded down
  // to 0: any value above zero is ON, however small.
  return Math.max(1, Math.round(seconds * 1000));
}

/** Everything the queue reads from its environment, read once. */
export function queueFillSettings(env: QueueEnv = process.env): QueueFillSettings {
  const holdMs = botFillHoldMs(env.HC_QUEUE_BOT_FILL);
  if (holdMs === null) {
    return { botFill: false, armMinimum: CONFIG.match.minHumans, queueTimerMs: CONFIG.match.queueTimerMs };
  }
  return { botFill: true, armMinimum: 1, queueTimerMs: holdMs };
}
