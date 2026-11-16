import { requireApiVersion, type App } from 'obsidian';

/** The secret's id: the salt the GM's asset ids are made with, kept beside the account token. */
export const SALT_SECRET_ID = 'atlas-online-salt';

/** The salt's length in bytes. */
export const SALT_BYTES = 32;

/** Where the salt is kept: per vault and per device, never in the plugin's data, settings, logs or URLs. */
export interface SaltStore {
  get(): Uint8Array<ArrayBuffer> | null;
  set(salt: Uint8Array): void;
  clear(): void;
}

/** A salt from its base64, or null for anything that is not exactly `SALT_BYTES` bytes. */
export function saltOf(text: unknown): Uint8Array<ArrayBuffer> | null {
  if (typeof text !== 'string' || text === '' || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  try {
    const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
    return bytes.length === SALT_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

const base64Of = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

/**
 * Obsidian's secret storage (1.11.4 and newer), as the account token is kept (`tokenStore.ts`). Its API
 * has no delete, so a cleared salt is an empty secret. Where secure storage is missing nothing is kept,
 * and players are handed no assets.
 */
export function secretSaltStore(app: App): SaltStore {
  // The version is written out: the lint rule that allows `secretStorage` reads it from this call.
  if (requireApiVersion('1.11.4')) {
    const storage = app.secretStorage;
    const write = (text: string): void => {
      try {
        storage.setSecret(SALT_SECRET_ID, text);
      } catch {
        // Nothing is kept where storage is not available.
      }
    };
    return {
      get: () => {
        try {
          return saltOf(storage.getSecret(SALT_SECRET_ID));
        } catch {
          return null;
        }
      },
      set: (salt) => write(base64Of(salt)),
      clear: () => write(''),
    };
  }
  return { get: () => null, set: () => undefined, clear: () => undefined };
}
