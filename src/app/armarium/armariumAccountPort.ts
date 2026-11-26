import type { App } from 'obsidian';
import { AtlasAccount } from '../account/AtlasAccount';
import { obsidianHttp } from '../account/obsidianHttp';
import { ArmariumApi } from './upload/armariumApi';
import type { PageRequest } from './myUploadsRequests';

/** What the Armarium's frame may have of Atlas' account: My uploads' requests sent with it, a sign-in, word of a change. */
export interface ArmariumAccountPort {
  forward(request: PageRequest): Promise<{ status: number; body: unknown }>;
  signIn(): void;
  /** Calls `listener` whenever the account signs in or out; returns the way to stop. */
  onChange(listener: () => void): () => void;
}

/** This app's account as the Armarium's frame may use it; null where Atlas has no account set up. */
export function armariumAccountPort(app: App): ArmariumAccountPort | null {
  const account = AtlasAccount.forApp(app);
  if (account === null) return null;
  const api = new ArmariumApi({ http: obsidianHttp, token: () => account.token(), signedOut: () => account.signedOutByServer() });
  return {
    forward: (request) => api.forward(request),
    signIn: () => void account.signIn(),
    onChange: (listener) => {
      const stopIn = account.onSignedIn(listener);
      const stopOut = account.onSignedOut(listener);
      return () => {
        stopIn();
        stopOut();
      };
    },
  };
}
