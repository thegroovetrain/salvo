// Eric's picks (Story 10.13): one value per slot ('A' / 'B' / 'C', 'none', or
// unset), remembered in localStorage when the browser allows it, and summed up
// as one line he can paste into chat.

const KEY = 'soundAudition.picks.v3';

export class Picks {
  private readonly values = new Map<string, string>();
  private readonly listeners: Array<() => void> = [];

  constructor(private readonly order: readonly string[]) {
    this.load();
  }

  get(slot: string): string | null {
    return this.values.get(slot) ?? null;
  }

  set(slot: string, value: string): void {
    this.values.set(slot, value);
    this.save();
    for (const fn of this.listeners) fn();
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  /** e.g. `engines=turbine; mainBattery=B; secondaries=?; …` (? = not picked yet). */
  summary(): string {
    return this.order.map((slot) => `${slot}=${this.values.get(slot) ?? '?'}`).join('; ');
  }

  private load(): void {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return;
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (this.order.includes(k) && typeof v === 'string') this.values.set(k, v);
      }
    } catch {
      // no storage (private window, blocked site data): picks live for this visit only
    }
  }

  private save(): void {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(this.values)));
    } catch {
      // as above
    }
  }
}
