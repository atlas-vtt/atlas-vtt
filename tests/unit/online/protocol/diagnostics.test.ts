import { describe, expect, it } from 'vitest';
import { environmentOf, errorId, parseErrorReport, parseFeedback, tableTag, type ErrorReport } from '../../../../src/app/online/protocol/diagnostics.ts';
import { ErrorReporter } from '../../../../src/app/online/protocol/errorReporter.ts';
import { redact, reportStack } from '../../../../src/app/online/protocol/redact.ts';

const CODE = 'abcdefghijklmnopqrstuvwxyz';
const KEY = 'Zk3_pL9xQ2-vB7nM4tR8wY1cE5hJ6uA0';

describe('redaction', () => {
  it('takes out table codes, keys, links, addresses, home folders, quoted data and known names', () => {
    const line = `Join https://tabletop.example/#${CODE} with ${KEY}: "Crypt of the Lich" \`x\` 'two words' for robin@example.org in /Users/fabian/Vault and C:\\Users\\fabian\\x by Robin`;
    const out = redact(line, ['Robin']);
    for (const forbidden of [CODE, KEY, 'Lich', 'two words', 'robin@', 'fabian', 'Robin', 'tabletop.example']) expect(out).not.toContain(forbidden);
    expect(out).toContain('/Users/‹user›/Vault');
  });

  it('keeps what an engine says about code: property names, stack paths, line numbers', () => {
    expect(redact("Cannot read properties of undefined (reading 'position')")).toBe("Cannot read properties of undefined (reading 'position')");
    expect(reportStack(`TypeError: x\n    at draw (https://relay.example/assets/index-B3x9kLmN.js:1:2345)\n    at plugin:atlas-online:120:7`))
      .toEqual(['at draw (/assets/index-B3x9kLmN.js:1:2345)', 'at plugin:atlas-online:120:7']);
    expect(reportStack(`draw@https://relay.example/assets/index-B3x9kLmN.js?x=${CODE}#${CODE}:1:2`)).toEqual(['draw@/assets/index-B3x9kLmN.js']);
  });
});

describe('reports and feedback', () => {
  const report = { v: 1, source: 'companion', kind: 'rejection', name: 'Error', message: `lost ${CODE}`, stack: [`at f (app://obsidian.md/plugin:atlas-online:1:2)`], build: '0.0.1+abc', browser: 'Obsidian 1.14.4', os: 'macOS', table: null };

  it('reads a report and redacts it again', () => {
    expect(parseErrorReport(report)).toEqual({ ...report, message: 'lost ‹code›', stack: ['at f (/plugin:atlas-online:1:2)'] });
    for (const broken of [{ ...report, source: 'gm' }, { ...report, stack: 'x' }, { ...report, name: 'a b' }, { ...report, table: CODE }, { ...report, browser: 'x'.repeat(40) }, { ...report, v: 2 }]) {
      expect(parseErrorReport(broken)).toBeNull();
    }
  });

  it('names an error by what it says and where, whatever its numbers', async () => {
    const parsed = parseErrorReport(report);
    if (parsed === null) throw new Error('unread');
    expect(await errorId({ ...parsed, message: 'lost 12 of 40' })).toBe(await errorId({ ...parsed, message: 'lost 3 of 7' }));
    expect(await errorId(parsed)).toMatch(/^[0-9a-f]{10}$/);
    expect(await tableTag(CODE)).toMatch(/^[0-9a-f]{12}$/);
    expect(await tableTag(CODE)).not.toBe(await tableTag(CODE.replace('a', 'b')));
  });

  it('reads feedback: trimmed, a pasted code taken out, diagnostics checked field by field', () => {
    expect(parseFeedback({ v: 1, source: 'play', text: `  hi #${CODE} `, diagnostics: null })).toEqual({ v: 1, source: 'play', text: 'hi #‹code›', diagnostics: null });
    const diagnostics = { build: 'b', browser: 'Safari 18', os: 'iOS', table: null, errors: [], connection: null };
    expect(parseFeedback({ v: 1, source: 'play', text: 'x', diagnostics })?.diagnostics).toEqual(diagnostics);
    expect(parseFeedback({ v: 1, source: 'play', text: 'x', diagnostics: { ...diagnostics, name: 'Robin', errors: ['nope'] } })).toBeNull();
    expect(parseFeedback({ v: 1, source: 'play', text: 'x', diagnostics: { ...diagnostics, connection: { status: 'ok', reconnects: -1, lastClose: null, latencyMs: null, players: null } } })).toBeNull();
    expect(parseFeedback({ v: 1, source: 'play', text: '', diagnostics: null })).toBeNull();
  });

  it('reads how a page\'s tries to reach its table went, and nothing it does not know', () => {
    const connection = { status: 'connecting', reconnects: 3, lastClose: 1006, latencyMs: null, players: null };
    const attempt = { socket: 'open', tries: 3, sinceFirstMs: 24_000, lastEnd: 'no-open', offline: true, hidden: false };
    const post = (given: unknown): ReturnType<typeof parseFeedback> => parseFeedback({ v: 1, source: 'play', text: 'x', diagnostics: { build: 'b', browser: 'Safari 18', os: 'iOS', table: null, errors: [], connection: given } });
    // The companion, and a page of an older build, send none.
    expect(post(connection)?.diagnostics?.connection).toEqual(connection);
    expect(post({ ...connection, attempt })?.diagnostics?.connection).toEqual({ ...connection, attempt });
    expect(post({ ...connection, attempt: { ...attempt, sinceFirstMs: null, lastEnd: null, name: 'Robin' } })?.diagnostics?.connection?.attempt).toEqual({ ...attempt, sinceFirstMs: null, lastEnd: null });
    // What a plain request said of the site, from a page that asks.
    expect(post({ ...connection, attempt: { ...attempt, socket: 'heard', site: 'site' } })?.diagnostics?.connection?.attempt).toEqual({ ...attempt, socket: 'heard', site: 'site' });
    for (const broken of [{ ...attempt, socket: CODE }, { ...attempt, lastEnd: 'Robin' }, { ...attempt, site: 'Robin' }, { ...attempt, site: null }, { ...attempt, tries: -1 }, { ...attempt, sinceFirstMs: 1.5 }, { ...attempt, offline: 'yes' }, { ...attempt, hidden: undefined }, 'open', null]) {
      expect(post({ ...connection, attempt: broken })).toBeNull();
    }
  });
});

describe('the environment', () => {
  it('is the browser by name and major version, and the system by family', () => {
    const ua = (text: string): ReturnType<typeof environmentOf> => environmentOf(text);
    expect(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.54 Safari/537.36')).toEqual({ browser: 'Chrome 141', os: 'macOS' });
    expect(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0')).toEqual({ browser: 'Firefox 140', os: 'Windows' });
    expect(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toEqual({ browser: 'Safari 18', os: 'iOS' });
    expect(ua('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0')).toEqual({ browser: 'Edge 141', os: 'Linux' });
    expect(ua('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 obsidian/1.14.4 Chrome/142.0 Electron/43.0 Safari/537.36')).toEqual({ browser: 'Obsidian 1.14.4', os: 'macOS' });
  });
});

describe('the error reporter', () => {
  const reporter = (posted: ErrorReport[], clock: { now: number; enabled?: boolean }): ErrorReporter => new ErrorReporter({
    source: 'play',
    environment: () => ({ build: 'b', browser: 'Chrome 141', os: 'Linux' }),
    table: () => Promise.resolve('0123456789ab'),
    known: () => [CODE, 'Robin'],
    post: (report) => Promise.resolve(void posted.push(report)),
    now: () => clock.now,
    enabled: () => clock.enabled !== false,
  });

  it('sends each error once, redacted, without the names and codes it knows', async () => {
    const posted: ErrorReport[] = [];
    const errors = reporter(posted, { now: 0 });
    const thrown = new Error(`Robin lost table ${CODE}`);
    const id = await errors.capture('error', thrown);
    expect(await errors.capture('error', thrown)).toBe(id);
    expect(posted).toHaveLength(1);
    expect(JSON.stringify(posted)).not.toMatch(/Robin|abcdefghijklmnopqrstuvwxyz/);
    expect(errors.recentIds()).toEqual([id]);
    expect(await errors.capture('rejection', { secret: KEY })).toMatch(/^[0-9a-f]{10}$/);
    expect(posted[1]).toMatchObject({ kind: 'rejection', name: 'NonError', message: '[object Object]' });
  });

  it('sends nothing while switched off, but remembers the ids', async () => {
    const posted: ErrorReport[] = [];
    const clock = { now: 0, enabled: false };
    const errors = reporter(posted, clock);
    const id = await errors.capture('error', new Error('off'));
    expect(posted).toEqual([]);
    expect(errors.recentIds()).toEqual([id]);
    clock.enabled = true;
    await errors.capture('error', new Error('on'));
    expect(posted).toHaveLength(1);
  });

  it('sends at most five a minute and thirty in all, but remembers every id', async () => {
    const posted: ErrorReport[] = [];
    const clock = { now: 0 };
    const errors = reporter(posted, clock);
    for (let i = 0; i < 8; i += 1) await errors.capture('error', new Error(`kind ${'x'.repeat(i)}`));
    expect(posted).toHaveLength(5);
    expect(errors.recentIds()).toHaveLength(8);
    for (let minute = 1; minute < 20; minute += 1) {
      clock.now = minute * 60_000;
      for (let i = 0; i < 5; i += 1) await errors.capture('error', new Error(`m${'y'.repeat(minute)} ${'z'.repeat(i)}`));
    }
    expect(posted).toHaveLength(30);
    expect(errors.recentIds()).toHaveLength(10);
  });
});
