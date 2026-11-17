// The audition page's sound status line (Story 10.13): always the truth about
// the AudioContext, in plain words. Pure, so the wording lives in one place.

export const STATUS = {
  off: 'Sound is off — click START SOUND',
  starting: 'Starting…',
  on: 'Sound is on',
  held: (state: string): string => `The browser is holding audio (state: ${state}) — click START SOUND again`,
} as const;

/**
 * `state` is the context's state (null = no context yet); `pending` is true
 * while a resume() started by a click has neither settled nor timed out.
 */
export function statusText(state: string | null, pending: boolean): string {
  if (state === null) return STATUS.off;
  if (state === 'running') return STATUS.on;
  return pending ? STATUS.starting : STATUS.held(state);
}
