import React, { useState } from 'react';
import { ChevronRight, MoreHorizontal } from 'lucide-react';
import { t } from '../../../../../i18n';
import type { SoundKind } from '../../../../../sound/soundTypes';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { isWithin } from '../../../../../soundLibrary/soundPaths';
import { isLinked, type SoundRootState } from '../../../../../soundLibrary/SoundRoots';
import { cn } from '../../../../../../utils/cn';
import { useContextMenu } from '../../../../root/ContextMenuContext';
import { arrowDirection, moveFocus } from '../../screenKeys';
import { dropOnFolder, folderTakes } from './libraryDrop';
import { AmbienceGlyph, FolderGlyph, MusicGlyph } from './libraryGlyphs';
import type { LibraryActions } from './useLibraryActions';

export interface LibraryPlace {
  kind: SoundKind;
  folder: string;
}

interface RailProps {
  library: SoundLibrary;
  actions: LibraryActions;
  place: LibraryPlace;
  onPlace: (place: LibraryPlace) => void;
}

/** What the rail says of where a root lies. */
function whereOf(root: SoundRootState, library: SoundLibrary): string {
  switch (root.status) {
    case 'unlinked': return t('audio.library.notLinked');
    case 'not-linked-here': return t('audio.library.notLinkedHere');
    case 'vault': return root.path === '' ? t('audio.library.vaultRoot') : t('audio.library.inVault', { path: root.path });
    case 'external': {
      const { home } = library;
      if (library.locationOf(root.kind) === null) return t('audio.library.unreachable');
      return home !== null && root.path.startsWith(home) ? `~${root.path.slice(home.length)}` : root.path;
    }
  }
}

function useDropTarget(actions: LibraryActions, kind: SoundKind, folder: string): { isTarget: boolean; props: Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'> } {
  const [isTarget, setTarget] = useState(false);
  return {
    isTarget,
    props: {
      onDragOver: (event) => {
        if (!folderTakes(event)) return;
        event.preventDefault();
        setTarget(true);
      },
      onDragLeave: () => setTarget(false),
      onDrop: (event) => {
        setTarget(false);
        dropOnFolder(actions, event, kind, folder);
      },
    },
  };
}

function RailFolder({ library, actions, kind, path, name, depth, place, onPlace }: RailProps & { kind: SoundKind; path: string; name: string; depth: number }): React.JSX.Element {
  const onPath = place.kind === kind && isWithin(path, place.folder);
  const [open, setOpen] = useState(onPath);
  const folders = library.listing(kind, path)?.folders ?? [];
  const count = library.countOf(kind, path);
  const drop = useDropTarget(actions, kind, path);
  const expanded = (open || onPath) && folders.length > 0;
  const selected = place.kind === kind && place.folder === path;
  return (
    <>
      <div className="atlas-sound-lib__fold-line" style={{ '--atlas-sound-depth': depth } as React.CSSProperties}>
        <button
          type="button"
          className={cn('atlas-sound-lib__fold', selected && 'atlas-sound-lib__fold--selected', drop.isTarget && 'atlas-sound-lib__fold--target')}
          aria-current={selected ? 'true' : undefined}
          onClick={() => {
            setOpen(true);
            onPlace({ kind, folder: path });
          }}
          {...drop.props}
        >
          <FolderGlyph />
          <span>{name}</span>
          {count !== null && <small>{count}</small>}
        </button>
        {folders.length > 0 && (
          <button type="button" tabIndex={-1} className="atlas-sound-lib__twist" aria-expanded={expanded} aria-label={name} onClick={() => setOpen(!expanded)}>
            <ChevronRight aria-hidden="true" />
          </button>
        )}
      </div>
      {expanded && folders.map((sub) => (
        <RailFolder key={sub.path} library={library} actions={actions} kind={kind} path={sub.path} name={sub.name} depth={depth + 1} place={place} onPlace={onPlace} />
      ))}
    </>
  );
}

function RailRoot({ library, actions, kind, place, onPlace }: RailProps & { kind: SoundKind }): React.JSX.Element {
  const root = library.rootOf(kind);
  const menu = useContextMenu();
  const linked = isLinked(root);
  const label = t(kind === 'music' ? 'audio.music' : 'audio.ambience');
  const count = linked ? library.countOf(kind, '') : null;
  const drop = useDropTarget(actions, kind, '');
  const folders = linked ? library.listing(kind, '')?.folders ?? [] : [];

  return (
    <section className="atlas-sound-lib__root-block" aria-label={label}>
      <div className={cn('atlas-sound-lib__root', place.kind === kind && place.folder === '' && 'atlas-sound-lib__root--selected', drop.isTarget && 'atlas-sound-lib__root--target')}>
        <button type="button" className="atlas-sound-lib__root-name" aria-current={place.kind === kind && place.folder === '' ? 'true' : undefined} onClick={() => onPlace({ kind, folder: '' })} {...drop.props}>
          {kind === 'music' ? <MusicGlyph /> : <AmbienceGlyph />}
          <span>{label}</span>
        </button>
        {count !== null && <small>{count}</small>}
        {root.status !== 'unlinked' && (
          <button
            type="button"
            className="atlas-sound-lib__more"
            aria-label={t('audio.library.rootMenu', { name: label })}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              const win = event.currentTarget.ownerDocument.defaultView ?? window;
              menu.open([
                { type: 'item', label: t('audio.library.changeFolder'), icon: 'folder-open', onClick: () => actions.link(kind, win) },
                { type: 'item', label: t('audio.library.unlink'), icon: 'unlink', onClick: () => actions.unlink(kind) },
              ], { x: box.left, y: box.bottom }, { returnFocus: event.currentTarget });
            }}
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="atlas-sound-lib__where">{whereOf(root, library)}</div>
      {!linked && (
        <button type="button" className="atlas-sound-lib__link" onClick={(event) => actions.link(kind, event.currentTarget.ownerDocument.defaultView ?? window)}>{t('audio.library.linkFolder')}</button>
      )}
      {folders.map((folder) => (
        <RailFolder key={folder.path} library={library} actions={actions} kind={kind} path={folder.path} name={folder.name} depth={0} place={place} onPlace={onPlace} />
      ))}
    </section>
  );
}

/** Each root with its count and where it lies, and its folders as a tree that opens in place. */
export function LibraryRail(props: RailProps): React.JSX.Element {
  return (
    <nav
      className="atlas-sound-lib__rail"
      aria-label={t('audio.library.folders')}
      onKeyDown={(event) => {
        const direction = arrowDirection(event.key);
        const from = event.target as Node;
        if (!direction || !from.instanceOf(Element)) return;
        event.preventDefault();
        moveFocus(event.currentTarget, from, direction);
      }}
    >
      <RailRoot {...props} kind="music" />
      <RailRoot {...props} kind="ambience" />
    </nav>
  );
}
