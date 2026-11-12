// THE HULL-CONTACT SCRAPE'S SOUND (Story 10.13): render/contactFx.ts asks for
// a scrape every `grindRetriggerMs` while the hull slides, and says when the
// scrape ENDS. The picked take is ~1.5 s long, so this host starts a new shot
// every `periodMs` (consecutive shots overlap into one continuous grind, each
// at the current sliding level) and, when the scrape ends, stops every shot
// still sounding — the sound ends with the contact instead of ringing on.

/** The slice of a live shot this host needs (synth/render.ts `ShotHandle`). */
export interface StoppableShot {
  stop(fadeS?: number): void;
  readonly ended: boolean;
}

export class GrindCue {
  private lastAt = -Infinity;
  private live: StoppableShot[] = [];

  constructor(
    private readonly playShot: (gain: number) => StoppableShot | null | void,
    private readonly periodMs: number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** ContactFx's retrigger: a new shot only once a period has passed. */
  play(gain: number): void {
    const t = this.now();
    if (t - this.lastAt < this.periodMs) return;
    this.lastAt = t;
    this.live = this.live.filter((s) => !s.ended);
    const shot = this.playShot(gain);
    if (shot) this.live.push(shot);
  }

  /** The scrape ended: stop every live shot; the next scrape starts at once. */
  end(): void {
    for (const s of this.live) s.stop();
    this.live = [];
    this.lastAt = -Infinity;
  }
}
