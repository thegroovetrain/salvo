// The community-link templates (Eric ruling 2026-08-28) — the ONLY place in the
// client where a Discord or Reddit URL is built. Every row of the spec's I/O
// matrix is taken here against explicit env records, because the validation is
// the one gate standing between a pasted env value and an href.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { communityLinks, discordHref, subredditHref } from '../ui/communityLinks.js';

describe('discordHref', () => {
  it('templates a bare invite code', () => {
    expect(discordHref('abc123')).toBe('https://discord.gg/abc123');
  });

  it('accepts the characters Discord itself uses in a code', () => {
    expect(discordHref('a-B_9')).toBe('https://discord.gg/a-B_9');
  });

  it('tolerates a full invite link in either form, with or without www / trailing slash', () => {
    // The two paste mistakes a human actually makes — Discord's own UI hands
    // out the link, not the code.
    expect(discordHref('https://discord.gg/abc123')).toBe('https://discord.gg/abc123');
    expect(discordHref('https://www.discord.gg/abc123')).toBe('https://discord.gg/abc123');
    expect(discordHref('https://discord.com/invite/abc123')).toBe('https://discord.gg/abc123');
    expect(discordHref('http://discord.com/invite/abc123/')).toBe('https://discord.gg/abc123');
  });

  it('tolerates every OTHER shape Discord actually hands out (review gate, cycle 132)', () => {
    // The "invite with event" share link, the legacy discordapp.com host, the
    // canary/ptb clients, a scheme-less paste, and mixed case in the host.
    expect(discordHref('https://discord.gg/abc123?event=1234')).toBe('https://discord.gg/abc123');
    expect(discordHref('https://discord.gg/abc123/#x')).toBe('https://discord.gg/abc123');
    expect(discordHref('https://discordapp.com/invite/abc123')).toBe('https://discord.gg/abc123');
    expect(discordHref('https://canary.discord.com/invite/abc123')).toBe('https://discord.gg/abc123');
    expect(discordHref('https://ptb.discord.com/invite/abc123')).toBe('https://discord.gg/abc123');
    expect(discordHref('discord.gg/abc123')).toBe('https://discord.gg/abc123');
    expect(discordHref('HTTPS://Discord.GG/abc123')).toBe('https://discord.gg/abc123');
  });

  it('bounds the code length and strips zero-width characters', () => {
    expect(discordHref('-')).toBeNull(); // one character is not a code
    expect(discordHref('a'.repeat(65))).toBeNull();
    expect(discordHref('a'.repeat(64))).toBe(`https://discord.gg/${'a'.repeat(64)}`);
    expect(discordHref('abc123\u200B')).toBe('https://discord.gg/abc123');
    expect(discordHref('\uFEFFabc123')).toBe('https://discord.gg/abc123');
  });

  it('trims whitespace', () => {
    expect(discordHref('  abc123 ')).toBe('https://discord.gg/abc123');
  });

  it('treats unset / empty / non-string as unset', () => {
    expect(discordHref(undefined)).toBeNull();
    expect(discordHref('')).toBeNull();
    expect(discordHref('   ')).toBeNull();
    expect(discordHref(42)).toBeNull();
  });

  it('treats a malformed value as unset rather than rendering it', () => {
    // The path-traversal shape is the one that matters: it must never reach an
    // href, and it must not throw either.
    expect(discordHref('a b/../x')).toBeNull();
    expect(discordHref('abc 123')).toBeNull();
    expect(discordHref('https://example.com/abc123')).toBeNull();
    expect(discordHref('abc/123')).toBeNull();
  });
});

describe('subredditHref', () => {
  it('templates a bare subreddit name', () => {
    expect(subredditHref('hullcracker')).toBe('https://www.reddit.com/r/hullcracker/');
  });

  it('strips a pasted r/ or /r/ prefix', () => {
    expect(subredditHref('r/hullcracker')).toBe('https://www.reddit.com/r/hullcracker/');
    expect(subredditHref('/r/hullcracker')).toBe('https://www.reddit.com/r/hullcracker/');
  });

  it('tolerates the full URL, an uppercase R/, a trailing slash and a space (review gate, cycle 132)', () => {
    expect(subredditHref('https://www.reddit.com/r/hullcracker/')).toBe('https://www.reddit.com/r/hullcracker/');
    expect(subredditHref('https://old.reddit.com/r/hullcracker')).toBe('https://www.reddit.com/r/hullcracker/');
    expect(subredditHref('reddit.com/r/hullcracker')).toBe('https://www.reddit.com/r/hullcracker/');
    expect(subredditHref('R/hullcracker')).toBe('https://www.reddit.com/r/hullcracker/');
    expect(subredditHref('r/hullcracker/')).toBe('https://www.reddit.com/r/hullcracker/');
    expect(subredditHref('r/ hullcracker')).toBe('https://www.reddit.com/r/hullcracker/');
    expect(subredditHref('hullcracker\u200B')).toBe('https://www.reddit.com/r/hullcracker/');
    // A URL to anywhere else is still not a subreddit.
    expect(subredditHref('https://example.com/r/hullcracker')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(subredditHref('  hullcracker ')).toBe('https://www.reddit.com/r/hullcracker/');
  });

  it("takes Reddit's own 2-21 word-character rule", () => {
    expect(subredditHref('ab')).toBe('https://www.reddit.com/r/ab/');
    expect(subredditHref('a_1')).toBe('https://www.reddit.com/r/a_1/');
    expect(subredditHref('h')).toBeNull(); // too short
    expect(subredditHref('a'.repeat(22))).toBeNull(); // too long
    expect(subredditHref('a'.repeat(21))).toBe(`https://www.reddit.com/r/${'a'.repeat(21)}/`);
  });

  it('treats unset / empty / non-string / malformed as unset', () => {
    expect(subredditHref(undefined)).toBeNull();
    expect(subredditHref('')).toBeNull();
    expect(subredditHref('r/')).toBeNull();
    expect(subredditHref('hull cracker')).toBeNull();
    expect(subredditHref('hull-cracker')).toBeNull(); // reddit names take no dash
    expect(subredditHref(7)).toBeNull();
  });
});

describe('communityLinks', () => {
  it('is EMPTY with neither var set — the zero-config port is byte-identical', () => {
    expect(communityLinks({})).toEqual([]);
  });

  it('returns DISCORD then REDDIT when both are configured', () => {
    expect(
      communityLinks({ VITE_DISCORD_INVITE: 'abc123', VITE_SUBREDDIT: 'hullcracker' }),
    ).toEqual([
      { label: 'DISCORD', href: 'https://discord.gg/abc123' },
      { label: 'REDDIT', href: 'https://www.reddit.com/r/hullcracker/' },
    ]);
  });

  it('drops a missing one without reordering the rest', () => {
    expect(communityLinks({ VITE_SUBREDDIT: 'hullcracker' })).toEqual([
      { label: 'REDDIT', href: 'https://www.reddit.com/r/hullcracker/' },
    ]);
    expect(communityLinks({ VITE_DISCORD_INVITE: 'abc123' })).toEqual([
      { label: 'DISCORD', href: 'https://discord.gg/abc123' },
    ]);
  });

  it('drops a MALFORMED one and leaves the other unaffected', () => {
    expect(
      communityLinks({ VITE_DISCORD_INVITE: 'a b/../x', VITE_SUBREDDIT: 'hullcracker' }),
    ).toEqual([{ label: 'REDDIT', href: 'https://www.reddit.com/r/hullcracker/' }]);
  });

  describe('the default parameter reads import.meta.env', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('picks up a stubbed VITE_SUBREDDIT with no argument passed', () => {
      // The call-time read is what makes stubbing work at all (a module-load
      // read would have frozen the value before this line ran) — and it is the
      // `analytics/ga.ts` measurementId() shape. The zero-config half stubs BOTH
      // vars EMPTY rather than assuming the shell has neither: Vitest merges
      // `process.env.VITE_*` and `client/.env*` into `import.meta.env`, so a
      // developer who set one to QA the row would otherwise fail this pin
      // (review gate, cycle 132 — the ads/analytics suites stub the same way).
      vi.stubEnv('VITE_DISCORD_INVITE', '');
      vi.stubEnv('VITE_SUBREDDIT', '');
      expect(communityLinks()).toEqual([]);
      vi.stubEnv('VITE_SUBREDDIT', 'hullcracker');
      expect(communityLinks()).toEqual([
        { label: 'REDDIT', href: 'https://www.reddit.com/r/hullcracker/' },
      ]);
    });
  });
});
