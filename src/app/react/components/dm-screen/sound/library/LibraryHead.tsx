import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { t } from '../../../../../i18n';
import { Button } from '../../../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../../../packages/components/primitives/tooltip';
import { isLinked } from '../../../../../soundLibrary/SoundRoots';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { useContextMenu } from '../../../../root/ContextMenuContext';
import { SearchGlyph } from './libraryGlyphs';
import { crumbsOf } from './rowModel';
import type { LibraryPlace } from '../../../../../soundLibrary/libraryPlace';
import type { LibraryActions } from './useLibraryActions';

interface LibraryHeadProps {
  library: SoundLibrary;
  actions: LibraryActions;
  place: LibraryPlace;
  onPlace: (place: LibraryPlace) => void;
  query: string;
  onQuery: (query: string) => void;
  /** The shuffle the music is on: a folder played here goes on as it was. */
  shuffle: boolean;
}

/** Where the GM is, the search, and what can be done to this folder. */
export function LibraryHead({ library, actions, place, onPlace, query, onQuery, shuffle }: LibraryHeadProps): React.JSX.Element {
  const { kind, folder } = place;
  const linked = isLinked(library.rootOf(kind));
  const label = t(kind === 'music' ? 'audio.music' : 'audio.ambience');
  const menu = useContextMenu();
  const canImport = library.rootOf(kind).status !== 'not-linked-here';
  const openFolded = (anchor: HTMLElement): void => {
    const box = anchor.getBoundingClientRect();
    menu.open([
      { type: 'item', label: t('audio.library.newFolder'), disabled: !linked, onClick: () => actions.askNewFolder(kind, folder) },
      { type: 'item', label: t('audio.library.import'), disabled: !canImport, onClick: () => actions.pickImport(anchor.ownerDocument, kind, folder) },
    ], { x: box.left, y: box.bottom }, { returnFocus: anchor });
  };
  return (
    <header className="atlas-sound-lib__head">
      <nav className="atlas-sound-lib__crumb" aria-label={label}>
        <button type="button" aria-current={folder === '' ? 'true' : undefined} onClick={() => onPlace({ kind, folder: '' })}>{label}</button>
        {crumbsOf(folder).map((crumb) => (
          <React.Fragment key={crumb.path}>
            <i aria-hidden="true">/</i>
            <button type="button" aria-current={crumb.path === folder ? 'true' : undefined} onClick={() => onPlace({ kind, folder: crumb.path })}>{crumb.name}</button>
          </React.Fragment>
        ))}
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
      <Button type="button" className="atlas-sound-lib__btn atlas-sound-lib__btn--folds" variant="secondary" disabled={!linked} onClick={() => actions.askNewFolder(kind, folder)}>{t('audio.library.newFolder')}</Button>
      <Button type="button" className="atlas-sound-lib__btn atlas-sound-lib__btn--folds" variant="secondary" disabled={!canImport} onClick={(event) => actions.pickImport(event.currentTarget.ownerDocument, kind, folder)}>{t('audio.library.import')}</Button>
      <LabelTooltip label={t('audio.library.rootMenu', { name: label })}>
        <button type="button" className="atlas-sound-lib__more atlas-sound-lib__head-more" aria-label={t('audio.library.rootMenu', { name: label })} onClick={(event) => openFolded(event.currentTarget)}>
          <MoreHorizontal aria-hidden="true" />
        </button>
      </LabelTooltip>
      {kind === 'music' && linked && (
        <Button type="button" className="atlas-sound-lib__btn atlas-sound-lib__btn--solid" variant="secondary" onClick={() => actions.playFolder(kind, folder, shuffle)}>{t('audio.library.playFolder')}</Button>
      )}
    </header>
  );
}
