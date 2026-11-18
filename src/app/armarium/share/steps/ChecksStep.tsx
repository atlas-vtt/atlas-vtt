import React from 'react';
import { Check } from 'lucide-react';
import { ProgressBar } from '../../../packages/components/primitives/ProgressBar';
import { t } from '../../../i18n';
import type { ShareSnapshot } from '../../upload/shareState';
import { CHECK_STAGES, type SubmissionView } from '../../upload/uploadContract';
import { stageLabel, stateMessage, uploadMessageFor } from '../../upload/text/uploadMessages';
import { FindingReport } from './FindingReport';
import { ShareNotice } from './ShareNotice';

/** The stages in their order, each ticked once the check is past it; the one that runs shows how far it is. */
function Stages({ submission }: { submission: SubmissionView }): React.JSX.Element {
  const { progress } = submission;
  const at = progress === null ? -1 : CHECK_STAGES.indexOf(progress.stage);
  return (
    <ol className="atlas-share-stages" aria-label={t('armariumShare.step.checks')}>
      {CHECK_STAGES.map((stage, index) => {
        const done = index < at;
        const running = index === at && progress !== null;
        const status = done ? t('armariumShare.stage.passed') : running ? t('armariumShare.stage.running') : t('armariumShare.stage.waiting');
        return (
          <li key={stage} className="atlas-share-stage" data-status={done ? 'done' : running ? 'running' : 'waiting'}>
            <span className="atlas-share-stage__mark" aria-hidden="true">{done && <Check />}</span>
            <span className="atlas-share-stage__name">{stageLabel(stage)}</span>
            <span className="atlas-share-visually-hidden">{status}</span>
            {running && progress.total > 0 && <ProgressBar value={progress.done} max={progress.total} label={stageLabel(stage)} className="atlas-share-stage__bar" />}
          </li>
        );
      })}
    </ol>
  );
}

/** The checks step: the stages as they pass, or what the checks found and the way to a fixed bundle. */
export function ChecksStep({ snapshot }: { snapshot: ShareSnapshot }): React.JSX.Element | null {
  const { submission, refusal } = snapshot;
  if (submission === null) return null;
  if (submission.state === 'rejected') {
    return (
      <>
        <ShareNotice tone="error">{t('armariumShare.rejected')}</ShareNotice>
        <FindingReport findings={submission.findings} />
        <p className="atlas-share-text atlas-share-text--muted">{t('armariumShare.fixThenShare')}</p>
      </>
    );
  }
  if (submission.state === 'failed') return <ShareNotice tone="error">{stateMessage('failed')}</ShareNotice>;
  return (
    <>
      <p className="atlas-share-text" role="status">{stateMessage(submission.state)}</p>
      <Stages submission={submission} />
      {refusal !== null && <ShareNotice tone="error">{uploadMessageFor(refusal.code, refusal.until)}</ShareNotice>}
    </>
  );
}
