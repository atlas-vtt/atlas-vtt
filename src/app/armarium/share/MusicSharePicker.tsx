import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { Check, ChevronRight, Music, Tag } from 'lucide-react';
import { t } from '../../i18n';
import { Button } from '../../packages/components/primitives/button';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { Skeleton, SkeletonGroup } from '../../packages/components/primitives/Skeleton';
import { useDialogEscape } from '../../packages/components/primitives/useDialogEscape';
import { useFocusTrap } from '../../packages/components/primitives/useFocusTrap';
import type { MusicKind } from '../../services/itemBundle/itemBundleFormat';
import type { LibraryFile } from '../../soundLibrary/SoundLibrary';
import { SoundLibrary } from '../../soundLibrary/SoundLibrary';
import { SoundRecordStore } from '../../soundLibrary/SoundRecordStore';
import { describeError } from '../../utils/errors';
import { musicChoices, tracksMatching, type MusicChoices } from './musicChoices';
import { ShareNotice } from './steps/ShareNotice';

/** Tracks a list shows at once: typing narrows it. */
const SHOWN_TRACKS = 200;

type Reading = { status: 'reading' } | { status: 'read'; choices: MusicChoices | null } | { status: 'failed'; error: string };

function useMusicChoices(app: App): Reading {
  const [reading, setReading] = useState<Reading>({ status: 'reading' });
  useEffect(() => {
    let live = true;
    musicChoices(SoundLibrary.forApp(app), SoundRecordStore.forApp(app)).then(
      (choices) => { if (live) setReading({ status: 'read', choices }); },
      (error: unknown) => { if (live) setReading({ status: 'failed', error: describeError(error) }); },
    );
    return () => { live = false; };
  }, [app]);
  return reading;
}

interface MusicSharePickerProps {
  app: App;
  kind: MusicKind;
  /** The files chosen, in order, and what the album or track is called to begin with. */
  onPick: (files: LibraryFile[], name: string) => void;
  onClose: () => void;
}

/**
 * The Sound library's music to choose what to share, for the Armarium's Share in Atlas: an album is one of the music
 * root's tags, or the tracks ticked in a search, where one ticked track is shared as a track (`pickedKind`); a track is
 * one found by its name or tags.
 */
export function MusicSharePicker({ app, kind, onPick, onClose }: MusicSharePickerProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const albumsId = useId();
  const reading = useMusicChoices(app);
  const [query, setQuery] = useState('');
  const [ticked, setTicked] = useState<readonly string[]>([]);
  useDialogEscape(dialogRef, onClose);
  useFocusTrap(dialogRef);
  const choices = reading.status === 'read' ? reading.choices : null;
  const found = useMemo(() => (choices ? tracksMatching(choices.tracks, query).slice(0, SHOWN_TRACKS) : []), [choices, query]);
  const album = kind === 'music-album';
  const showAlbums = album && query.trim() === '' && (choices?.albums.length ?? 0) > 0;
  const tickedFiles = (choices?.tracks ?? []).filter((track) => ticked.includes(track.file.path)).map((track) => track.file);
  const toggle = (path: string): void => setTicked((held) => (held.includes(path) ? held.filter((each) => each !== path) : [...held, path]));

  const body = ((): React.ReactNode => {
    if (reading.status === 'reading') {
      return (
        <SkeletonGroup className="atlas-item-pick__list" label={t('armariumMusic.pick.loading')}>
          <Skeleton shape="block" className="atlas-item-pick__placeholder" />
          <Skeleton shape="block" className="atlas-item-pick__placeholder" />
          <Skeleton shape="block" className="atlas-item-pick__placeholder" />
        </SkeletonGroup>
      );
    }
    if (reading.status === 'failed') return <ShareNotice tone="error">{t('armariumShare.pick.failed', { error: reading.error })}</ShareNotice>;
    if (choices === null) return <p className="atlas-transfer-text">{t('armariumMusic.pick.notLinked')}</p>;
    if (choices.tracks.length === 0) return <p className="atlas-transfer-text">{t('armariumMusic.pick.empty')}</p>;
    if (showAlbums) {
      return (
        <section className="atlas-music-pick__section" aria-labelledby={albumsId}>
          <span id={albumsId} className="atlas-transfer-section__title">{t('armariumMusic.pick.albums')}</span>
          <ul className="atlas-item-pick__list">
            {choices.albums.map((each) => (
              <li key={each.key}>
                <button type="button" className="atlas-item-pick__item" onClick={() => onPick(each.files, each.name)}>
                  <span className="atlas-item-pick__icon"><Tag aria-hidden /></span>
                  <span className="atlas-item-pick__name">{each.name}</span>
                  <span className="atlas-music-pick__count">{t('armariumMusic.trackCount', { count: each.files.length })}</span>
                  <ChevronRight className="atlas-item-pick__go" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <span className="atlas-transfer-hint">{t('armariumMusic.pick.albumsHint')}</span>
        </section>
      );
    }
    if (found.length === 0) return <p className="atlas-transfer-text atlas-transfer-text--muted">{t('armariumMusic.pick.noMatch')}</p>;
    return (
      <ul className="atlas-item-pick__list" aria-label={t(`armariumMusic.pick.title.${kind}`)}>
        {found.map((track) => {
          const on = ticked.includes(track.file.path);
          return (
            <li key={track.file.path}>
              <button
                type="button"
                className="atlas-item-pick__item"
                {...(album ? { 'aria-pressed': on } : {})}
                onClick={() => (album ? toggle(track.file.path) : onPick([track.file], track.name))}
              >
                <span className="atlas-item-pick__icon">{album && on ? <Check aria-hidden /> : <Music aria-hidden />}</span>
                <span className="atlas-music-pick__names">
                  <span className="atlas-item-pick__name">{track.name}</span>
                  {track.where !== '' && <span className="atlas-music-pick__where">{track.where}</span>}
                </span>
                {!album && <ChevronRight className="atlas-item-pick__go" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
    );
  })();

  return (
    <div className="atlas-transfer-overlay" onClick={onClose}>
      <div ref={dialogRef} className="atlas-modal atlas-item-pick atlas-music-pick" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <div className="atlas-modal-header">
          <h3 id={titleId}>{t(`armariumMusic.pick.title.${kind}`)}</h3>
          <CloseButton onClick={onClose} />
        </div>
        <div className="atlas-modal-body atlas-music-pick__body">
          {choices !== null && choices.tracks.length > 0 && (
            <input
              type="search"
              className="atlas-input atlas-music-pick__search"
              placeholder={t('armariumMusic.pick.search')}
              aria-label={t('armariumMusic.pick.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          )}
          {body}
        </div>
        <div className="atlas-modal-footer">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          {album && ticked.length > 0 && (
            <Button variant="default" size="sm" disabled={tickedFiles.length === 0} onClick={() => onPick(tickedFiles, '')}>
              {t('armariumMusic.pick.shareSelected', { count: tickedFiles.length })}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
