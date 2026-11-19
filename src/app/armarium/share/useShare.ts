import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { AccountState, AtlasAccount } from '../../account/AtlasAccount';
import { confirmAction } from '../../ui/confirmDialog';
import { t } from '../../i18n';
import type { ShareSession } from '../upload/ShareSession';
import type { ShareSnapshot } from '../upload/shareState';
import { leaveShare } from './leaveShare';

/** The share as it stands, rendered anew whenever the session changes. */
export function useShareSnapshot(session: ShareSession): ShareSnapshot {
  return useSyncExternalStore(
    useCallback((listener: () => void) => session.subscribe(listener), [session]),
    () => session.snapshot(),
  );
}

/** The account's state, read anew whenever it changes; `state()` builds a fresh object, so a counter stands for it. */
export function useAccountState(account: AtlasAccount): AccountState {
  const version = useRef(0);
  useSyncExternalStore(
    useCallback((listener: () => void) => account.onChange(() => {
      version.current += 1;
      listener();
    }), [account]),
    () => version.current,
  );
  return account.state();
}

/** Whether leaving now would lose an upload: something was packed or sent, and nothing published. */
function losesUpload(snapshot: ShareSnapshot): boolean {
  return snapshot.published === null && (snapshot.bundle !== null || snapshot.submission !== null);
}

/**
 * Closing the share: at once where nothing was uploaded or it is published, after the GM confirmed where an upload
 * would be discarded. Never while a publish is on its way, which would leave the vault not knowing its own release.
 */
export function useShareClose(session: ShareSession, onClose: () => void): () => void {
  const asking = useRef(false);
  return useCallback((): void => {
    const snapshot = session.snapshot();
    if (asking.current || (snapshot.step === 'publish' && snapshot.busy)) return;
    if (!losesUpload(snapshot)) {
      onClose();
      void leaveShare(session);
      return;
    }
    asking.current = true;
    void confirmAction({
      title: t('armariumShare.leaveTitle'),
      message: [t('armariumShare.leaveBody')],
      confirmLabel: t('armariumShare.leaveConfirm'),
      destructive: true,
    }).then((leave) => {
      asking.current = false;
      if (!leave) return;
      onClose();
      void leaveShare(session);
    });
  }, [session, onClose]);
}
