import React, { useId } from 'react';
import { Folder, Music } from 'lucide-react';
import type { MusicReview } from '../../../../services/musicBundle/musicImport';
import { formatLength } from '../../../../react/components/dm-screen/sound/library/rowModel';
import { formatFileSize } from '../../../../utils/fileSize';
import { formatList, t } from '../../../../i18n';
import { Button } from '../../primitives/button';
import { CollectionHero } from './CollectionHero';
import { TransferDialog } from './TransferDialog';
import { useObjectUrl } from './useObjectUrl';

interface MusicReviewDialogProps {
  review: MusicReview;
  onConfirm: () => void;
  onCancel: () => void;
}

/** What an update does to the install before it, in one line: tracks replaced, added and taken out. */
function updateLine(update: NonNullable<MusicReview['update']>): string {
  const parts = [
    update.replaced > 0 ? t('armariumMusic.review.replaced', { count: update.replaced }) : '',
    update.added > 0 ? t('armariumMusic.review.added', { count: update.added }) : '',
    update.removed > 0 ? t('armariumMusic.review.removed', { count: update.removed }) : '',
  ].filter(Boolean);
  return formatList(parts);
}

/** The music's totals, as the footer shows them: tracks, how long they play, and their size. */
export function musicTotals(tracks: number, seconds: number, bytes: number): string {
  return [t('armariumMusic.trackCount', { count: tracks }), formatLength(seconds), formatFileSize(bytes)].join(' · ');
}

/**
 * The review of an album or a track before it comes into the music folder: its cover, name, artist and creator, the
 * tracks with their lengths, where it goes, and for an update what it replaces. The GM confirms or cancels; nothing
 * is written before.
 */
export function MusicReviewDialog({ review, onConfirm, onCancel }: MusicReviewDialogProps): React.JSX.Element {
  const coverUrl = useObjectUrl(review.cover ?? undefined);
  const tracksId = useId();
  const whereId = useId();
  const notesId = useId();
  const { update, same } = review;
  const details = [review.artist ?? '', t(`armariumMusic.kind.${review.kind}`), review.creator ? t('common.by', { author: review.creator }) : ''];
  const confirmLabel = same ? t('itemReview.confirm.same') : update ? t('armariumMusic.review.update.action') : t('armariumMusic.review.install');
  return (
    <TransferDialog
      label={t('armariumMusic.review.label', { name: review.name })}
      onClose={onCancel}
      ambientUrl={coverUrl}
      hero={(
        <CollectionHero
          eyebrow={update ? t('armariumMusic.review.eyebrowUpdate') : t('armariumMusic.review.eyebrow')}
          imageUrl={coverUrl}
          name={review.name}
          version={update && !same ? `v${update.from} → v${review.version}` : `v${review.version}`}
          details={details}
        />
      )}
      summary={musicTotals(review.tracks.length, review.seconds, review.bytes)}
      actions={(
        <>
          {!same && <Button variant="outline" onClick={onCancel}>{t('common.cancel')}</Button>}
          <Button variant="default" className="atlas-transfer-confirm" onClick={onConfirm} autoFocus>{confirmLabel}</Button>
        </>
      )}
    >
      <div className="atlas-music-review">
        {same && <p className="atlas-transfer-text">{t('armariumMusic.review.same')}</p>}
        {!same && update && (
          <div className="atlas-music-review__outcome">
            <p className="atlas-transfer-text">{t('armariumMusic.review.update', { from: update.from, version: review.version })}</p>
            {updateLine(update) !== '' && <p className="atlas-transfer-text atlas-transfer-text--muted">{updateLine(update)}</p>}
            {update.kept > 0 && <p className="atlas-transfer-text atlas-transfer-text--muted">{t('armariumMusic.review.kept', { count: update.kept })}</p>}
          </div>
        )}
        {!same && !update && <p className="atlas-transfer-text">{t('armariumMusic.review.new')}</p>}
        {review.notes && (
          <section className="atlas-transfer-section" aria-labelledby={notesId}>
            <h3 id={notesId} className="atlas-transfer-section__title">{t('itemReview.notes')}</h3>
            <p className="atlas-transfer-notes-view">{review.notes}</p>
          </section>
        )}
        <section className="atlas-transfer-section" aria-labelledby={whereId}>
          <h3 id={whereId} className="atlas-transfer-section__title">{t('armariumMusic.review.where')}</h3>
          <p className="atlas-music-review__where">
            <Folder aria-hidden="true" />
            <span>{review.where.join(' / ')}</span>
          </p>
        </section>
        <section className="atlas-transfer-section" aria-labelledby={tracksId}>
          <h3 id={tracksId} className="atlas-transfer-section__title">{t('armariumMusic.tracks')}</h3>
          <ol className="atlas-music-tracks" aria-labelledby={tracksId}>
            {review.tracks.map((track, index) => (
              <li key={`${index}:${track.title}`} className="atlas-music-track">
                <span className="atlas-music-track__number" aria-hidden="true">{index + 1}</span>
                <Music className="atlas-music-track__glyph" aria-hidden="true" />
                <span className="atlas-music-track__title">{track.title}</span>
                <span className="atlas-music-track__state">{formatLength(track.seconds)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </TransferDialog>
  );
}
