import { useEffect, type RefObject } from 'react';
import type { ArmariumInstaller } from './ArmariumInstaller';
import { acceptFrameMessage, installedMessage, postToFrame, statusMessage } from './armariumMessages';

/**
 * Connects the Armarium page in `frameRef` with the installer: its install requests start an install, its hello is
 * answered with what the vault holds, and it hears where every install stands. Messages count only from the
 * Armarium's origin and from this frame (`acceptFrameMessage`). They are heard on the window `hostRef` lives in, which
 * a frame's page posts to.
 */
export function useArmariumBridge(
  installer: ArmariumInstaller | null,
  frameRef: RefObject<HTMLIFrameElement | null>,
  hostRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const win = hostRef.current?.win;
    if (!installer || !win) return undefined;
    const frameWindow = (): Window | null => frameRef.current?.contentWindow ?? null;
    const sendInstalled = (): void => {
      void installer.installedItems().then((items) => postToFrame(frameWindow(), installedMessage(items)));
    };
    const onMessage = (event: MessageEvent): void => {
      const message = acceptFrameMessage(event, frameWindow());
      if (message?.type === 'atlas-armarium:hello') sendInstalled();
      else if (message) void installer.install({ uid: message.uid, version: message.version });
    };
    const stopStatus = installer.onStatus((request, state) => {
      postToFrame(frameWindow(), statusMessage(request, state));
      if (state === 'installed') sendInstalled();
    });
    win.addEventListener('message', onMessage);
    return (): void => {
      win.removeEventListener('message', onMessage);
      stopStatus();
    };
  }, [installer, frameRef, hostRef]);
}
