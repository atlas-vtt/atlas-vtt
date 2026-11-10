import { requireApiVersion, type App } from 'obsidian';

/** The secret's id: neutral, so the public plugin may later share the same sign-in. */
export const ACCOUNT_SECRET_ID = 'atlas-account';

/** The first Obsidian with secret storage, which online play keeps the account token in. */
export const SECRET_STORAGE_VERSION = '1.11.4';

/** Where the account token is kept: per vault and per device, never in the plugin's data or any synced file. */
export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

/**
 * Obsidian's secret storage (1.11.4 and newer). Its API has no delete, so a cleared token is an empty
 * secret. A device without secure storage reads as signed out, and `set` throws there.
 */
export function secretTokenStore(app: App): TokenStore {
  // The version is written out, not `SECRET_STORAGE_VERSION`: the lint rule that allows `secretStorage` reads it from this call.
  if (requireApiVersion('1.11.4')) {
    const storage = app.secretStorage;
    return {
      get: () => {
        try {
          const token = storage.getSecret(ACCOUNT_SECRET_ID);
          return token === null || token === '' ? null : token;
        } catch {
          return null;
        }
      },
      set: (token) => storage.setSecret(ACCOUNT_SECRET_ID, token),
      clear: () => {
        try {
          storage.setSecret(ACCOUNT_SECRET_ID, '');
        } catch {
          // Nothing was kept where storage is not available.
        }
      },
    };
  }
  // An older Obsidian has nowhere safe to keep the token: signed out, and signing in fails.
  return {
    get: () => null,
    set: () => {
      throw new Error(`Signing in needs Obsidian ${SECRET_STORAGE_VERSION} or newer.`);
    },
    clear: () => undefined,
  };
}
