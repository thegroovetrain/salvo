// THE PRIVATE ROW (cycle 167, Eric ruling 7): the deploy stack's third line,
// CREATE and JOIN. Pinned: exactly those two buttons in SOLO VS AI's unlit
// phosphor register; both doors share the other doors' contract (first-run →
// class bay, busy → dimmed and refused); and neither ever writes
// `hullcracker.mode` — a private lobby is not a mode a reload re-enters.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makePrivateRow } from '../ui/privateRow.js';
import { showHome } from '../ui/home.js';

function home(): HTMLElement {
  return document.getElementById('main-menu') as HTMLElement;
}

function door(label: 'CREATE' | 'JOIN'): HTMLButtonElement {
  return [...home().querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement;
}

describe('makePrivateRow', () => {
  it('builds exactly two buttons, CREATE then JOIN, and nothing else', () => {
    const row = makePrivateRow(vi.fn(), vi.fn());
    expect([...row.root.children]).toEqual([row.create, row.join]);
    expect(row.root.textContent).toBe('CREATEJOIN');
    expect(row.create.tagName).toBe('BUTTON');
    expect(row.join.tagName).toBe('BUTTON');
  });

  it('wears the unlit phosphor register — outline, no glow, never amber', () => {
    const row = makePrivateRow(vi.fn(), vi.fn());
    for (const btn of [row.create, row.join]) {
      expect(btn.style.borderColor).toBe('var(--hc-phosphor)');
      expect(btn.style.borderWidth).toBe('1px');
      expect(btn.style.borderRadius).toBe('8px');
      expect(btn.style.boxShadow).toBe('');
      expect(btn.outerHTML).not.toContain('amber');
    }
  });

  it('routes each click to its own callback', () => {
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    const row = makePrivateRow(onCreate, onJoin);
    row.create.click();
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onJoin).not.toHaveBeenCalled();
    row.join.click();
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('setBusy dims both doors exactly as the home dims the others', () => {
    const row = makePrivateRow(vi.fn(), vi.fn());
    row.setBusy(true);
    expect(row.create.style.opacity).toBe('0.4');
    expect(row.join.style.cursor).toBe('default');
    row.setBusy(false);
    expect(row.create.style.opacity).toBe('1');
    expect(row.join.style.cursor).toBe('pointer');
  });
});

describe('showHome — the CREATE / JOIN doors', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    home()?.remove();
    document.getElementById('hc-class-select')?.remove();
  });

  it('hand the deploy identity to their own door, never the others', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    localStorage.setItem('hullcracker.name', 'NEMO');
    const onDeploy = vi.fn();
    const onSolo = vi.fn();
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    showHome('0.0.0-test', onDeploy, vi.fn(), onSolo, { onCreate, onJoin });
    door('CREATE').click();
    door('JOIN').click();
    expect(onCreate).toHaveBeenCalledWith('NEMO', 'battleship', expect.any(String));
    expect(onJoin).toHaveBeenCalledWith('NEMO', 'battleship', expect.any(String));
    expect(onDeploy).not.toHaveBeenCalled();
    expect(onSolo).not.toHaveBeenCalled();
  });

  it('first run (no class stored) opens the class bay instead, like SOLO VS AI', () => {
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    showHome('0.0.0-test', vi.fn(), vi.fn(), vi.fn(), { onCreate, onJoin });
    door('CREATE').click();
    expect(onCreate).not.toHaveBeenCalled();
    expect(document.getElementById('hc-class-select')).not.toBeNull();
  });

  it('a busy home dims them and refuses the press', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    const handle = showHome('0.0.0-test', vi.fn(), vi.fn(), vi.fn(), { onCreate, onJoin });
    handle.setBusy(true);
    expect(door('CREATE').style.opacity).toBe('0.4');
    expect(door('JOIN').style.opacity).toBe('0.4');
    door('CREATE').click();
    door('JOIN').click();
    expect(onCreate).not.toHaveBeenCalled();
    expect(onJoin).not.toHaveBeenCalled();
    handle.setBusy(false);
    expect(door('JOIN').style.opacity).toBe('1');
  });

  it('never writes hullcracker.mode', () => {
    localStorage.setItem('hullcracker.class', 'battleship');
    showHome('0.0.0-test', vi.fn(), vi.fn(), vi.fn(), { onCreate: vi.fn(), onJoin: vi.fn() });
    door('CREATE').click();
    door('JOIN').click();
    expect(localStorage.getItem('hullcracker.mode')).toBeNull();
  });
});
