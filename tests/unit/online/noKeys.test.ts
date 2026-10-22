import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../src/app/online');
const PLUGIN_ENTRY = path.resolve(__dirname, '../../../src/app/plugin/onlinePlay.ts');

function sources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(ts|tsx|scss)$/.test(entry.name) ? [file] : [];
  });
}

/**
 * Who may host is the server's decision, asked with the account's token. The plugin holds no key that
 * makes tables without an account, takes no invite key, and keeps no account data at the relay.
 */
describe('online play\'s source', () => {
  const files = [...sources(ROOT), PLUGIN_ENTRY];
  const forbidden: readonly (readonly [string, RegExp])[] = [
    ['a create key', /create[\s_-]?key/i],
    ['the relay\'s invite route', /\/api\/invites/],
    ['the relay\'s account data route', /\/api\/me\/data/],
    ['a field for an invite key', /atlas-online-redeem|redeem\(/],
    ['a host check of its own', /mayHost/],
  ];

  it('reads every file of online play', () => {
    expect(files.length).toBeGreaterThan(150);
    expect(files.some((file) => file.endsWith('OnlineControl.ts'))).toBe(true);
  });

  for (const [what, pattern] of forbidden) {
    it(`names ${what} nowhere`, () => {
      const found = files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => path.relative(ROOT, file));
      expect(found).toEqual([]);
    });
  }

  const naming = (pattern: RegExp): string[] => files.filter((file) => pattern.test(readFileSync(file, 'utf8'))).map((file) => path.relative(ROOT, file)).sort();

  it('reads the account token in one place, and sends it from two', () => {
    // The secret itself is read by the token store alone, and the store by the account control alone.
    expect(naming(/getSecret\(/)).toEqual(['gm/account/tokenStore.ts']);
    expect(naming(/tokens\.get\(/)).toEqual(['gm/account/AccountControl.ts']);
    // A bearer is written by the table request and by the account's own calls (what it may host, sign-out).
    expect(naming(/Bearer \$\{/)).toEqual(['gm/account/relayAccount.ts', 'gm/createTable.ts']);
    // The diagnostics make requests of their own, and never with it.
    expect(naming(/requestUrl\(/)).toEqual(['gm/account/obsidianHttp.ts', 'gm/companionDiagnostics.ts']);
    expect(readFileSync(path.join(ROOT, 'gm/companionDiagnostics.ts'), 'utf8')).not.toMatch(/Authorization|Bearer|token\(|secretStorage/);
  });

  it('imports no Node built-in: every request goes through Obsidian or the browser', () => {
    expect(naming(/from\s+['"](?:node:|(?:http|https|net|tls|fs|path|url|crypto|child_process|os|stream|zlib|dns|events|buffer|util)['"/])|require\(|import\(\s*['"](?:node:|https?['"])/)).toEqual([]);
  });

  it('asks the relay only for tables and for the account', () => {
    const paths = new Set(files.flatMap((file) => readFileSync(file, 'utf8').match(/\/api\/(?:tables|me|invites)[a-z/]*/g) ?? []));
    expect([...paths].sort()).toEqual(['/api/me', '/api/tables', '/api/tables/']);
  });
});
