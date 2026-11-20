import React from 'react';
import { t } from '../../../i18n';
import type { ShareSnapshot } from '../../upload/shareState';
import { stateMessage } from '../../upload/text/uploadMessages';
import { ShareNotice } from './ShareNotice';

/** The end: published (its page appears within minutes), or held for the Armarium team while staff switched that on. */
export function DoneStep({ snapshot }: { snapshot: ShareSnapshot }): React.JSX.Element | null {
  const { published, bundle } = snapshot;
  if (published === null) return null;
  const name = bundle === null ? null : t('armariumShare.nameVersion', { name: bundle.name, version: bundle.version });
  return (
    <>
      {published.held ? (
        <ShareNotice tone="info">{stateMessage('held')}</ShareNotice>
      ) : (
        <ShareNotice tone="success">
          {name === null ? t('armariumShare.publishedPlain') : t('armariumShare.published', { name })}
        </ShareNotice>
      )}
      {!published.held && <p className="atlas-share-text atlas-share-text--muted">{t('armariumShare.pageSoon')}</p>}
      {published.recordFailed !== null && <ShareNotice tone="error">{t('armariumShare.recordFailed', { error: published.recordFailed })}</ShareNotice>}
    </>
  );
}
