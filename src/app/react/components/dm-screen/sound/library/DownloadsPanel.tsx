import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { RotateCw, X } from 'lucide-react';
import { t } from '../../../../../i18n';
import type { DownloadManager } from '../../../../../downloads/DownloadManager';
import { isActive, type DownloadJob } from '../../../../../downloads/downloadTypes';
import { portalHost } from '../../../../../host/portalHost';
import { useDialogEscape } from '../../../../../packages/components/primitives/useDialogEscape';
import { TooltipProvider } from '../../../../../packages/components/primitives/tooltip';
import { IconAction } from '../IconAction';
import { usePlaceAtTile } from '../usePlaceAtTile';
import { jobLine } from './downloadText';
import { useDownloadJobs } from './useDownloads';

function JobRow({ job, manager }: { job: DownloadJob; manager: DownloadManager }): React.JSX.Element {
  const share = job.total.bytes > 0 ? Math.min(1, job.done.bytes / job.total.bytes) : 0;
  return (
    <li className="atlas-sound-downloads__job" data-state={job.state}>
      <div className="atlas-sound-downloads__head">
        <span className="atlas-sound-downloads__title">{job.title}</span>
        {isActive(job) && <IconAction label={t('downloads.cancel')} icon={X} className="atlas-sound-downloads__action" onClick={() => manager.cancel(job.id)} />}
        {(job.state === 'failed' || job.state === 'cancelled') && <IconAction label={t('downloads.retry')} icon={RotateCw} className="atlas-sound-downloads__action" onClick={() => manager.retry(job.id)} />}
        {job.state === 'done' && job.canReveal && (
          <button type="button" className="atlas-sound-downloads__show" onClick={() => manager.reveal(job.id)}>{t('downloads.show')}</button>
        )}
      </div>
      {isActive(job) && (
        <div className="atlas-sound-downloads__bar" role="progressbar" aria-label={job.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(share * 100)}>
          <span style={{ transform: `scaleX(${share})` }} />
        </div>
      )}
      <span className="atlas-sound-downloads__line">{jobLine(job)}</span>
    </li>
  );
}

/** The downloads, in a popover over the button that opened it: one row per job, with its progress and what can be done with it. */
export function DownloadsPanel({ manager, anchor, onClose }: { manager: DownloadManager; anchor: HTMLElement; onClose: () => void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const jobs = useDownloadJobs(manager);
  useDialogEscape(ref, onClose);
  const place = usePlaceAtTile(ref, anchor, onClose);
  const finished = jobs.some((job) => !isActive(job));

  return createPortal(
    <div className="atlas-vtt-plugin atlas-sound-popover-layer">
      <TooltipProvider>
        <div
          ref={ref}
          className="atlas-sound-popover atlas-sound-downloads"
          role="dialog"
          aria-label={t('downloads.title')}
          data-side={place?.side}
          style={{ left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? undefined : 'hidden', '--atlas-sound-caret': `${place?.caret ?? 0}px` } as React.CSSProperties}
        >
          <span className="atlas-sound-popover__caret" aria-hidden="true" />
          <div className="atlas-sound-downloads__top">
            <h3>{t('downloads.title')}</h3>
            {finished && <button type="button" className="atlas-sound-downloads__clear" onClick={() => manager.clearFinished()}>{t('downloads.clear')}</button>}
          </div>
          <ul className="atlas-sound-downloads__list">
            {jobs.map((job) => <JobRow key={job.id} job={job} manager={manager} />)}
          </ul>
        </div>
      </TooltipProvider>
    </div>,
    portalHost(anchor.ownerDocument),
  );
}
