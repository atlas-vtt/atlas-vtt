import React from 'react';
import { accountStateText, signInNoticeText } from '../../../account/accountSettingsSection';
import type { AccountState } from '../../../account/AtlasAccount';
import { Skeleton, SkeletonGroup } from '../../../packages/components/primitives/Skeleton';
import { t } from '../../../i18n';
import type { Gate } from '../../upload/shareState';
import { uploadMessageFor } from '../../upload/text/uploadMessages';
import { ShareNotice } from './ShareNotice';

/** The account step: sign in on this device, then whether the account may share now. */
export function AccountStep({ state, gate }: { state: AccountState; gate: Gate | null }): React.JSX.Element {
  switch (state.kind) {
    case 'unavailable':
      return <ShareNotice tone="error">{accountStateText(state)}</ShareNotice>;
    case 'signed-out': {
      const notice = signInNoticeText(state.notice);
      return (
        <>
          <p className="atlas-share-text">{t('armariumShare.signInWhy')}</p>
          <p className="atlas-share-text atlas-share-text--muted">{t('armariumShare.signInHow')}</p>
          {notice !== null && <ShareNotice tone="error">{notice}</ShareNotice>}
        </>
      );
    }
    case 'waiting':
      return (
        <div className="atlas-share-code" role="status">
          <p className="atlas-share-text">{state.again ? t('armariumShare.approveAgain') : t('armariumShare.approveInBrowser')}</p>
          {state.userCode !== null && (
            <>
              <span className="atlas-share-code__label">{t('armariumShare.yourCode')}</span>
              <span className="atlas-share-code__value">{state.userCode}</span>
            </>
          )}
        </div>
      );
    case 'signed-in':
      if (gate?.status === 'refused') return <ShareNotice tone="error">{uploadMessageFor(gate.refusal.code, gate.refusal.until)}</ShareNotice>;
      return (
        <SkeletonGroup className="atlas-share-checking" label={t('armariumShare.checkingAccount')}>
          <Skeleton shape="text" width="80%" />
          <Skeleton shape="text" width="55%" />
        </SkeletonGroup>
      );
  }
}
