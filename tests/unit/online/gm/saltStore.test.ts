import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { AccountControl } from '../../../../src/app/online/gm/account/AccountControl.ts';
import type { HttpRequest, HttpResponse } from '../../../../src/app/online/gm/account/http.ts';
import { SALT_SECRET_ID, saltOf, secretSaltStore, type SaltStore } from '../../../../src/app/online/gm/account/saltStore.ts';
import { AssetSalt, SALT_RETRY_MS } from '../../../../src/app/online/gm/assets/assetSalt.ts';
import type { StoreResult } from '../../../../src/app/online/gm/assets/storeClient.ts';

const SALT = Uint8Array.from({ length: 32 }, (_, n) => n + 1);
const SALT_TEXT = btoa(String.fromCharCode(...SALT));

/** Obsidian's secret storage as an app has it: secrets by id, an empty one where cleared. */
function secretApp(): { app: App; secrets: Map<string, string> } {
  const secrets = new Map<string, string>();
  const app = { secretStorage: { getSecret: (id: string) => secrets.get(id) ?? null, setSecret: (id: string, value: string) => void secrets.set(id, value) } } as unknown as App;
  return { app, secrets };
}

describe('the salt store', () => {
  it('keeps the salt in Obsidian\'s secret storage under its own id, as base64', () => {
    const { app, secrets } = secretApp();
    const store = secretSaltStore(app);
    expect(store.get()).toBeNull();
    store.set(SALT);
    expect(secrets.get(SALT_SECRET_ID)).toBe(SALT_TEXT);
    expect(store.get()).toEqual(SALT);
    store.clear();
    expect(secrets.get(SALT_SECRET_ID)).toBe('');
    expect(store.get()).toBeNull();
  });

  it('reads only a salt of 32 bytes', () => {
    expect(saltOf(SALT_TEXT)).toEqual(SALT);
    expect(saltOf(btoa('short'))).toBeNull();
    expect(saltOf('not base64!')).toBeNull();
    expect(saltOf(42)).toBeNull();
  });
});

/** An account signed in with `token`, a salt store, and the relay's salt route answering `answer`. */
function saltSetup(answer: () => StoreResult<unknown>): { salt: AssetSalt; store: SaltStore & { kept: Uint8Array | null }; asked: number; signedOut: number; signedIn: { value: boolean }; clock: { now: number } } {
  const kept = { value: null as Uint8Array<ArrayBuffer> | null };
  const store = { get kept() { return kept.value; }, get: () => kept.value, set: (salt: Uint8Array) => (kept.value = Uint8Array.from(salt)), clear: () => (kept.value = null) };
  const setup = { store, asked: 0, signedOut: 0, signedIn: { value: true }, clock: { now: 0 }, salt: undefined as unknown as AssetSalt };
  setup.salt = new AssetSalt({
    store,
    fetch: () => (setup.asked += 1, Promise.resolve(answer())),
    signedIn: () => setup.signedIn.value,
    signedOutByServer: () => void (setup.signedOut += 1),
    now: () => setup.clock.now,
    sleep: () => Promise.resolve(),
  });
  return setup;
}

describe('the GM\'s salt', () => {
  it('is fetched from the relay once while signed in, and kept', async () => {
    const setup = saltSetup(() => ({ ok: true, value: SALT_TEXT }));
    const [first, second] = await Promise.all([setup.salt.ensure(), setup.salt.ensure()]);
    expect(first).toEqual(SALT);
    expect(second).toEqual(SALT);
    expect(setup.asked).toBe(1);
    expect(setup.store.kept).toEqual(SALT);
    expect(await setup.salt.ensure()).toEqual(SALT);
    expect(setup.asked).toBe(1);
  });

  it('is not asked for while signed out', async () => {
    const setup = saltSetup(() => ({ ok: true, value: SALT_TEXT }));
    setup.signedIn.value = false;
    expect(await setup.salt.ensure(true)).toBeNull();
    expect(setup.asked).toBe(0);
  });

  it('leaves the GM without ids, quietly, where the relay hands none out, and asks again only later', async () => {
    const setup = saltSetup(() => ({ ok: false, trouble: 'missing' }));
    expect(await setup.salt.ensure()).toBeNull();
    expect(await setup.salt.soon()).toBeNull();
    expect(setup.asked).toBe(1);
    expect(setup.signedOut).toBe(0);
    setup.clock.now = SALT_RETRY_MS;
    expect(await setup.salt.ensure()).toBeNull();
    expect(setup.asked).toBe(2);
    // A sign-in asks at once.
    expect(await setup.salt.ensure(true)).toBeNull();
    expect(setup.asked).toBe(3);
  });

  it('signs the account out at a 401', async () => {
    const setup = saltSetup(() => ({ ok: false, trouble: 'signed-out' }));
    expect(await setup.salt.ensure()).toBeNull();
    expect(setup.signedOut).toBe(1);
  });

  it('refuses an answer that is no salt', async () => {
    const setup = saltSetup(() => ({ ok: true, value: 'AAAA' }));
    expect(await setup.salt.ensure()).toBeNull();
    expect(setup.store.kept).toBeNull();
  });
});

describe('the salt with the account', () => {
  /** The account service and the relay: a sign-in that is approved at once, `/api/me`, sign-out; `status` for every account call. */
  function account(status: () => number): { control: AccountControl; salt: AssetSalt; secrets: Map<string, string>; requests: HttpRequest[] } {
    const { app, secrets } = secretApp();
    const saltStore = secretSaltStore(app);
    let token: string | null = null;
    const requests: HttpRequest[] = [];
    const http = (request: HttpRequest): Promise<HttpResponse> => {
      requests.push(request);
      const path = request.url.replace(/^https?:\/\/[^/]+/, '');
      if (path === '/auth/device/code') return Promise.resolve({ status: 200, json: { device_code: 'dev', user_code: 'ABCDEFGH', verification_uri_complete: 'http://site.test/device', expires_in: 600, interval: 5 } });
      if (path === '/auth/device/token') return Promise.resolve({ status: 200, json: { access_token: 'tok' } });
      return Promise.resolve({ status: status(), json: { account: { id: 'acc', handle: 'mara', name: 'Mara' }, access: null, reason: 'no-access' } });
    };
    const holder = { control: undefined as unknown as AccountControl };
    const salt = new AssetSalt({
      store: saltStore,
      fetch: () => Promise.resolve({ ok: true, value: SALT_TEXT }),
      signedIn: () => token !== null,
      signedOutByServer: () => holder.control.signedOutByServer(),
      now: () => 0,
      sleep: () => Promise.resolve(),
    });
    holder.control = new AccountControl({
      http,
      timers: { now: () => 0, setTimer: (run) => (queueMicrotask(run), 1), clearTimer: () => undefined },
      tokens: { get: () => token, set: (next) => (token = next), clear: () => (token = null) },
      openUrl: () => undefined,
      notify: () => undefined,
      signedIn: () => void salt.ensure(true),
      signedOut: () => salt.clear(),
    });
    return { control: holder.control, salt, secrets, requests };
  }

  const tick = async (): Promise<void> => {
    for (let n = 0; n < 20; n += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('is fetched at sign-in and goes with the sign-out', async () => {
    const { control, salt, secrets } = account(() => 200);
    await control.signIn();
    await tick();
    expect(salt.get()).toEqual(SALT);
    expect(secrets.get(SALT_SECRET_ID)).toBe(SALT_TEXT);
    await control.signOut();
    expect(salt.get()).toBeNull();
    expect(secrets.get(SALT_SECRET_ID)).toBe('');
  });

  it('goes with the token at a 401', async () => {
    let status = 200;
    const { control, salt, secrets } = account(() => status);
    await control.signIn();
    await tick();
    expect(salt.get()).toEqual(SALT);
    status = 401;
    await control.refresh(true);
    expect(control.token()).toBeNull();
    expect(secrets.get(SALT_SECRET_ID)).toBe('');
  });

  it('runs what goes before a sign-out while the token still counts (the shared copies removed, where asked for)', async () => {
    let token: string | null = 'tok';
    const seenToken: (string | null)[] = [];
    const control = new AccountControl({
      http: () => Promise.resolve({ status: 200, json: null }),
      timers: { now: () => 0, setTimer: () => 1, clearTimer: () => undefined },
      tokens: { get: () => token, set: (next) => (token = next), clear: () => (token = null) },
      openUrl: () => undefined,
      notify: () => undefined,
      beforeSignOut: () => Promise.resolve(void seenToken.push(token)),
    });
    await control.signOut();
    expect(seenToken).toEqual(['tok']);
    expect(control.token()).toBeNull();
  });
});
