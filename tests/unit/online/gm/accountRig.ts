import { AtlasAccount } from '../../../../src/app/account/AtlasAccount';
import type { HttpRequest, HttpResponse } from '../../../../src/app/account/http.ts';
import { AccountControl } from '../../../../src/app/online/gm/account/AccountControl.ts';
import { fakeTimers } from '../gmScreen/fakeTimers.ts';

export const MARA = { id: 'acc_mara', handle: 'mara', name: 'Mara' };
export const MAY_HOST: HttpResponse = { status: 200, json: { account: MARA, access: { plan: 'beta', maxPlayers: 12, endsAt: null } } };
export const NO_ACCESS: HttpResponse = { status: 200, json: { account: MARA, access: null, reason: 'no-access' } };
export const PENDING: HttpResponse = { status: 400, json: { error: 'authorization_pending' } };
export const APPROVED: HttpResponse = { status: 200, json: { access_token: 'bearer-token', token_type: 'Bearer' } };

/** Online play's real account over an account service and relay the test scripts. */
export interface AccountRig {
  readonly control: AccountControl;
  readonly timers: ReturnType<typeof fakeTimers>;
  readonly requests: HttpRequest[];
  readonly opened: string[];
  readonly tokens: { value: string | null };
  /** What a poll for the token answers. */
  poll: HttpResponse;
  /** What `/api/me` answers. */
  me: HttpResponse;
  /** False: every request fails as offline. */
  reachable: boolean;
  /** True: `/api/me` never answers, as while it is still on its way. */
  holdMe: boolean;
  /** Lets the scripted answers arrive. */
  settle(): Promise<void>;
}

export function accountRig(token: string | null = null): AccountRig {
  const timers = fakeTimers();
  const tokens = { value: token };
  const opened: string[] = [];
  const requests: HttpRequest[] = [];
  const rig: Omit<AccountRig, 'control'> = {
    timers, requests, opened, tokens, poll: PENDING, me: MAY_HOST, reachable: true, holdMe: false,
    settle: async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    },
  };
  const http = (request: HttpRequest): Promise<HttpResponse> => {
    requests.push(request);
    if (!rig.reachable) return Promise.reject(new Error('offline'));
    const path = new URL(request.url).pathname;
    if (path === '/auth/device/code') return Promise.resolve({ status: 200, json: { device_code: 'dev-code', user_code: 'ABCDEFGH', verification_uri_complete: 'http://site.test/device?user_code=ABCDEFGH', expires_in: 600, interval: 5 } });
    if (path === '/auth/device/token') return Promise.resolve(rig.poll);
    if (path === '/auth/sign-out') return Promise.resolve({ status: 200, json: { success: true } });
    if (path === '/api/me') return rig.holdMe ? new Promise<HttpResponse>(() => undefined) : Promise.resolve(rig.me);
    return Promise.resolve({ status: 404, json: null });
  };
  const account = new AtlasAccount({
    http,
    timers,
    tokens: { get: () => tokens.value, set: (value) => (tokens.value = value), clear: () => (tokens.value = null) },
    available: true,
    openUrl: (url) => void opened.push(url),
    notify: () => undefined,
  });
  return Object.assign(rig, { control: new AccountControl({ http, timers, account }) });
}
