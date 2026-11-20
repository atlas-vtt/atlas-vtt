import type { App } from 'obsidian';
import type { Timers } from '../utils/workerTimers';
import { t } from '../i18n';
import { ACCOUNT_PAGE_URL, ACCOUNTS_ORIGIN } from './accountServers';
import { identityOfToken, signOutToken, type AccountIdentity } from './accountIdentity';
import { DeviceSignIn } from './deviceFlow.ts';
import type { Http } from './http.ts';
import type { TokenStore } from './tokenStore.ts';

/** Why the GM is signed out, as the line under the sign-in button says. */
export type SignInNotice = 'timed-out' | 'declined' | 'server' | 'unreachable' | null;

/** Who is signed in: the identity, while it is asked for (`checking`), or `unreachable` when the service did not answer. */
export type Who = AccountIdentity | 'checking' | 'unreachable';

export type AccountState =
  /** This Obsidian has no secret storage (before 1.11.4): nothing can be kept safely, so nobody signs in. */
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'signed-out'; readonly notice: SignInNotice }
  /** A sign-in waits for approval in the browser; the code is null until the service gave one. */
  | { readonly kind: 'waiting'; readonly userCode: string | null; readonly again: boolean }
  | { readonly kind: 'signed-in'; readonly who: Who };

/** How a sign-in ended. */
export type SignInResult = 'signed-in' | 'cancelled' | 'failed' | 'unavailable';

export interface AtlasAccountPorts {
  readonly http: Http;
  readonly timers: Timers;
  readonly tokens: TokenStore;
  /** Whether this Obsidian keeps secrets; false signs nobody in. */
  readonly available: boolean;
  readonly openUrl: (url: string) => void;
  /** Tells the GM something outside any dialog (Obsidian's `Notice`). */
  readonly notify: (text: string) => void;
}

/** How long an answer of who is signed in is fresh enough that it is not asked again. */
const FRESH_MS = 60_000;

/**
 * The GM's Atlas account, one per app and independent of any feature: device sign-in (RFC 8628), the token in
 * Obsidian's secret storage, who it signs in, and sign-out. Online play and the Armarium use it; neither keeps a
 * token of its own. A server that refuses the token (401) makes it forgotten here, for everyone. Signing in is
 * optional: Atlas works without an account, and nothing is asked of the service until the GM signs in.
 */
export class AtlasAccount {
  private static readonly accounts = new WeakMap<App, AtlasAccount>();

  static open(app: App, ports: AtlasAccountPorts): AtlasAccount {
    const account = new AtlasAccount(ports);
    AtlasAccount.accounts.set(app, account);
    return account;
  }

  static forApp(app: App): AtlasAccount | null {
    return AtlasAccount.accounts.get(app) ?? null;
  }

  static release(app: App): void {
    AtlasAccount.accounts.get(app)?.cancelSignIn();
    AtlasAccount.accounts.delete(app);
  }

  private flow: { sign: DeviceSignIn; done: Promise<SignInResult>; again: boolean } | null = null;
  private userCode: string | null = null;
  private who: { token: string; who: AccountIdentity | 'unreachable'; at: number } | null = null;
  private checking: Promise<void> | null = null;
  private notice: SignInNotice = null;
  private readonly listeners = new Set<() => void>();
  private readonly signedInListeners = new Set<() => void>();
  private readonly signedOutListeners = new Set<() => void>();
  private readonly beforeSignOutHooks = new Set<() => Promise<void>>();

  constructor(private readonly ports: AtlasAccountPorts) {}

  state(): AccountState {
    if (!this.ports.available) return { kind: 'unavailable' };
    if (this.flow !== null) return { kind: 'waiting', userCode: this.userCode, again: this.flow.again };
    const token = this.token();
    if (token === null) return { kind: 'signed-out', notice: this.notice };
    return { kind: 'signed-in', who: this.who?.token === token ? this.who.who : 'checking' };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Hears every sign-in that kept a token, a re-approval too. */
  onSignedIn(listener: () => void): () => void {
    this.signedInListeners.add(listener);
    return () => this.signedInListeners.delete(listener);
  }

  /** Hears the token forgotten (signed out here or by a server): what was kept with it goes too. */
  onSignedOut(listener: () => void): () => void {
    this.signedOutListeners.add(listener);
    return () => this.signedOutListeners.delete(listener);
  }

  /** Runs with the token before this device signs out, while it still counts. */
  beforeSignOut(hook: () => Promise<void>): () => void {
    this.beforeSignOutHooks.add(hook);
    return () => this.beforeSignOutHooks.delete(hook);
  }

  /** The token requests are made with, or null while signed out. */
  token(): string | null {
    return this.ports.available ? this.ports.tokens.get() : null;
  }

  /** Asks the account service who is signed in, unless it was asked a moment ago (`force` asks anyway). */
  refresh(force = false): Promise<void> {
    const token = this.token();
    if (token === null) return Promise.resolve();
    const known = this.who;
    if (!force && known?.token === token && known.who !== 'unreachable' && this.ports.timers.now() - known.at < FRESH_MS) return Promise.resolve();
    this.checking ??= this.check(token).finally(() => (this.checking = null));
    return this.checking;
  }

  /**
   * Starts a device sign-in: the approve page opens in the browser, and the code shows where the GM started it.
   * One at a time: a second call while one waits answers with the same end. `again` approves this device anew while
   * it stays signed in (a publish asks for a recent approval): the old token counts until the new one is kept.
   */
  signIn(again = false): Promise<SignInResult> {
    if (!this.ports.available) return Promise.resolve('unavailable');
    if (this.flow !== null) return this.flow.done;
    const sign = new DeviceSignIn({ http: this.ports.http, timers: this.ports.timers, origin: ACCOUNTS_ORIGIN, openUrl: this.ports.openUrl });
    const done = this.runSignIn(sign);
    this.flow = { sign, done, again };
    this.userCode = null;
    this.notice = null;
    this.changed();
    return done;
  }

  /** Opens the approve page again. */
  reopenSignIn(): void {
    this.flow?.sign.reopen();
  }

  cancelSignIn(): void {
    this.flow?.sign.cancel();
  }

  /** Signs this device's session out at the account service and forgets the token. */
  async signOut(): Promise<void> {
    const token = this.token();
    if (token !== null) {
      for (const hook of this.beforeSignOutHooks) await hook().catch(() => undefined);
    }
    this.forget(null);
    if (token !== null) await signOutToken(this.ports.http, ACCOUNTS_ORIGIN, token);
  }

  /** A server refused the token: it is forgotten, and the GM is told (`message`, else the general sentence). */
  signedOutByServer(message: string = t('account.serverSignedOut')): void {
    if (this.token() === null) return;
    this.forget('server');
    this.ports.notify(message);
  }

  /** Opens the account page in the browser: the Terms, the email and linked accounts are seen to there. */
  openAccountPage(): void {
    this.ports.openUrl(ACCOUNT_PAGE_URL);
  }

  private async runSignIn(sign: DeviceSignIn): Promise<SignInResult> {
    const end = await sign.run((code) => {
      this.userCode = code.userCode;
      this.changed();
    });
    const replaced = this.token();
    this.flow = null;
    this.userCode = null;
    if (end.kind !== 'token') {
      this.notice = end.kind === 'cancelled' ? null : end.kind;
      this.changed();
      return end.kind === 'cancelled' ? 'cancelled' : 'failed';
    }
    try {
      this.ports.tokens.set(end.token);
    } catch {
      this.ports.notify(t('account.noStorage'));
      void signOutToken(this.ports.http, ACCOUNTS_ORIGIN, end.token);
      this.changed();
      return 'failed';
    }
    // A re-approval leaves no older session of this device behind.
    if (replaced !== null && replaced !== end.token) void signOutToken(this.ports.http, ACCOUNTS_ORIGIN, replaced);
    this.who = null;
    this.changed();
    for (const listener of this.signedInListeners) listener();
    return 'signed-in';
  }

  private async check(token: string): Promise<void> {
    const answer = await identityOfToken(this.ports.http, ACCOUNTS_ORIGIN, token);
    if (this.token() !== token) return;
    if (answer === 'signed-out') return this.signedOutByServer();
    this.who = { token, who: answer, at: this.ports.timers.now() };
    this.changed();
  }

  private forget(notice: SignInNotice): void {
    this.ports.tokens.clear();
    this.who = null;
    this.notice = notice;
    for (const listener of this.signedOutListeners) listener();
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
