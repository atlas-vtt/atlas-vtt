import React, { useId, useMemo, useState } from 'react';
import { groupContents, selectContent, selectedKeys } from '../../../../services/collectionBundle/bundleContents';
import type { CoverChoice } from '../../../../services/collectionBundle/collectionCover';
import type { ExportChoice, ExportPreview } from '../../../../services/collectionBundle/collectionExport';
import { formatFileSize } from '../../../../utils/fileSize';
import { baseName } from '../../../../utils/pathUtils';
import { Button } from '../../primitives/button';
import { LabelTooltip } from '../../primitives/tooltip';
import { CollectionHero } from './CollectionHero';
import type { ContentMedia } from './contentMedia';
import { ContentsList } from './ContentsList';
import { CoverPicker } from './CoverPicker';
import { TransferDialog } from './TransferDialog';
import { useObjectUrl } from './useObjectUrl';
import { t } from '../../../../i18n';

interface ExportCollectionDialogProps {
  preview: ExportPreview;
  media: ContentMedia;
  /** Resolves with a message to show when the choice cannot be exported. */
  onExport: (choice: ExportChoice) => Promise<string | null>;
  onCancel: () => void;
}

const MISSING_SHOWN = 5;

function initialCover({ cover, coverCandidates }: ExportPreview): CoverChoice {
  if (cover) return { kind: 'current' };
  return coverCandidates[0] ? { kind: 'artwork', path: coverCandidates[0].sourcePath } : { kind: 'none' };
}

function coverUrl(choice: CoverChoice, preview: ExportPreview, uploadUrl: string | undefined): string | undefined {
  switch (choice.kind) {
    case 'current': return preview.cover?.url;
    case 'artwork': return preview.coverCandidates.find((candidate) => candidate.sourcePath === choice.path)?.imageUrl;
    case 'upload': return uploadUrl;
    case 'none': return undefined;
  }
}

/**
 * Exports a collection as its publisher's next release. A collection installed
 * from someone else is published as the user's own: a new collection under a
 * new name. The user picks a cover and what to include, and sees it the way
 * people who import it will.
 */
export function ExportCollectionDialog({ preview, media, onExport, onCancel }: ExportCollectionDialogProps): React.JSX.Element {
  const { collection } = preview;
  const isFork = preview.publisher === 'other';
  const [version, setVersion] = useState(String(preview.suggestedVersion));
  // A published copy is the user's own work, not its original author's.
  const [author, setAuthor] = useState(isFork ? '' : collection.author ?? '');
  const [notes, setNotes] = useState('');
  const [forkName, setForkName] = useState(`${collection.name} (my edition)`);
  const [cover, setCover] = useState<CoverChoice>(() => initialCover(preview));
  const [upload, setUpload] = useState<Blob>();
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const uploadUrl = useObjectUrl(upload);
  const nameLabelId = useId();

  const groups = useMemo(() => groupContents(preview.assets, preview.files), [preview]);
  const selected = useMemo(() => selectContent(preview.assets, preview.files, excluded), [preview, excluded]);
  const included = useMemo(() => selectedKeys(selected), [selected]);
  const bytes = selected.files.reduce((sum, file) => sum + (preview.fileSizes.get(file.vaultPath) ?? 0), 0);
  const versionNumber = isFork ? 1 : Number(version);
  const isWholeVersion = Number.isInteger(versionNumber);

  const choice = (): ExportChoice | string => {
    if (selected.assets.length === 0) return t('exportDialog.includeOne');
    const content = { excluded, cover, author, notes };
    if (isFork) return forkName.trim() ? { kind: 'fork', name: forkName, ...content } : t('exportDialog.enterName');
    if (!isWholeVersion || versionNumber < preview.minimumVersion) {
      return t('exportDialog.versionInvalid', { min: preview.minimumVersion });
    }
    return { kind: 'release', version: versionNumber, ...content };
  };

  const submit = async (): Promise<void> => {
    const next = choice();
    setError(typeof next === 'string' ? next : await onExport(next));
  };

  const sameVersion = versionNumber === collection.version && collection.releasedAt !== undefined;
  const confirmLabel = isFork ? t('exportDialog.publish') : t('exportDialog.exportVersion', { version: isWholeVersion ? String(versionNumber) : '…' });

  const heroUrl = coverUrl(cover, preview, uploadUrl);
  // The tint is blurred beyond recognition, so the small preview gives the same colours at a fraction of the cost.
  const ambientUrl = cover.kind === 'artwork'
    ? preview.coverCandidates.find((candidate) => candidate.sourcePath === cover.path)?.previewUrl
    : heroUrl;
  const itemCount = groups.reduce((count, group) => count + group.items.filter((item) => included.has(item.key)).length, 0);

  return (
    <TransferDialog
      label={t(isFork ? 'exportDialog.publishNamed' : 'exportDialog.exportNamed', { name: collection.name })}
      onClose={onCancel}
      ambientUrl={ambientUrl}
      hero={(
        <CollectionHero
          eyebrow={isFork ? t('exportDialog.publishOwn') : t('exportDialog.exportCollection')}
          imageUrl={heroUrl}
          name={isFork
            ? (
              <>
                <span id={nameLabelId} hidden>{t('exportDialog.name')}</span>
                <input className="atlas-transfer-hero__name-input" aria-labelledby={nameLabelId} value={forkName} onChange={(event) => setForkName(event.target.value)} />
              </>
            )
            : collection.name}
          version={`v${isWholeVersion ? versionNumber : '…'}`}
          details={[author.trim() && t('common.by', { author: author.trim() })]}
          description={collection.description}
        />
      )}
      aside={(
        <CoverPicker
          value={cover}
          current={preview.cover}
          candidates={preview.coverCandidates}
          upload={upload && uploadUrl ? { image: upload, url: uploadUrl } : undefined}
          onUpload={(image) => {
            setUpload(image);
            setCover({ kind: 'upload', image });
          }}
          onChange={setCover}
        />
      )}
      summary={`${t('count.items', { count: itemCount })} · ${t('count.files', { count: selected.files.length + (cover.kind === 'none' ? 0 : 1) })} · ${formatFileSize(bytes)}`}
      actions={(
        <>
          <LabelTooltip label={t('exportDialog.closeHint')} describe>
            <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>
          </LabelTooltip>
          <LabelTooltip label={selected.assets.length === 0 ? t('exportDialog.includeHint') : t('exportDialog.zipHint')} describe>
            <Button variant="default" className="atlas-transfer-confirm" disabled={selected.assets.length === 0} onClick={() => { void submit(); }}>{confirmLabel}</Button>
          </LabelTooltip>
        </>
      )}
    >
      {isFork && (
        <p className="atlas-transfer-text atlas-transfer-text--muted">
          {t('exportDialog.forkIntro', { from: collection.author ? t('exportDialog.fromAuthor', { author: collection.author }) : '' })}
        </p>
      )}
      <div className="atlas-transfer-fields">
        {!isFork && (
          <label className="atlas-transfer-field atlas-transfer-field--version">
            <span>{t('exportDialog.version')}</span>
            <input className="atlas-input" type="number" min={preview.minimumVersion} step={1} value={version} onChange={(event) => setVersion(event.target.value)} />
          </label>
        )}
        <label className="atlas-transfer-field atlas-transfer-field--grow">
          <span>{t('exportDialog.author')}</span>
          <input className="atlas-input" value={author} placeholder={t('exportDialog.authorPlaceholder')} onChange={(event) => setAuthor(event.target.value)} />
        </label>
      </div>
      {sameVersion && !isFork && (
        <p className="atlas-transfer-hint">{t('exportDialog.sameVersion', { version: String(collection.version) })}</p>
      )}
      <label className="atlas-transfer-field">
        <span>{t('exportDialog.notes')}</span>
        <textarea className="atlas-input atlas-transfer-notes" value={notes} placeholder={t('exportDialog.notesPlaceholder')} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <ContentsList groups={groups} media={media} selection={{ included, excluded, onChange: setExcluded }} />
      {preview.missing.length > 0 && (
        <div className="atlas-transfer-callout atlas-transfer-callout--warning" role="note">
          <strong>{t('exportDialog.missing', { count: preview.missing.length })}</strong>
          <ul>
            {preview.missing.slice(0, MISSING_SHOWN).map((missing) => (
              <li key={missing.path}>{baseName(missing.path)} ({missing.assetName})</li>
            ))}
            {preview.missing.length > MISSING_SHOWN && <li>{t('common.andMore', { count: preview.missing.length - MISSING_SHOWN })}</li>}
          </ul>
        </div>
      )}
      {error && <div className="atlas-input-error" role="alert">{error}</div>}
    </TransferDialog>
  );
}
