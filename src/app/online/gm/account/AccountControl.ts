import type { AtlasAccount } from '../../../account/AtlasAccount';
import type { Http } from '../../../account/http.ts';
import type { Timers } from '../companionTimers.ts';
import { RELAY_ORIGIN } from '../servers.ts';
import { accountView, SERVER_SIGNED_OUT_TEXT, type AccountFacts, type AccountView } from './accountView.ts';
import { RelayAccount, type AccountAnswer } from './relayAccount.ts';

export interface AccountPorts {
  readonly http: Http;
  readonly timers: Timers;
  /** The plugin's account: sign-in, the token and sign-out are its own, shared with the Armarium. */
  readonly account: AtlasAccount;
}

/** The part of the account control the dock uses. */
export type AccountApi = Pick<AccountControl, 'view' | 'onChange' | 'refresh' | 'signIn' | 'cancelSignIn' | 'reopenSignIn' | 'signOut' | 'openAccountPage'>;

/** How long an answer of `/api/me` is fresh enough that opening the dock does not ask again. */
const FRESH_MS = 10_000;

/**
 * The GM's Atlas account as online play sees it: the plugin's account (`AtlasAccount`) with what `/api/me` says it
 * may host or why it may not. Invite keys are redeemed and the account's data is exported and deleted on the
 * website's account page, never here. A 401 from the relay forgets the token and says so; tables already running
 * never depend on it. The dock and the settings read `view()`.
 */
export class AccountControl {
  private readonly ports: AccountPorts;
  private me: AccountAnswer | 'unreachable' | null = null;
  /** The token `me` was asked with: a sign-in elsewhere (the settings, the Armarium) asks again. */
  private meToken: string | null = null;
  private checkedAt = Number.NEGATIVE_INFINITY;
  private checking: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(ports: AccountPorts) {
    this.ports = ports;
  }

  view(): AccountView {
    return accountView(this.facts());
  }

  /** Hears the account change (a sign-in, a sign-out) and every new answer of what it may host. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    const stop = this.ports.account.onChange(listener);
    return () => {
      this.listeners.delete(listener);
      stop();
    };
  }

  /** The token tables are asked for with, or null while signed out. */
  token(): string | null {
    return this.ports.account.token();
  }

  /** Asks the relay what the account may host, unless it was asked moments ago (`force` asks anyway). */
  refresh(force = false): Promise<void> {
    const token = this.token();
    if (token === null) return Promise.resolve();
    const fresh = this.meToken === token && this.me !== null && this.me !== 'unreachable' && this.ports.timers.now() - this.checkedAt < FRESH_MS;
    if (!force && fresh) return Promise.resolve();
    this.checking ??= this.check(token).finally(() => (this.checking = null));
    return this.checking;
  }

  /** Starts a device sign-in: the approve page opens in the browser, and the dock shows the code. */
  async signIn(): Promise<void> {
    if ((await this.ports.account.signIn()) === 'signed-in') await this.refresh(true);
  }

  /** Opens the approve page again. */
  reopenSignIn(): void {
    this.ports.account.reopenSignIn();
  }

  cancelSignIn(): void {
    this.ports.account.cancelSignIn();
  }

  /** Signs this device's session out at the account service and forgets the token. */
  signOut(): Promise<void> {
    return this.ports.account.signOut();
  }

  /** The server refused the token: it is forgotten, and the GM hears that running tables go on. */
  signedOutByServer(): void {
    this.ports.account.signedOutByServer(SERVER_SIGNED_OUT_TEXT);
  }

  /** Opens the account page in the browser: invite keys are redeemed there, and it shows what the account may host. */
  openAccountPage(): void {
    this.ports.account.openAccountPage();
  }

  private async check(token: string): Promise<void> {
    const answer = await new RelayAccount(this.ports.http, RELAY_ORIGIN, token).me();
    if (this.token() !== token) return;
    if (answer === 'signed-out') return this.signedOutByServer();
    this.me = answer === 'unavailable' ? 'unreachable' : answer;
    this.meToken = token;
    this.checkedAt = this.ports.timers.now();
    for (const listener of this.listeners) listener();
  }

  private facts(): AccountFacts {
    const state = this.ports.account.state();
    const token = this.token();
    return {
      signingIn: state.kind === 'waiting',
      userCode: state.kind === 'waiting' ? state.userCode : null,
      token: token !== null,
      me: token !== null && this.meToken === token ? this.me : null,
      notice: state.kind === 'signed-out' ? state.notice : null,
    };
  }
}
