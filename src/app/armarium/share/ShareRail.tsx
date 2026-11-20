import React from 'react';
import { Check } from 'lucide-react';
import { identityText } from '../../account/accountIdentity';
import type { AccountState } from '../../account/AtlasAccount';
import { formatFileSize } from '../../utils/fileSize';
import { t } from '../../i18n';
import { kindLabel, licenceLabel } from '../upload/text/listingVocabulary';
import { findingSections } from '../upload/text/findingGroups';
import { SHARE_STEPS, stepStatus, type ShareSnapshot } from '../upload/shareState';

type RailStep = (typeof SHARE_STEPS)[number];

const STEP_NAMES: Readonly<Record<RailStep, string>> = {
  account: t('armariumShare.step.account'),
  bundle: t('armariumShare.step.bundle'),
  upload: t('armariumShare.step.upload'),
  checks: t('armariumShare.step.checks'),
  listing: t('armariumShare.step.listing'),
  publish: t('armariumShare.step.publish'),
};

/** What a finished step settled, in a few words under its name. */
function settled(step: RailStep, snapshot: ShareSnapshot, accountState: AccountState): string | null {
  switch (step) {
    case 'account': return accountState.kind === 'signed-in' && typeof accountState.who === 'object' ? identityText(accountState.who) : null;
    case 'bundle': return snapshot.bundle === null ? null : t('armariumShare.rail.version', { version: snapshot.bundle.version });
    case 'upload': return snapshot.bundle === null ? null : formatFileSize(snapshot.bundle.bytes);
    case 'checks': {
      const notes = findingSections(snapshot.submission?.findings ?? []).notes.total;
      return notes === 0 ? t('armariumShare.rail.passed') : t('armariumShare.rail.passedWithNotes', { count: notes });
    }
    case 'listing': return snapshot.draft.kind === null ? null : kindLabel(snapshot.draft.kind);
    case 'publish': return snapshot.draft.licence === null ? null : licenceLabel(snapshot.draft.licence);
  }
}

/** The share's steps beside the open one: done ones ticked with what they settled, the open one marked. */
export function ShareRail({ snapshot, accountState }: { snapshot: ShareSnapshot; accountState: AccountState }): React.JSX.Element {
  return (
    <ol className="atlas-share-rail" aria-label={t('armariumShare.steps')}>
      {SHARE_STEPS.map((step, index) => {
        const status = stepStatus(snapshot.step, step);
        const detail = status === 'done' ? settled(step, snapshot, accountState) : null;
        return (
          <li key={step} className="atlas-share-rail__step" data-status={status} aria-current={status === 'current' ? 'step' : undefined}>
            <span className="atlas-share-rail__mark" aria-hidden="true">{status === 'done' ? <Check /> : index + 1}</span>
            <span className="atlas-share-rail__text">
              <span className="atlas-share-rail__name">{STEP_NAMES[step]}</span>
              {detail !== null && <span className="atlas-share-rail__detail">{detail}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
