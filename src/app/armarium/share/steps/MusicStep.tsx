import React, { useId } from 'react';
import { t } from '../../../i18n';
import { CoverPicker } from '../../../packages/components/asset-manager/collection-transfer/CoverPicker';
import { useObjectUrl } from '../../../packages/components/asset-manager/collection-transfer/useObjectUrl';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import type { CoverChoice } from '../../../services/collectionBundle/collectionCover';
import { MAX_MUSIC_TEXT } from '../../../services/musicBundle/musicBundleFormat';
import type { MusicShareSession } from '../../upload/MusicShareSession';
import type { MusicShareSnapshot } from '../../upload/musicShareState';
import { ITEM_NOTES_LIMITS, nextItemVersion } from '../../upload/shareState';
import { CountedText, useOverlayLayer } from './ListingFields';
import { MusicProblem } from './MusicProblem';
import { MusicTrackList } from './MusicTrackList';

const NEW_LISTING = 'new';

interface StepProps {
  snapshot: MusicShareSnapshot;
  session: MusicShareSession;
}

/** A new listing, or the next version of one of the account's music listings: offered only where it has some. */
function ListingChoice({ snapshot, session, layer }: StepProps & { layer: HTMLElement | null }): React.JSX.Element | null {
  const id = useId();
  const listings = snapshot.listings ?? [];
  if (listings.length === 0) return null;
  const options: SelectOption<string>[] = [
    { value: NEW_LISTING, label: t('armariumMusic.newListing') },
    ...listings.map((listing) => ({ value: listing.uid, label: t('armariumMusic.nextVersionOf', { name: listing.name ?? listing.slug, version: nextItemVersion(listing) }) })),
  ];
  return (
    <div className="atlas-share-field">
      <span id={id} className="atlas-share-field__label">{t('armariumMusic.listing')}</span>
      <Select labelledBy={id} layer={layer} value={snapshot.target ?? NEW_LISTING} options={options} onChange={(uid) => session.chooseListing(uid === NEW_LISTING ? null : uid)} />
    </div>
  );
}

/** A one-line text of the music: its name or its artist. */
function MusicField({ label, value, placeholder, field, problems, onChange }: {
  label: string; value: string; placeholder?: string; field: string; problems: Readonly<Record<string, string>>; onChange: (value: string) => void;
}): React.JSX.Element {
  const id = useId();
  return (
    <div className="atlas-share-field">
      <label className="atlas-share-field__label" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="atlas-input"
        value={value}
        placeholder={placeholder}
        maxLength={MAX_MUSIC_TEXT * 2}
        aria-invalid={problems[field] !== undefined || undefined}
        aria-describedby={`${id}-problem`}
        onChange={(event) => onChange(event.target.value)}
      />
      <MusicProblem id={`${id}-problem`} field={field} problems={problems} kind={null} />
    </div>
  );
}

/** The cover its listing shows: the published one, an image uploaded here, or none; square art suits a record's sleeve. */
function MusicCover({ snapshot, session }: StepProps): React.JSX.Element {
  const { cover, listedCover, uploadedCover } = snapshot;
  const listedUrl = useObjectUrl(listedCover ?? undefined);
  const uploadedUrl = useObjectUrl(uploadedCover ?? undefined);
  const value: CoverChoice = cover === null ? { kind: 'none' } : cover === listedCover ? { kind: 'current' } : { kind: 'upload', image: cover };
  return (
    <CoverPicker
      layout="row"
      shape="square"
      hint={t('armariumMusic.coverHint')}
      noneHint={t('armariumMusic.noCoverHint')}
      value={value}
      current={listedCover && listedUrl ? { path: '', url: listedUrl } : undefined}
      candidates={[]}
      upload={uploadedCover && uploadedUrl ? { image: uploadedCover, url: uploadedUrl } : undefined}
      onUpload={(image) => session.uploadCover(image)}
      onChange={(choice) => session.setCover(choice.kind === 'current' ? listedCover : choice.kind === 'upload' ? choice.image : null)}
    />
  );
}

/**
 * Music's own step: a new listing or the next version of one of the account's, the album's or track's name and artist,
 * its cover, the tracks in the order they play, and for a next version what changed.
 */
export function MusicStep({ snapshot, session }: StepProps): React.JSX.Element {
  const [layer, layerRef] = useOverlayLayer();
  const update = snapshot.version !== null && snapshot.version > 1;
  const intro = update ? t('armariumMusic.introUpdate') : t(snapshot.kind === 'music-album' ? 'armariumMusic.introAlbum' : 'armariumMusic.introTrack');
  return (
    <div ref={layerRef} className="atlas-share-form atlas-music-share">
      <p className="atlas-share-text atlas-share-text--muted">{intro}</p>
      <ListingChoice snapshot={snapshot} session={session} layer={layer} />
      <div className="atlas-music-share__identity">
        <div className="atlas-music-share__fields">
          <MusicField
            label={t(snapshot.kind === 'music-album' ? 'armariumMusic.albumName' : 'armariumMusic.trackName')}
            value={snapshot.name}
            field="name"
            problems={snapshot.problems}
            onChange={(name) => session.setName(name)}
          />
          <MusicField label={t('armariumMusic.artist')} value={snapshot.artist} placeholder={t('armariumMusic.optional')} field="artist" problems={snapshot.problems} onChange={(artist) => session.setArtist(artist)} />
        </div>
        <MusicCover snapshot={snapshot} session={session} />
      </div>
      <MusicTrackList snapshot={snapshot} session={session} />
      {update && (
        <CountedText
          label={t('armariumShare.item.notes')}
          hint={t('armariumShare.item.notesHint')}
          value={snapshot.notes}
          onChange={(notes) => session.setNotes(notes)}
          limits={ITEM_NOTES_LIMITS}
          rows={4}
          field="notes"
          problems={snapshot.problems}
        />
      )}
    </div>
  );
}
