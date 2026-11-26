import { field, type Http } from './http.ts';

/** The signed-in account as Atlas names it. */
export interface AccountIdentity {
  readonly id: string;
  /** The account's handle; null for an account that has none yet. */
  readonly handle: string | null;
  readonly name: string;
}

/** What the account service says of a token: whose it is, that it is no longer signed in, or nothing (it cannot be reached). */
export type IdentityAnswer = AccountIdentity | 'signed-out' | 'unreachable';

function identityOf(user: unknown): AccountIdentity | null {
  const id = field(user, 'id');
  const name = field(user, 'name');
  const handle = field(user, 'handle');
  if (typeof id !== 'string' || id === '') return null;
  return { id, name: typeof name === 'string' ? name : '', handle: typeof handle === 'string' && handle !== '' ? handle : null };
}

/**
 * Who a token signs in, from the account service's session route (`GET /auth/get-session`), one of the two routes
 * that take a desktop token. A 401, or an answer that names no session, is a token that no longer counts.
 */
export async function identityOfToken(http: Http, origin: string, token: string): Promise<IdentityAnswer> {
  try {
    const { status, json } = await http({ url: `${origin}/auth/get-session`, method: 'GET', authorization: `Bearer ${token}` });
    if (status === 401 || (status === 200 && json === null)) return 'signed-out';
    if (status !== 200) return 'unreachable';
    return identityOf(field(json, 'user')) ?? 'unreachable';
  } catch {
    return 'unreachable';
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

/** "Mara (@mara)", the handle alone where the name is the handle, the name alone where there is no handle. */
export function identityText(identity: Pick<AccountIdentity, 'name' | 'handle'>): string {
  if (identity.handle === null) return identity.name;
  return identity.name === '' || identity.name === identity.handle ? `@${identity.handle}` : `${identity.name} (@${identity.handle})`;
}
