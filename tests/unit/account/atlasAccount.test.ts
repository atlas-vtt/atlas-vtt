import { describe, expect, it } from 'vitest';
import { accountStateText } from '../../../src/app/account/accountSettingsSection';
import { identityText } from '../../../src/app/account/accountIdentity';
import { AtlasAccount } from '../../../src/app/account/AtlasAccount';
import type { HttpRequest, HttpResponse } from '../../../src/app/account/http';
import { ManualTimers, settle } from './accountFakes';

const ORIGIN = 'https://api.atlas-vtt.dev';
const MARA = { id: 'acc_mara', handle: 'mara', name: 'Mara' };

/** The account service: device codes, polls that approve at once, the session route and sign-out. */
function service(): { http: (request: HttpRequest) => Promise<HttpResponse>; requests: HttpRequest[]; session: HttpResponse; issued: string[] } {
  const state = {
    requests: [] as HttpRequest[],
    session: { status: 200, json: { session: { id: 's1' }, user: MARA } } as HttpResponse,
    issued: ['first-token', 'second-token'],
    http: (request: HttpRequest): Promise<HttpResponse> => {
      state.requests.push(request);
      const path = request.url.replace(ORIGIN, '');
      if (path === '/auth/device/code') return Promise.resolve({ status: 200, json: { device_code: 'dev', user_code: 'WXYZ', verification_uri_complete: 'https://atlas-vtt.dev/device?user_code=WXYZ', expires_in: 600, interval: 5 } });
      if (path === '/auth/device/token') return Promise.resolve({ status: 200, json: { access_token: state.issued.shift() } });
      if (path === '/auth/get-session') return Promise.resolve(state.session);
      if (path === '/auth/sign-out') return Promise.resolve({ status: 200, json: { success: true } });
      return Promise.resolve({ status: 404, json: null });
    },
  };
  return state;
}

function setup(available = true): { account: AtlasAccount; server: ReturnType<typeof service>; timers: ManualTimers; tokens: { value: string | null }; notices: string[]; opened: string[] } {
  const server = service();
  const timers = new ManualTimers();
  const tokens = { value: null as string | null };
  const notices: string[] = [];
  const opened: string[] = [];
  const account = new AtlasAccount({
    http: server.http,
    timers,
    tokens: { get: () => tokens.value, set: (token) => (tokens.value = token), clear: () => (tokens.value = null) },
    available,
    openUrl: (url) => void opened.push(url),
    notify: (text) => void notices.push(text),
  });
  return { account, server, timers, tokens, notices, opened };
}

describe('the Atlas account', () => {
  it('signs in with the device flow, says who is signed in, and tells everyone who listens', async () => {
    const { account, server, timers, tokens, opened } = setup();
    const heard: string[] = [];
    account.onSignedIn(() => heard.push('in'));
    expect(account.state()).toEqual({ kind: 'signed-out', notice: null });
    const done = account.signIn();
    await settle();
    expect(account.state()).toEqual({ kind: 'waiting', userCode: 'WXYZ', again: false });
    expect(opened).toEqual(['https://atlas-vtt.dev/device?user_code=WXYZ']);
    // A second request while one waits answers with the same end.
    const same = account.signIn();
    await timers.advance(5000);
    expect(await done).toBe('signed-in');
    expect(await same).toBe('signed-in');
    expect(tokens.value).toBe('first-token');
    expect(heard).toEqual(['in']);
    expect(account.state()).toEqual({ kind: 'signed-in', who: 'checking' });
    await account.refresh();
    expect(account.state()).toEqual({ kind: 'signed-in', who: MARA });
    expect(server.requests.at(-1)).toEqual({ url: `${ORIGIN}/auth/get-session`, method: 'GET', authorization: 'Bearer first-token' });
    // Asked a moment ago: not asked again unless forced.
    await account.refresh();
    expect(server.requests.filter((request) => request.url.endsWith('/get-session'))).toHaveLength(1);
  });

  it('forgets a token the service no longer knows, and tells the GM', async () => {
    const { account, server, tokens, notices } = setup();
    const heard: string[] = [];
    account.onSignedOut(() => heard.push('out'));
    tokens.value = 'stale';
    server.session = { status: 401, json: null };
    await account.refresh(true);
    expect(tokens.value).toBeNull();
    expect(account.state()).toEqual({ kind: 'signed-out', notice: 'server' });
    expect(notices).toEqual(['You were signed out of your Atlas account.']);
    expect(heard).toEqual(['out']);
    // An answer without a session is the same.
    tokens.value = 'stale-again';
    server.session = { status: 200, json: null };
    await account.refresh(true);
    expect(tokens.value).toBeNull();
  });

  it('keeps the token while the service cannot be reached', async () => {
    const { account, server, tokens } = setup();
    tokens.value = 'tok';
    server.session = { status: 503, json: { code: 'internal' } };
    await account.refresh(true);
    expect(account.state()).toEqual({ kind: 'signed-in', who: 'unreachable' });
    expect(tokens.value).toBe('tok');
  });

  it('runs the hooks before signing out, then signs the session out with the bearer', async () => {
    const { account, server, tokens } = setup();
    const order: string[] = [];
    account.beforeSignOut(() => Promise.resolve(void order.push(`before:${tokens.value}`)));
    account.onSignedOut(() => order.push('out'));
    tokens.value = 'tok';
    await account.signOut();
    expect(order).toEqual(['before:tok', 'out']);
    expect(server.requests.at(-1)).toEqual({ url: `${ORIGIN}/auth/sign-out`, method: 'POST', authorization: 'Bearer tok' });
    expect(account.state()).toEqual({ kind: 'signed-out', notice: null });
  });

  it('approves the device again without signing out first, and signs the older session out after', async () => {
    const { account, server, timers, tokens } = setup();
    tokens.value = 'old-token';
    const again = account.signIn(true);
    await settle();
    expect(account.state()).toEqual({ kind: 'waiting', userCode: 'WXYZ', again: true });
    expect(account.token()).toBe('old-token');
    await timers.advance(5000);
    expect(await again).toBe('signed-in');
    expect(tokens.value).toBe('first-token');
    await settle();
    expect(server.requests.some((request) => request.url.endsWith('/auth/sign-out') && request.authorization === 'Bearer old-token')).toBe(true);
  });

  it('keeps the older token when a re-approval is cancelled', async () => {
    const { account, tokens } = setup();
    tokens.value = 'old-token';
    const again = account.signIn(true);
    await settle();
    account.cancelSignIn();
    expect(await again).toBe('cancelled');
    expect(tokens.value).toBe('old-token');
    expect(account.state()).toEqual({ kind: 'signed-in', who: 'checking' });
  });

  it('is unavailable on an Obsidian without secret storage: nobody signs in and nothing is asked', async () => {
    const { account, server, tokens } = setup(false);
    tokens.value = 'kept-elsewhere';
    expect(account.state()).toEqual({ kind: 'unavailable' });
    expect(account.token()).toBeNull();
    expect(await account.signIn()).toBe('unavailable');
    await account.refresh(true);
    expect(server.requests).toEqual([]);
    expect(accountStateText(account.state())).toBe('Signing in needs Obsidian 1.11.4 or newer, which keeps the sign-in safe on this device.');
  });

  it('says what the settings row shows in each state', () => {
    expect(accountStateText({ kind: 'signed-out', notice: null })).toBe('Optional. Sign in to share collections in the Armarium and to host online tables.');
    expect(accountStateText({ kind: 'signed-out', notice: 'declined' })).toBe('Sign-in was declined. Sign in to share collections in the Armarium and to host online tables.');
    expect(accountStateText({ kind: 'waiting', userCode: 'WXYZ', again: false })).toBe('Approve the sign-in in your browser. Your code is WXYZ.');
    expect(accountStateText({ kind: 'signed-in', who: MARA })).toBe('Signed in as Mara (@mara).');
    expect(identityText({ name: 'Mara', handle: null })).toBe('Mara');
    expect(identityText({ name: 'mara', handle: 'mara' })).toBe('@mara');
  });
});
