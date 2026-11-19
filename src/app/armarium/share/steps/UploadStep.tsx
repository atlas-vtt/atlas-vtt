import React from 'react';
import { Check, CircleAlert } from 'lucide-react';
import { LoadingSpinner } from '../../../packages/components/primitives/LoadingSpinner';
import { ProgressBar } from '../../../packages/components/primitives/ProgressBar';
import { formatFileSize } from '../../../utils/fileSize';
import { t } from '../../../i18n';
import type { PartStatus } from '../../upload/BundleUpload';
import type { ShareSnapshot } from '../../upload/shareState';
import { uploadMessageFor } from '../../upload/text/uploadMessages';
import { ShareNotice } from './ShareNotice';

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

/** The upload step: packing the collection in memory, then its parts on their way, each with where it stands. */
export function UploadStep({ snapshot }: { snapshot: ShareSnapshot }): React.JSX.Element {
  const { packing, upload, refusal } = snapshot;
  const failure = refusal === null ? null : refusal.code === 'export-failed'
    ? t('armariumShare.exportFailed', { error: refusal.detail ?? '' })
    : uploadMessageFor(refusal.code, refusal.until);
  const sentText = upload === null ? '' : t('armariumShare.sentOf', { sent: formatFileSize(upload.sentBytes), total: formatFileSize(upload.totalBytes) });
  return (
    <>
      {packing !== null && (
        <div className="atlas-share-progress" role="status">
          <span className="atlas-share-progress__line">
            <LoadingSpinner size={16} />
            <span>{packing.message || t('armariumShare.packing')}</span>
          </span>
          <ProgressBar value={Math.round(packing.fraction * 100)} max={100} label={t('armariumShare.packing')} />
        </div>
      )}
      {upload !== null && (
        <div className="atlas-share-progress">
          <span className="atlas-share-progress__line">{sentText}</span>
          <ProgressBar value={upload.sentBytes} max={upload.totalBytes} label={t('armariumShare.step.upload')} valueText={sentText} />
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
