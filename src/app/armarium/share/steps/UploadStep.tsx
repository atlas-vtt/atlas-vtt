import React from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { LoadingSpinner } from '../../../packages/components/primitives/LoadingSpinner';
import { ProgressBar } from '../../../packages/components/primitives/ProgressBar';
import { formatFileSize } from '../../../utils/fileSize';
import { t } from '../../../i18n';
import type { PartStatus } from '../../upload/BundleUpload';
import type { ShareSnapshot } from '../../upload/shareState';
import { ShareNotice } from './ShareNotice';
import { refusalSaid, shareSaid } from '../shareWording';

function PartMark({ status }: { status: PartStatus }): React.JSX.Element {
  if (status === 'sent') return <Check className="atlas-share-part__icon" aria-hidden="true" />;
  if (status === 'failed') return <CircleAlert className="atlas-share-part__icon" aria-hidden="true" />;
  if (status === 'sending') return <LoadingSpinner size={14} className="atlas-share-part__icon" />;
  return <span className="atlas-share-part__dot" aria-hidden="true" />;
}

const PART_STATUS: Readonly<Record<PartStatus, string>> = {
  waiting: t('armariumShare.part.waiting'),
  sending: t('armariumShare.part.sending'),
  sent: t('armariumShare.part.sent'),
  failed: t('armariumShare.part.failed'),
};

/** The upload step: packing what is shared in memory, then its parts on their way, each with where it stands. */
export function UploadStep({ snapshot }: { snapshot: ShareSnapshot }): React.JSX.Element {
  const { packing, upload, refusal, subject } = snapshot;
  const packingText = shareSaid(subject, 'armariumShare.packing');
  const failure = refusal === null ? null : refusal.code === 'export-failed'
    ? shareSaid(subject, 'armariumShare.exportFailed', { error: refusal.detail ?? '' })
    : refusalSaid(subject, refusal);
  // Bytes count once a whole part is in: until then nothing is counted, so no "0 of" is shown, only that it is on its way.
  const counting = upload !== null && (upload.sentBytes > 0 || upload.failure !== null);
  const sentText = upload === null ? '' : counting
    ? t('armariumShare.sentOf', { sent: formatFileSize(upload.sentBytes), total: formatFileSize(upload.totalBytes) })
    : t('armariumShare.sending', { total: formatFileSize(upload.totalBytes) });
  return (
    <>
      {packing !== null && (
        <div className="atlas-share-progress" role="status">
          <span className="atlas-share-progress__line">
            <LoadingSpinner size={16} />
            <span>{packing.message || packingText}</span>
          </span>
          <ProgressBar value={Math.round(packing.fraction * 100)} max={100} label={packingText} />
        </div>
      )}
      {upload !== null && (
        <div className="atlas-share-progress">
          <span className="atlas-share-progress__line">{sentText}</span>
          <ProgressBar value={upload.sentBytes} max={upload.totalBytes} label={t('armariumShare.step.upload')} valueText={sentText} indeterminate={!counting} />
          {upload.parts.length > 1 && (
            <ol className="atlas-share-parts" aria-label={t('armariumShare.parts')}>
              {upload.parts.map((status, index) => (
                <li key={index} className="atlas-share-part" data-status={status}>
                  <PartMark status={status} />
                  <span>{t('armariumShare.partOf', { n: index + 1, total: upload.parts.length })}</span>
                  <span className="atlas-share-part__status">{PART_STATUS[status]}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {failure !== null && <ShareNotice tone="error">{failure}</ShareNotice>}
      {failure !== null && refusal?.code !== 'export-failed' && <p className="atlas-share-text atlas-share-text--muted">{t('armariumShare.retryKeeps')}</p>}
    </>
  );
}
