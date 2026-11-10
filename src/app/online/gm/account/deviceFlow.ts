import type { Timers } from '../companionTimers.ts';
import { field, type Http } from './http.ts';

/** The companion's client id at the account service. */
export const CLIENT_ID = 'atlas-obsidian';
const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
/** RFC 8628 §3.5: a `slow_down` answer adds five seconds to the interval. */
const SLOW_DOWN_MS = 5000;
/** The shortest and longest interval taken from the server. */
const MIN_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 60_000;

/** A code the account service handed out: shown to the GM, approved in the browser. */
export interface DeviceCode {
  readonly deviceCode: string;
  readonly userCode: string;
  /** The approve page with the code filled in. */
  readonly url: string;
  readonly intervalMs: number;
  /** When the code expires, on the timers' clock. */
  readonly expiresAt: number;
}

/** How a sign-in ended. */
export type SignInEnd = { readonly kind: 'token'; readonly token: string } | { readonly kind: 'timed-out' | 'declined' | 'unreachable' | 'cancelled' };

const httpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
};

/** Asks the account service for a code; null when it cannot be reached or answers with none. */
export async function requestDeviceCode(http: Http, origin: string, now: number): Promise<DeviceCode | null> {
  try {
    const { status, json } = await http({ url: `${origin}/auth/device/code`, method: 'POST', form: { client_id: CLIENT_ID } });
    const deviceCode = field(json, 'device_code');
    const userCode = field(json, 'user_code');
    const url = field(json, 'verification_uri_complete');
    const interval = field(json, 'interval');
    const expiresIn = field(json, 'expires_in');
    if (status !== 200 || typeof deviceCode !== 'string' || typeof userCode !== 'string' || !httpUrl(url) || typeof expiresIn !== 'number') return null;
    const intervalMs = Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, (typeof interval === 'number' ? interval : 5) * 1000));
    return { deviceCode, userCode, url, intervalMs, expiresAt: now + expiresIn * 1000 };
  } catch {
    return null;
  }
}

/** One poll's answer (RFC 8628 §3.5). */
export type PollAnswer = { readonly kind: 'token'; readonly token: string } | { readonly kind: 'pending' | 'slow-down' | 'timed-out' | 'declined' | 'unreachable' };

export async function pollToken(http: Http, origin: string, deviceCode: string): Promise<PollAnswer> {
  try {
    const { status, json } = await http({ url: `${origin}/auth/device/token`, method: 'POST', form: { grant_type: DEVICE_GRANT, device_code: deviceCode, client_id: CLIENT_ID } });
    const token = field(json, 'access_token');
    if (status === 200 && typeof token === 'string' && token !== '') return { kind: 'token', token };
    const error = field(json, 'error');
    if (error === 'authorization_pending') return { kind: 'pending' };
    if (error === 'slow_down') return { kind: 'slow-down' };
    if (error === 'access_denied') return { kind: 'declined' };
    if (error === 'expired_token' || error === 'invalid_grant') return { kind: 'timed-out' };
    // A server error or a refusal the flow cannot go on from: asked again at the next interval, until the code expires.
    return { kind: status >= 500 ? 'unreachable' : 'pending' };
  } catch {
    return { kind: 'unreachable' };
  }
}

export interface DeviceSignInPorts {
  readonly http: Http;
  readonly timers: Timers;
  /** The account service's origin. */
  readonly origin: string;
  /** Opens a URL in the system browser. */
  readonly openUrl: (url: string) => void;
}

/**
 * One desktop sign-in: asks for a code, opens the approve page, and polls at the server's interval
 * (slower after `slow_down`) until the GM approves or declines, the code expires, or it is cancelled.
 * Polls run on the companion's timers, so they keep their pace while Obsidian is hidden. A server
 * that cannot be reached while polling is asked again; the code's expiry ends that too.
 */
export class DeviceSignIn {
  private readonly ports: DeviceSignInPorts;
  private code: DeviceCode | null = null;
  private timer = 0;
  private cancelled = false;
  private finish: ((end: SignInEnd) => void) | null = null;

  constructor(ports: DeviceSignInPorts) {
    this.ports = ports;
  }

  /** The code shown while the GM approves; null before it arrived. */
  get current(): DeviceCode | null {
    return this.code;
  }

  /** Runs the sign-in; `onCode` hears the code once the page was opened. */
  async run(onCode: (code: DeviceCode) => void): Promise<SignInEnd> {
    const { ports } = this;
    const code = await requestDeviceCode(ports.http, ports.origin, ports.timers.now());
    if (this.cancelled) return { kind: 'cancelled' };
    if (code === null) return { kind: 'unreachable' };
    this.code = code;
    ports.openUrl(code.url);
    onCode(code);
    return new Promise<SignInEnd>((resolve) => {
      this.finish = resolve;
      this.schedule(code.intervalMs);
    });
  }

  /** Opens the approve page again. */
  reopen(): void {
    if (this.code !== null) this.ports.openUrl(this.code.url);
  }

  cancel(): void {
    this.cancelled = true;
    this.ports.timers.clearTimer(this.timer);
    this.end({ kind: 'cancelled' });
  }

  private schedule(intervalMs: number): void {
    if (this.finish === null) return;
    this.timer = this.ports.timers.setTimer(() => void this.poll(intervalMs), intervalMs);
  }

  private async poll(intervalMs: number): Promise<void> {
    const code = this.code;
    if (code === null || this.finish === null) return;
    if (this.ports.timers.now() >= code.expiresAt) return this.end({ kind: 'timed-out' });
    const answer = await pollToken(this.ports.http, this.ports.origin, code.deviceCode);
    if (this.finish === null) return;
    if (answer.kind === 'token') return this.end(answer);
    if (answer.kind === 'timed-out' || answer.kind === 'declined') return this.end({ kind: answer.kind });
    this.schedule(answer.kind === 'slow-down' ? intervalMs + SLOW_DOWN_MS : intervalMs);
  }

  private end(end: SignInEnd): void {
    const finish = this.finish;
    this.finish = null;
    finish?.(end);
  }
}
