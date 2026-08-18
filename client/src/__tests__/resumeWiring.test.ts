// STORY 6.7 — the refresh resume, as WIRED in main.ts.
//
// main.ts is the app entry point (Pixi stage, DOM chrome, a live socket), so its
// wiring is pinned by reading the source, exactly as the session-lock, foghorn
// and projectiles suites already do. The pure logic these lines drive is unit
// tested elsewhere: `net/connection.ts` + `net/resumeToken.ts` in
// connection.test.ts, the missed-death decision in score.test.ts, the pre-bind
// results replay in roomBindings.test.ts, and the lock's own refresh behaviour
// in sessionLock.test.ts.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mainSrc = (): string => readFileSync(join(process.cwd(), 'src', 'main.ts'), 'utf8');

/** A top-level function body, by main.ts's own formatting (closing brace in
 *  column 0). Good enough to say WHICH function a call lives in. */
function bodyOf(src: string, signature: string): string {
  const start = src.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('\n}\n', start);
  return src.slice(start, end);
}

describe('ROOT MEANS RESUME (Story 6.7)', () => {
  it('boot tries the resume BEFORE opening the home, and returns straight into the ocean', () => {
    const body = bodyOf(mainSrc(), 'async function main(');
    expect(body).toContain('await tryResumeMatch(shell)');
    expect(body).toContain("if (resumed === 'resumed') return;");
    // Ordering is the whole point: a resume that ran AFTER enterPort would paint
    // the home screen and the ambient scene and then tear both down again.
    expect(body.indexOf('tryResumeMatch')).toBeLessThan(body.indexOf('enterPort(shell, false)'));
  });

  it('a failed resume lands on home with one plain sentence — never a dead screen', () => {
    const body = bodyOf(mainSrc(), 'async function main(');
    expect(body).toContain('enterPort(shell, false)');
    expect(body).toContain('resumeFailedStatus()');
    expect(body).toContain('homeRef?.setStatus');
  });

  it('a failed resume hands the single-session lock straight back', () => {
    // Otherwise the tab would hold the port for the life of the page and refuse
    // its own next deploy — the lock's fail-open doctrine inverted.
    const body = bodyOf(mainSrc(), 'async function tryResumeMatch(');
    expect(body).toContain('acquireSessionLock()');
    expect(body).toContain('releaseSessionLock()');
  });
});

describe('a deliberate leave is never undone by a later refresh', () => {
  const src = () => mainSrc();

  it('RETURN TO PORT / ABANDON MATCH clears the stored token', () => {
    // Both arrive here: `abandonMatch` calls `returnToPort`, and amendment 19
    // names exactly this pair as the only sanctioned ways out of a match.
    expect(bodyOf(src(), 'function makeGameReturnToPort(')).toContain('clearResumeToken()');
  });

  it('the cohort-collapse requeue clears it — there is no lobby left to resume into', () => {
    expect(bodyOf(src(), 'function makeGameRequeue(')).toContain('clearResumeToken()');
  });

  it('handleRoomLeave clears it — THE RESUME-RETRY LOOP GUARD', () => {
    // Both of that function's branches end in `location.reload()`, and a reload
    // now attempts a resume. A token left behind here would send the page
    // straight back at a room that has just finished refusing us, forever.
    const body = bodyOf(src(), 'function handleRoomLeave(');
    expect(body).toContain('clearResumeToken()');
    expect(body).toContain('location.reload()');
  });
});

describe('THERE IS NO MATCH URL (ruling R0 — investigated, considered, withdrawn)', () => {
  it('the client publishes nothing to the address bar and parses nothing out of it', () => {
    const src = mainSrc();
    expect(src).not.toContain('replaceState');
    expect(src).not.toContain('pushState');
    expect(src).not.toContain('location.pathname');
    expect(src).not.toContain('matchId');
  });
});
