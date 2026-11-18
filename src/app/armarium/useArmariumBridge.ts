import { useEffect, useRef, type RefObject } from 'react';
import type { ArmariumInstaller } from './ArmariumInstaller';
import { acceptFrameMessage, installedMessage, postToFrame, statusMessage, type ArmariumFeature } from './armariumMessages';
import type { StoreTagFilter } from './storeTagFilter';

/**
 * Connects the Armarium page in `frameRef` with the installer: its install requests start an install, its hello is
 * answered with what the vault holds, and it hears where every install stands. With `onShare`, Atlas names `share`
 * among its features and the page's Share a collection opens Atlas' own share instead of the site's. With `tagFilter`,
 * Atlas names `tags`: the page says its tags to the filter, which the sidebar shows and whose presses reach the page.
 * Messages count
 * only from the Armarium's origin and from this frame (`acceptFrameMessage`). They are heard on the window `hostRef`
 * lives in, which a frame's page posts to.
 */
export function useArmariumBridge(
  installer: ArmariumInstaller | null,
  frameRef: RefObject<HTMLIFrameElement | null>,
  hostRef: RefObject<HTMLElement | null>,
  onShare?: () => void,
  tagFilter?: StoreTagFilter,
): void {
  const shareRef = useRef(onShare);
  shareRef.current = onShare;
  const shares = onShare !== undefined;
  useEffect(() => {
    const win = hostRef.current?.win;
    if (!installer || !win) return undefined;
    const frameWindow = (): Window | null => frameRef.current?.contentWindow ?? null;
    const features: ArmariumFeature[] = [...(shares ? ['share' as const] : []), ...(tagFilter ? ['tags' as const] : [])];
    const sendInstalled = (): void => {
      void installer.installedItems().then((items) => postToFrame(frameWindow(), installedMessage(items, features)));
    };
    const onMessage = (event: MessageEvent): void => {
      const message = acceptFrameMessage(event, frameWindow());
      if (message?.type === 'atlas-armarium:hello') sendInstalled();
      else if (message?.type === 'atlas-armarium:share') shareRef.current?.();
      else if (message?.type === 'atlas-armarium:tags') tagFilter?.receive({ groups: message.groups, picked: message.picked });
      else if (message) void installer.install({ uid: message.uid, version: message.version });
    };
    const disconnect = tagFilter?.connect((message) => postToFrame(frameWindow(), message));
    const stopStatus = installer.onStatus((request, state) => {
      postToFrame(frameWindow(), statusMessage(request, state));
      if (state === 'installed') sendInstalled();
    });
    win.addEventListener('message', onMessage);
    return (): void => {
      win.removeEventListener('message', onMessage);
      stopStatus();
      disconnect?.();
    };
  }, [installer, frameRef, hostRef, shares, tagFilter]);
}
