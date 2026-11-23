import { useEffect, useRef, type RefObject } from 'react';
import type { ArmariumInstaller } from './ArmariumInstaller';
import type { ArmariumRequest } from './armariumRequest';
import { accountMessage, acceptFrameMessage, apiResultMessage, installedMessage, postToFrame, statusMessage, type ArmariumFeature, type ShareRequest } from './armariumMessages';
import type { ArmariumAccountPort } from './armariumAccountPort';
import type { StoreTagFilter } from './storeTagFilter';

/**
 * Connects the Armarium page in `frameRef` with the installer: its install requests start an install, its hello is
 * answered with what the vault holds, and it hears where every install stands; Atlas names `music`, as it installs
 * albums and tracks. With `onShare`, Atlas names `share`, `share-items` and `share-music` among its features and the
 * page's Share opens Atlas' own share instead of the site's, of what the page names (`what`; a collection where it
 * names nothing) and the listing it continues (`listing`). With `tagFilter`,
 * Atlas names `tags`: the page says its tags to the filter, which the sidebar shows and whose presses reach the page.
 * With `account`, Atlas names `account`: the site's My uploads in the frame has Atlas send its requests with Atlas'
 * account (only those, `myUploadsRequests.ts`), asks Atlas to sign in, and hears when it signed in or out.
 * Messages count
 * only from the Armarium's origin and from this frame (`acceptFrameMessage`). They are heard on the window `hostRef`
 * lives in, which a frame's page posts to.
 */
export function useArmariumBridge(
  installer: ArmariumInstaller | null,
  frameRef: RefObject<HTMLIFrameElement | null>,
  hostRef: RefObject<HTMLElement | null>,
  onShare?: (request: ShareRequest) => void,
  tagFilter?: StoreTagFilter,
  account?: ArmariumAccountPort | null,
): void {
  const shareRef = useRef(onShare);
  shareRef.current = onShare;
  const shares = onShare !== undefined;
  useEffect(() => {
    const win = hostRef.current?.win;
    if (!installer || !win) return undefined;
    const frameWindow = (): Window | null => frameRef.current?.contentWindow ?? null;
    const features: ArmariumFeature[] = ['music', ...(shares ? ['share' as const, 'share-items' as const, 'share-music' as const] : []), ...(tagFilter ? ['tags' as const] : []), ...(account ? ['account' as const] : [])];
    // Read while the page loads, so its hello is answered at once: the read waits on the installable list.
    let early: Promise<ArmariumRequest[]> | null = installer.installedItems();
    const sendInstalled = (): void => {
      const items = early ?? installer.installedItems();
      early = null;
      void items.then((held) => postToFrame(frameWindow(), installedMessage(held, features)));
    };
    const onMessage = (event: MessageEvent): void => {
      const message = acceptFrameMessage(event, frameWindow());
      if (message?.type === 'atlas-armarium:hello') sendInstalled();
      else if (message?.type === 'atlas-armarium:share') shareRef.current?.({ what: message.what ?? 'collection', ...(message.listing && { listing: message.listing }) });
      else if (message?.type === 'atlas-armarium:tags') tagFilter?.receive({ groups: message.groups, picked: message.picked });
      else if (message?.type === 'atlas-armarium:api') {
        if (account) void account.forward(message.request).then((answer) => postToFrame(frameWindow(), apiResultMessage(message.id, answer)));
      } else if (message?.type === 'atlas-armarium:sign-in') account?.signIn();
      else if (message) void installer.install({ uid: message.uid, version: message.version });
    };
    const disconnect = tagFilter?.connect((message) => postToFrame(frameWindow(), message));
    const stopAccount = account?.onChange(() => postToFrame(frameWindow(), accountMessage()));
    const stopStatus = installer.onStatus((request, state) => {
      postToFrame(frameWindow(), statusMessage(request, state));
      if (state !== 'installed') return;
      // What was read early no longer holds the release just installed.
      early = null;
      sendInstalled();
    });
    win.addEventListener('message', onMessage);
    return (): void => {
      win.removeEventListener('message', onMessage);
      stopStatus();
      disconnect?.();
      stopAccount?.();
    };
  }, [installer, frameRef, hostRef, shares, tagFilter, account]);
}
