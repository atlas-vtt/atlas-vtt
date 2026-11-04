import { field, type Http } from './http.ts';

/** The signed-in account as the dock names it. */
export interface AccountInfo {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
}

/** What the account may host: its plan and seats. */
export interface HostAccess {
  readonly plan: string;
  readonly maxPlayers: number;
  readonly endsAt: number | null;
}

/** Why the relay did not answer: the token is no longer signed in, or the account service or relay cannot be reached. */
export type AccountTrouble = 'signed-out' | 'unreachable';

/** Why an account may not host, as the relay names it in `/api/me` and when it refuses a table. */
export const ACCESS_REFUSALS = ['no-access', 'access-ended', 'access-revoked', 'account-restricted', 'terms-not-accepted'] as const;
export type AccessRefusal = (typeof ACCESS_REFUSALS)[number];

/** The refusal a relay named, or null for one this version does not know. */
export function accessRefusal(value: unknown): AccessRefusal | null {
  return ACCESS_REFUSALS.find((refusal) => refusal === value) ?? null;
}

/** The relay's answer about an account: what it may host, or why it may not (null: for a reason this version does not know). The plugin only shows it. */
export type Hosting = { readonly access: HostAccess } | { readonly access: null; readonly reason: AccessRefusal | null };

/** The signed-in account with what the relay says of it. */
export type AccountAnswer = { readonly account: AccountInfo } & Hosting;

/** What `/api/me` gave: the account's answer, the trouble that kept it, or `unavailable` for an answer that names no account. */
export type MeAnswer = AccountAnswer | AccountTrouble | 'unavailable';

function accessOf(json: unknown): HostAccess | null {
  const plan = field(json, 'plan');
  const maxPlayers = field(json, 'maxPlayers');
  const endsAt = field(json, 'endsAt');
  if (typeof plan !== 'string' || typeof maxPlayers !== 'number' || !Number.isInteger(maxPlayers) || maxPlayers < 1) return null;
  return { plan, maxPlayers, endsAt: typeof endsAt === 'number' ? endsAt : null };
}

function accountOf(json: unknown): AccountInfo | null {
  const id = field(json, 'id');
  const handle = field(json, 'handle');
  const name = field(json, 'name');
  return typeof id === 'string' && typeof handle === 'string' && typeof name === 'string' ? { id, handle, name } : null;
}

/** The trouble a status stands for, or null for an answer to read. */
function troubleOf(status: number): AccountTrouble | null {
  if (status === 401) return 'signed-out';
  return status === 0 || status === 429 || status >= 500 ? 'unreachable' : null;
}

/**
 * The GM's account at the relay: `/api/me`, the account and what it may host. The call sends the
 * token in the `Authorization` header only.
 */
export class RelayAccount {
  private readonly http: Http;
  private readonly origin: string;
  private readonly token: string;

  constructor(http: Http, origin: string, token: string) {
    this.http = http;
    this.origin = origin;
    this.token = token;
  }

  async me(): Promise<MeAnswer> {
    const response = await this.call('/api/me');
    const trouble = troubleOf(response.status);
    if (trouble !== null) return trouble;
    const account = accountOf(field(response.json, 'account'));
    if (response.status !== 200 || account === null) return 'unavailable';
    const access = accessOf(field(response.json, 'access'));
    return access === null ? { account, access, reason: accessRefusal(field(response.json, 'reason')) } : { account, access };
  }

  private async call(path: string): Promise<{ readonly status: number; readonly json: unknown }> {
    try {
      return await this.http({ url: `${this.origin}${path}`, method: 'GET', authorization: `Bearer ${this.token}` });
    } catch {
      return { status: 0, json: null };
    }
  }
}

/** Signs a token out at the account service; whether it answered (the token is forgotten either way). */
export async function signOutToken(http: Http, origin: string, token: string): Promise<boolean> {
  try {
    const response = await http({ url: `${origin}/auth/sign-out`, method: 'POST', authorization: `Bearer ${token}` });
    return response.status === 200;
  } catch {
    return false;
  }
}
