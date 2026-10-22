import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanionFacts } from '../../../../src/app/online/gm/companionDiagnostics.ts';

interface Sent {
  readonly url: string;
  readonly body: Record<string, unknown>;
}
const sent: Sent[] = [];

vi.mock('obsidian', () => ({
  apiVersion: '1.14.4',
  Platform: { isMacOS: true, isWin: false, isLinux: false },
  requestUrl: (request: { url: string; body: string }) => {
    sent.push({ url: request.url, body: JSON.parse(request.body) as Record<string, unknown> });
    return Promise.resolve({ status: request.url.endsWith('/api/feedback') ? 201 : 202 });
  },
}));

const { CompanionDiagnostics } = await import('../../../../src/app/online/gm/companionDiagnostics.ts');

const CODE = 'abcdefghijklmnopqrstuvwxyz';
const SECRET = 'host-secret-0123456789abcdefABCDEF';
/** A session token as the account service hands them out: the one credential left, and no report may carry it. */
const ACCOUNT_TOKEN = 'Zk3pL9xQ2vB7nM4tR8wYc1dE5fG6hJ0a';
const JOIN_CODE = '483912';

/** A target that dispatches errors and rejections as a window would. */
class FakeWindow extends EventTarget {}

function companion(facts: Partial<CompanionFacts> = {}): { diagnostics: InstanceType<typeof CompanionDiagnostics>; win: FakeWindow } {
  const switched = { on: true };
  const diagnostics = new CompanionDiagnostics({
    reportErrors: () => switched.on,
    setReportErrors: (on) => void (switched.on = on),
    table: () => ({ code: CODE, secret: SECRET, gate: { code: JOIN_CODE } }),
    playerNames: () => ['Alice Liddell'],
    connection: () => ({ status: 'online', reconnects: 1, lastClose: 1006, latencyMs: 40, players: 2 }),
    ...facts,
  }, '0.0.1', () => '0.6.1');
  const win = new FakeWindow();
  diagnostics.listen(win as unknown as Window);
  return { diagnostics, win };
}

/** An error thrown from the companion's own script, as Obsidian names it in stacks. */
function ownError(message: string): Error {
  const error = new Error(message);
  error.stack = `Error: ${message}\n    at SceneShare.send (plugin:atlas-online:4242:17)\n    at plugin:atlas-online:100:3`;
  return error;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));
const throwIn = (win: FakeWindow, error: unknown): boolean => win.dispatchEvent(Object.assign(new Event('error'), { error }));

beforeEach(() => {
  sent.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('the companion\'s error reports', () => {
  it('go to the table\'s server for its own errors, without its secret, code, an account token or player names, and are named in the console', async () => {
    const { win } = companion();
    throwIn(win, ownError(`Alice Liddell lost ${CODE} with ${SECRET} and ${ACCOUNT_TOKEN}`));
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe('https://play.atlas-vtt.dev/api/reports');
    expect(sent[0]?.body).toMatchObject({ source: 'companion', kind: 'error', browser: 'Obsidian 1.14.4', build: '0.0.1+dev atlas 0.6.1', os: 'macOS' });
    expect(sent[0]?.body.table).toMatch(/^[0-9a-f]{12}$/);
    const text = JSON.stringify(sent);
    for (const forbidden of [CODE, SECRET, ACCOUNT_TOKEN, 'Alice', 'Liddell']) expect(text).not.toContain(forbidden);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/^Atlas Online: error [0-9a-f]{10} reported to play\.atlas-vtt\.dev$/));
  });

  it('never carry the join code, as kept or as shown, in a message or a stack', async () => {
    const { win } = companion();
    const error = ownError(`gate ${JOIN_CODE} refused, shown as 483 912`);
    error.stack = `${error.stack ?? ''}\n    at gate (plugin:atlas-online:1:${JOIN_CODE})`;
    throwIn(win, error);
    await settle();
    expect(sent).toHaveLength(1);
    const text = JSON.stringify(sent);
    expect(text).not.toContain(JOIN_CODE);
    expect(text).not.toContain('483 912');
  });

  it('leave Obsidian\'s and other plugins\' errors alone', async () => {
    const { win } = companion();
    const other = new Error('boom');
    other.stack = 'Error: boom\n    at x (plugin:dataview:1:1)';
    throwIn(win, other);
    win.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: 'just a string' }));
    await settle();
    expect(sent).toEqual([]);
  });

  it('are off unless the GM switched them on: named in the console, nothing sent', async () => {
    const { diagnostics, win } = companion({ reportErrors: () => false });
    throwIn(win, ownError('reports are off'));
    await settle();
    expect(sent).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/^Atlas Online: error [0-9a-f]{10} \(error reports are off, nothing was sent\)$/));
    expect(diagnostics.reporter.recentIds()).toHaveLength(1);
  });
});

describe('the GM\'s feedback', () => {
  it('goes to the server with diagnostics only when asked: versions, recent error ids and the connection, never the code', async () => {
    const { diagnostics, win } = companion();
    throwIn(win, ownError('first'));
    await settle();
    expect(await diagnostics.send('Players saw the fog flicker.', false)).toBe('sent');
    expect(await diagnostics.send('Again, with details.', true)).toBe('sent');
    const [plain, detailed] = sent.filter((entry) => entry.url.endsWith('/api/feedback'));
    expect(plain?.body).toEqual({ v: 1, source: 'companion', text: 'Players saw the fog flicker.', diagnostics: null });
    const details = detailed?.body.diagnostics as Record<string, unknown>;
    expect(details).toMatchObject({ build: '0.0.1+dev atlas 0.6.1', browser: 'Obsidian 1.14.4', os: 'macOS', connection: { status: 'online', reconnects: 1, lastClose: 1006, latencyMs: 40, players: 2 } });
    expect(details.table).toMatch(/^[0-9a-f]{12}$/);
    expect(details.errors).toEqual(diagnostics.reporter.recentIds());
    expect(diagnostics.reporter.recentIds()).toHaveLength(1);
    expect(JSON.stringify(sent)).not.toContain(CODE);
  });

  it('loses the join code the GM pasted into it, as kept or as shown, and nothing else', async () => {
    const { diagnostics } = companion();
    await diagnostics.send(`Mira could not join with ${JOIN_CODE} (483 912) at 19:30, 483913 was a typo.`, true);
    const text = JSON.stringify(sent);
    expect(text).not.toContain(JOIN_CODE);
    expect(text).not.toContain('483 912');
    expect(sent[0]?.body.text).toBe('Mira could not join with ‹redacted› (‹redacted›) at 19:30, 483913 was a typo.');
  });
});
