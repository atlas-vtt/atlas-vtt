import React from 'react';
import { MoreHorizontal, X } from 'lucide-react';
import { t } from '../../../../../i18n';
import { Button } from '../../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../../packages/components/primitives/tooltip';
import type { SoundKind } from '../../../../../sound/soundTypes';
import { isLinked } from '../../../../../soundLibrary/SoundRoots';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { useContextMenu } from '../../../../root/ContextMenuContext';
import { SearchGlyph } from './libraryGlyphs';
import { filesOfRows, type LibraryRow } from './rowModel';
import type { LibraryActions } from './useLibraryActions';
import { SOUND_KEYS } from '../useSoundKeys';

/** Play says what it plays: the whole root, what the tags leave, or the search's music. */
const PLAY_WORDS = { all: 'audio.library.playAll', tagged: 'audio.library.playTagged', results: 'audio.library.playResults' } as const;

interface LibraryHeadProps {
  library: SoundLibrary;
  actions: LibraryActions;
  kind: SoundKind;
  /** What the list shows: what Play takes, its music. */
  rows: readonly LibraryRow[];
  /** What narrows the list, which Play's words name. */
  scope: 'all' | 'tagged' | 'results';
  query: string;
  onQuery: (query: string) => void;
  /** The shuffle the music is on: a list played here goes on as it was. */
  shuffle: boolean;
  /** The search's first result (a mood where one matches), which Enter in the field starts; null while there is none. */
  first: { name: string; play: () => void } | null;
}

/** The search, and what can be done to the root and tags shown. The rail beside it already names them, so the head does not. */
export function LibraryHead({ library, actions, kind, rows, scope, query, onQuery, shuffle, first }: LibraryHeadProps): React.JSX.Element {
  const linked = isLinked(library.rootOf(kind));
  const music = filesOfRows(rows).filter((file) => file.kind === 'music');
  const label = t(kind === 'music' ? 'audio.music' : 'audio.ambience');
  const menu = useContextMenu();
  const canImport = library.rootOf(kind).status !== 'not-linked-here';
  const openFolded = (anchor: HTMLElement): void => {
    const box = anchor.getBoundingClientRect();
    menu.open([
      { type: 'item', label: t('audio.library.import'), disabled: !canImport, onClick: () => actions.pickImport(anchor.ownerDocument, kind) },
    ], { x: box.left, y: box.bottom }, { returnFocus: anchor, label: t('audio.library.rootMenu', { name: label }) });
  };
  return (
    <header className="atlas-sound-lib__head">
      <label className="atlas-sound-lib__search">
        <SearchGlyph />
        <input
          type="search"
          placeholder={t('audio.library.searchShort')}
          aria-label={t('audio.library.search')}
          value={query}
          aria-keyshortcuts={first ? 'Enter ArrowDown' : undefined}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query !== '') {
              event.stopPropagation();
              onQuery('');
            } else if (event.key === 'Enter' && first) {
              // Typed, then played, without the pointer: Tab would leave the DM screen.
              event.preventDefault();
              event.stopPropagation();
              first.play();
            } else if (event.key === 'ArrowDown' && rows.length > 0) {
              event.preventDefault();
              event.currentTarget.closest('.atlas-sound-lib__main')?.querySelector<HTMLElement>('[role="grid"]')?.focus();
            }
          }}
        />
        {first
          ? (
            <LabelTooltip label={t('audio.library.playFirst', { name: first.name })}>
              <span className="atlas-sound-cap atlas-sound-lib__enter">{SOUND_KEYS.playFirst}</span>
            </LabelTooltip>
          )
          : <span className="atlas-sound-cap atlas-sound-lib__slash" aria-hidden="true">{SOUND_KEYS.search}</span>}
        {query !== '' && (
          <LabelTooltip label={t('audio.library.clearSearch')}>
            <button type="button" className="atlas-sound-lib__clear" onClick={(event) => { onQuery(''); event.currentTarget.closest('label')?.querySelector('input')?.focus(); }}>
              <X aria-hidden="true" />
            </button>
          </LabelTooltip>
        )}
      </label>
      <Button type="button" className="atlas-sound-lib__btn atlas-sound-lib__btn--folds" variant="secondary" disabled={!canImport} onClick={(event) => actions.pickImport(event.currentTarget.ownerDocument, kind)}>{t('audio.library.import')}</Button>
      <LabelTooltip label={t('audio.library.rootMenu', { name: label })}>
        <button type="button" className="atlas-sound-lib__more atlas-sound-lib__head-more" aria-label={t('audio.library.rootMenu', { name: label })} onClick={(event) => openFolded(event.currentTarget)}>
          <MoreHorizontal aria-hidden="true" />
        </button>
      </LabelTooltip>
      {music.length > 0 && (scope === 'results' || (kind === 'music' && linked)) && (
        <Button type="button" className="atlas-sound-lib__btn" variant="secondary" onClick={() => actions.playList(music, shuffle)}>{t(PLAY_WORDS[scope])}</Button>
      )}
    </header>
  );
}
