// NO "FISH" ON ANY IN-GAME SURFACE (Eric 2026-09-30, epic-8 amendment 178):
// *"I hate that you call torpedoes fish."* A structural scan of every string
// literal in the client's non-test sources (comments are not surfaces and are
// skipped by construction — the TypeScript scanner tells the two apart).

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });
}

const LITERALS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

/** Every string-literal text in one file. */
function literals(path: string): string[] {
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const walk = (node: ts.Node): void => {
    if (LITERALS.has(node.kind)) out.push((node as ts.LiteralLikeNode).text);
    ts.forEachChild(node, walk);
  };
  walk(file);
  return out;
}

describe('no player-facing "fish" (amendment 178)', () => {
  it('scans a real source tree', () => {
    expect(sources(SRC).length).toBeGreaterThan(50);
  });

  it('no string literal in client/src says "fish"', () => {
    const hits = sources(SRC).flatMap((path) =>
      literals(path)
        .filter((t) => /fish/i.test(t))
        .map((t) => `${relative(SRC, path)}: ${t.slice(0, 80)}`),
    );
    expect(hits).toEqual([]);
  });
});
