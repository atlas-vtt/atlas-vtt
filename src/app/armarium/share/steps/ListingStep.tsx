import React, { useId } from 'react';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { t } from '../../../i18n';
import type { ShareSession } from '../../upload/ShareSession';
import type { ShareSnapshot } from '../../upload/shareState';
import { KINDS, LISTING_TEXT, SYSTEMS, type ListingKind, type SystemId } from '../../upload/uploadContract';
import { kindLabel, kindLine, systemLabel } from '../../upload/text/listingVocabulary';
import { FindingReport } from './FindingReport';
import { CountedText, FieldProblem, TagPicker, useOverlayLayer } from './ListingFields';

const NO_KIND = 'none';
const KIND_OPTIONS: SelectOption<ListingKind | typeof NO_KIND>[] = [
  { value: NO_KIND, label: t('armariumShare.chooseKind') },
  ...KINDS.map((kind) => ({ value: kind, label: kindLabel(kind), detail: kindLine(kind) })),
];
const SYSTEM_OPTIONS: SelectOption<SystemId | 'none'>[] = [
  { value: 'none', label: systemLabel(null) },
  ...SYSTEMS.map((system) => ({ value: system, label: systemLabel(system) })),
];

/** The listing step: what the bundle says of itself, read-only, and what the GM chooses for its page. */
export function ListingStep({ snapshot, session }: { snapshot: ShareSnapshot; session: ShareSession }): React.JSX.Element {
  const { draft, problems, submission, ownListing } = snapshot;
  const kindId = useId();
  const systemId = useId();
  const [layer, layerRef] = useOverlayLayer();
  const manifest = submission?.manifest ?? null;
  const update = ownListing !== null && manifest !== null && manifest.uid === ownListing.uid;
  return (
    <div ref={layerRef} className="atlas-share-form">
      <p className="atlas-share-text atlas-share-text--muted">{update ? t('armariumShare.updateIntro') : t('armariumShare.listingIntro')}</p>
      {manifest !== null && (
        <dl className="atlas-share-facts">
          <dt>{t('armariumShare.fromBundle.name')}</dt>
          <dd>{manifest.name}</dd>
          <dt>{t('armariumShare.fromBundle.version')}</dt>
          <dd>{manifest.notes ? t('armariumShare.versionWithNotes', { version: manifest.version, notes: manifest.notes }) : String(manifest.version)}</dd>
        </dl>
      )}
      <div className="atlas-share-row">
        <div className="atlas-share-field">
          <span id={kindId} className="atlas-share-field__label">{t('armariumShare.kind')}</span>
          <Select labelledBy={kindId} layer={layer} value={draft.kind ?? NO_KIND} options={KIND_OPTIONS} onChange={(kind) => session.setDraft({ kind: kind === NO_KIND ? null : kind })} />
          {draft.kind !== null && <span className="atlas-share-field__hint">{kindLine(draft.kind)}</span>}
          <FieldProblem id={`${kindId}-problem`} field="kind" problems={problems} />
        </div>
        <div className="atlas-share-field">
          <span id={systemId} className="atlas-share-field__label">{t('armariumShare.system')}</span>
          <Select labelledBy={systemId} layer={layer} value={draft.system} options={SYSTEM_OPTIONS} onChange={(system) => session.setDraft({ system })} />
          <FieldProblem id={`${systemId}-problem`} field="system" problems={problems} />
        </div>
      </div>
      <CountedText
        label={t('armariumShare.description')}
        hint={t('armariumShare.descriptionHint')}
        value={draft.description}
        onChange={(description) => session.setDraft({ description })}
        limits={LISTING_TEXT.description}
        rows={7}
        field="description"
        problems={problems}
      />
      <TagPicker value={draft.tags} onToggle={(tag) => session.toggleTag(tag)} problems={problems} />
      {submission !== null && submission.findings.length > 0 && <FindingReport findings={submission.findings} notesOnly />}
    </div>
  );
}
