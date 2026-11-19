import React, { useId } from 'react';
import type { AtlasAccount } from '../../../account/AtlasAccount';
import { Button } from '../../../packages/components/primitives/button';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { ToggleLabel } from '../../../packages/components/primitives/Toggle';
import { t } from '../../../i18n';
import type { ShareSession } from '../../upload/ShareSession';
import type { ShareSnapshot } from '../../upload/shareState';
import { ACCOUNT_PAGE_REFUSALS, DECLARATION, LICENCES, LISTING_TEXT, type LicenceId } from '../../upload/uploadContract';
import { LICENCE_URLS, licenceLabel, licenceLine } from '../../upload/text/listingVocabulary';
import { uploadMessageFor } from '../../upload/text/uploadMessages';
import { ARMARIUM_RULES_URL } from '../../armariumUrls';
import { useAccountState } from '../useShare';
import { CountedText, FieldProblem, useOverlayLayer } from './ListingFields';
import { ShareNotice } from './ShareNotice';

const NO_LICENCE = 'none';
const LICENCE_OPTIONS: SelectOption<LicenceId | typeof NO_LICENCE>[] = [
  { value: NO_LICENCE, label: t('armariumShare.chooseLicence') },
  ...LICENCES.map((licence) => ({ value: licence, label: licenceLabel(licence) })),
];

/** The publish step: the licence, the credits and the GM's declaration, in the exact words the Armarium stores. */
export function PublishStep({ snapshot, session, account }: { snapshot: ShareSnapshot; session: ShareSession; account: AtlasAccount }): React.JSX.Element {
  const { draft, problems, declared, refusal, reapproving } = snapshot;
  const licenceId = useId();
  const [layer, layerRef] = useOverlayLayer();
  const url = draft.licence === null ? null : LICENCE_URLS[draft.licence];
  const accountState = useAccountState(account);
  const code = reapproving && accountState.kind === 'waiting' ? accountState.userCode : null;
  return (
    <div ref={layerRef} className="atlas-share-form">
      <div className="atlas-share-field">
        <span id={licenceId} className="atlas-share-field__label">{t('armariumShare.licence')}</span>
        <Select labelledBy={licenceId} layer={layer} value={draft.licence ?? NO_LICENCE} options={LICENCE_OPTIONS} onChange={(licence) => session.setDraft({ licence: licence === NO_LICENCE ? null : licence })} />
        {draft.licence !== null && (
          <span className="atlas-share-field__hint">
            {licenceLine(draft.licence)}
            {url !== null && ' '}
            {url !== null && (
              <Button variant="link" className="atlas-share-inline-link" onClick={() => { window.open(url); }}>{t('armariumShare.readLicence')}</Button>
            )}
          </span>
        )}
        <FieldProblem id={`${licenceId}-problem`} field="licence" problems={problems} />
      </div>
      <CountedText
        label={t('armariumShare.credits')}
        hint={t('armariumShare.creditsHint')}
        value={draft.credits}
        onChange={(credits) => session.setDraft({ credits })}
        limits={LISTING_TEXT.credits}
        rows={3}
        field="credits"
        problems={problems}
      />
      <div className="atlas-share-declaration">
        <ToggleLabel label={DECLARATION.text} value={declared} onChange={() => session.setDeclared(!declared)} />
        <Button variant="link" className="atlas-share-inline-link" onClick={() => { window.open(ARMARIUM_RULES_URL); }}>{t('armariumShare.whatYouCanShare')}</Button>
      </div>
      {reapproving && (
        <ShareNotice tone="info">
          {t('armariumShare.reapproving')}
          {code !== null && <span className="atlas-share-code__value">{code}</span>}
          <span className="atlas-share-notice__actions">
            <Button variant="link" className="atlas-share-inline-link" onClick={() => account.reopenSignIn()}>{t('account.openAgain')}</Button>
            <Button variant="link" className="atlas-share-inline-link" onClick={() => account.cancelSignIn()}>{t('common.cancel')}</Button>
          </span>
        </ShareNotice>
      )}
      {refusal !== null && !reapproving && (
        <ShareNotice tone="error">
          {uploadMessageFor(refusal.code, refusal.until, 'publish')}
          {ACCOUNT_PAGE_REFUSALS.includes(refusal.code) && (
            <Button variant="link" className="atlas-share-inline-link" onClick={() => account.openAccountPage()}>{t('account.openPage')}</Button>
          )}
        </ShareNotice>
      )}
    </div>
  );
}
