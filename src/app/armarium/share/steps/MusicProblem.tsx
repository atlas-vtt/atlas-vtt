import React from 'react';
import { t } from '../../../i18n';
import type { MusicKind } from '../../../services/itemBundle/itemBundleFormat';
import { MAX_MUSIC_TEXT } from '../../../services/musicBundle/musicBundleFormat';

/** What a problem of the music step says; `kind` tells an album's track count from a single's. */
export function musicProblemText(problem: string, kind: MusicKind | null): string {
  switch (problem) {
    case 'missing': return t('armariumMusic.problem.missing');
    case 'too-long': return t('armariumMusic.problem.too-long', { count: MAX_MUSIC_TEXT });
    case 'one-line': return t('armariumMusic.problem.one-line');
    case 'preparing': return t('armariumMusic.problem.preparing');
    case 'too-few': return t(kind === 'music-track' ? 'armariumMusic.problem.too-few.music-track' : 'armariumMusic.problem.too-few.music-album');
    case 'too-short': return t('armariumMusic.problem.too-short');
    case 'track-too-long': return t('armariumMusic.problem.track-too-long');
    case 'album-too-long': return t('armariumMusic.problem.album-too-long');
    default: return t('armariumListing.problem.notRight');
  }
}

/** What is wrong with a field of the music step, under it and read with it. */
export function MusicProblem({ id, field, problems, kind }: { id: string; field: string; problems: Readonly<Record<string, string>>; kind: MusicKind | null }): React.JSX.Element | null {
  const problem = problems[field];
  if (problem === undefined) return null;
  return <p id={id} className="atlas-share-field__problem" role="alert">{musicProblemText(problem, kind)}</p>;
}
