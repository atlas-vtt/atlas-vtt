import React from 'react';
import { MoreHorizontal } from 'lucide-react';
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

interface LibraryHeadProps {
  library: SoundLibrary;
  actions: LibraryActions;
  kind: SoundKind;
  /** The tags selected, as shown. */
  tags: readonly string[];
  /** What the tags leave of the root: what Play takes. */
  rows: readonly LibraryRow[];
  onClearTags: () => void;
  query: string;
  onQuery: (query: string) => void;
  /** The shuffle the music is on: a list played here goes on as it was. */
  shuffle: boolean;
}

/** Which root and tags are shown, the search, and what can be done to them. */
export function LibraryHead({ library, actions, kind, tags, rows, onClearTags, query, onQuery, shuffle }: LibraryHeadProps): React.JSX.Element {
  const linked = isLinked(library.rootOf(kind));
  const label = t(kind === 'music' ? 'audio.music' : 'audio.ambience');
  const menu = useContextMenu();
  const canImport = library.rootOf(kind).status !== 'not-linked-here';
  const openFolded = (anchor: HTMLElement): void => {
    const box = anchor.getBoundingClientRect();
    menu.open([
      { type: 'item', label: t('audio.library.import'), disabled: !canImport, onClick: () => actions.pickImport(anchor.ownerDocument, kind) },
    ], { x: box.left, y: box.bottom }, { returnFocus: anchor });
  };
  return (
    <header className="atlas-sound-lib__head">
      <nav className="atlas-sound-lib__crumb" aria-label={label}>
        <button type="button" aria-current={tags.length === 0 ? 'true' : undefined} onClick={onClearTags}>{label}</button>
        {tags.length > 0 && (
          <>
            <i aria-hidden="true">/</i>
            <span aria-current="true">{tags.join(' · ')}</span>
          </>
        )}
      </nav>
      <label className="atlas-sound-lib__search">
        <SearchGlyph />
        <input
          type="search"
          placeholder={t('audio.library.search')}
          aria-label={t('audio.library.search')}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && query !== '') {
              event.stopPropagation();
              onQuery('');
            }
          }}
        />
      </label>
      <Button type="button" className="atlas-sound-lib__btn atlas-sound-lib__btn--folds" variant="secondary" disabled={!canImport} onClick={(event) => actions.pickImport(event.currentTarget.ownerDocument, kind)}>{t('audio.library.import')}</Button>
      <LabelTooltip label={t('audio.library.rootMenu', { name: label })}>
        <button type="button" className="atlas-sound-lib__more atlas-sound-lib__head-more" aria-label={t('audio.library.rootMenu', { name: label })} onClick={(event) => openFolded(event.currentTarget)}>
          <MoreHorizontal aria-hidden="true" />
        </button>
      </LabelTooltip>
      {kind === 'music' && linked && (
        <Button type="button" className="atlas-sound-lib__btn atlas-sound-lib__btn--solid" variant="secondary" onClick={() => actions.playList(filesOfRows(rows), shuffle)}>{t(tags.length > 0 ? 'audio.library.playThese' : 'audio.library.playAll')}</Button>
      )}
    </header>
  );
}
