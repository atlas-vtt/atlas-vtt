import React, { useCallback, useState } from 'react';
import { AlertTriangle, ArrowDown, Check } from 'lucide-react';
import { t } from '../../../../../i18n';
import { overallShare } from '../../../../../downloads/DownloadManager';
import { isActive } from '../../../../../downloads/downloadTypes';
import { LabelTooltip } from '../../../../../packages/components/primitives/tooltip';
import { DownloadsPanel } from './DownloadsPanel';
import { useDownloadJobs, useDownloadManager } from './useDownloads';

const RADIUS = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The downloads at the rail's foot while there are any: a ring that fills with what is still to come, a tick once
 * all came (bright for a moment, then calm), a warning while one failed. A press opens the panel above it.
 */
export function DownloadsButton(): React.JSX.Element | null {
  const manager = useDownloadManager();
  const jobs = useDownloadJobs(manager);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  if (jobs.length === 0) return null;

  const share = overallShare(jobs);
  const active = jobs.some(isActive);
  const face = active ? 'active' : jobs.some((job) => job.state === 'failed') ? 'failed' : 'done';
  const percent = Math.floor((share ?? 0) * 100);
  const label = active ? t('downloads.buttonActive', { percent }) : t('downloads.title');
  // A new tick plays its moment again: the number of finished jobs names it.
  const finishedCount = jobs.filter((job) => job.state === 'done').length;

  return (
    <>
      <LabelTooltip label={label}>
        <button
          type="button"
          className="atlas-sound-dl"
          data-face={face}
          aria-label={label}
          aria-haspopup="dialog"
          aria-expanded={anchor !== null}
          onClick={(event) => {
            const target = event.currentTarget;
            setAnchor((open) => (open ? null : target));
          }}
        >
          <svg className="atlas-sound-dl__ring" viewBox="0 0 28 28" aria-hidden="true">
            <circle className="atlas-sound-dl__track" cx="14" cy="14" r={RADIUS} />
            {active && <circle className="atlas-sound-dl__arc" cx="14" cy="14" r={RADIUS} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - (share ?? 0))} />}
          </svg>
          {face === 'active' && <ArrowDown className="atlas-sound-dl__icon" aria-hidden="true" />}
          {face === 'failed' && <AlertTriangle className="atlas-sound-dl__icon" aria-hidden="true" />}
          {face === 'done' && (
            <span key={finishedCount} className="atlas-sound-dl__done" aria-hidden="true">
              <Check className="atlas-sound-dl__icon" />
              <Check className="atlas-sound-dl__icon atlas-sound-dl__icon--bright" />
            </span>
          )}
        </button>
      </LabelTooltip>
      {anchor && <DownloadsPanel manager={manager} anchor={anchor} onClose={close} />}
    </>
  );
}
