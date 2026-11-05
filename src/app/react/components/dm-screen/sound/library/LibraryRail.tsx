import React, { memo, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { t } from '../../../../../i18n';
import type { SoundKind } from '../../../../../sound/soundTypes';
import { carriesSounds, readSoundDrag } from '../../../../../soundLibrary/soundDrag';
import { mayCarryAudio } from '../../../../../soundLibrary/soundFiles';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { isLinked, type SoundRootState } from '../../../../../soundLibrary/SoundRoots';
import { cn } from '../../../../../../utils/cn';
import { StarterPackButton } from './StarterPack';
import { useContextMenu } from '../../../../root/ContextMenuContext';
import { AmbienceGlyph, MusicGlyph, TagGlyph } from './libraryGlyphs';
import type { RootShelf } from './rowModel';
import { tagRowMenu } from './tagMenus';
import type { LibraryActions } from './useLibraryActions';

interface RailProps {
  library: SoundLibrary;
  actions: LibraryActions;
  shelves: Readonly<Record<SoundKind, RootShelf>>;
  /** The root shown; none while a search spans every root. */
  kind: SoundKind | null;
  /** The keys of the tags selected in it. */
  selected: ReadonlySet<string>;
  onRoot: (kind: SoundKind) => void;
  onTag: (kind: SoundKind, tag: string) => void;
}

/** What the rail says of where a root lies. */
/** What stands in the way of a root on this device; where it lies is the root menu's Change folder alone (owner, 2026-11-03). */
function problemOf(root: SoundRootState, library: SoundLibrary): string | null {
  if (root.status === 'not-linked-here') return t('audio.library.notLinkedHere');
  if (root.status === 'external' && library.locationOf(root.kind) === null) return t('audio.library.unreachable');
  return null;
}

function useDropTarget(takes: (transfer: DataTransfer) => boolean, take: (transfer: DataTransfer) => void): { isTarget: boolean; props: Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDragLeave' | 'onDrop'> } {
  const [isTarget, setTarget] = useState(false);
  return {
    isTarget,
    props: {
      onDragOver: (event) => {
        if (!takes(event.dataTransfer)) return;
        event.preventDefault();
        setTarget(true);
      },
      onDragLeave: () => setTarget(false),
      onDrop: (event) => {
        setTarget(false);
        if (!takes(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        take(event.dataTransfer);
      },
    },
  };
}

interface RailTagProps {
  actions: LibraryActions;
  kind: SoundKind;
  name: string;
  count: number;
  selected: boolean;
  onTag: (kind: SoundKind, tag: string) => void;
}

/** A tag of a root: a press narrows the list to it, rows dropped on it get it. */
const RailTag = memo(function RailTag({ actions, kind, name, count, selected, onTag }: RailTagProps): React.JSX.Element {
  const menu = useContextMenu();
  const drop = useDropTarget(carriesSounds, (transfer) => {
    const drag = readSoundDrag(transfer);
    if (drag) actions.tag(drag.files, name);
  });
  const openMenu = (at: { x: number; y: number }, returnFocus: HTMLElement | null): void => {
    menu.open(tagRowMenu(actions, name), at, { returnFocus, label: t('audio.library.tagMenu', { name }) });
  };
  return (
    <div
      className="atlas-sound-lib__tag-line"
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu({ x: event.clientX, y: event.clientY }, event.currentTarget.querySelector('button'));
      }}
    >
      <button
        type="button"
        className={cn('atlas-sound-lib__tag', selected && 'atlas-sound-lib__tag--selected', drop.isTarget && 'atlas-sound-lib__tag--target')}
        aria-pressed={selected}
        onClick={() => onTag(kind, name)}
        onKeyDown={(event) => {
          if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          openMenu({ x: box.left + 40, y: box.bottom }, event.currentTarget);
        }}
        {...drop.props}
      >
        <TagGlyph />
        <span>{name}</span>
        <small>{count}</small>
      </button>
      <button
        type="button"
        tabIndex={-1}
        data-focus-skip
        className="atlas-sound-lib__more"
        aria-label={t('audio.library.tagMenu', { name })}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          openMenu({ x: box.left, y: box.bottom }, event.currentTarget);
        }}
      >
        <MoreHorizontal aria-hidden="true" />
      </button>
    </div>
  );
});

function RailRoot({ library, actions, shelves, kind, selected, shown, onRoot, onTag }: Omit<RailProps, 'kind'> & { kind: SoundKind; shown: boolean }): React.JSX.Element {
  const root = library.rootOf(kind);
  const menu = useContextMenu();
  const linked = isLinked(root);
  const label = t(kind === 'music' ? 'audio.music' : 'audio.ambience');
  const count = linked ? library.countOf(kind, '') : null;
  const drop = useDropTarget(mayCarryAudio, (transfer) => {
    if (transfer.files.length > 0) actions.importInto([...transfer.files], kind);
  });
  const whole = shown && selected.size === 0;
  const problem = problemOf(root, library);

  return (
    <section className="atlas-sound-lib__root-block" aria-label={label}>
      <div className={cn('atlas-sound-lib__root', whole && 'atlas-sound-lib__root--selected', drop.isTarget && 'atlas-sound-lib__root--target')}>
        <button type="button" className="atlas-sound-lib__root-name" aria-current={whole ? 'true' : undefined} onClick={() => onRoot(kind)} {...drop.props}>
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
                { type: 'item', label: t('audio.library.prepareAll'), icon: 'hard-drive-download', disabled: library.locationOf(kind) === null, onClick: () => actions.prepare(kind) },
                { type: 'item', label: t('audio.library.changeFolder'), icon: 'folder-open', onClick: () => actions.link(kind, win) },
                { type: 'item', label: t('audio.library.unlink'), icon: 'unlink', onClick: () => actions.unlink(kind) },
              ], { x: box.left, y: box.bottom }, { returnFocus: event.currentTarget, label: t('audio.library.rootMenu', { name: label }) });
            }}
          >
            <MoreHorizontal aria-hidden="true" />
          </button>
        )}
      </div>
      {problem !== null && <div className="atlas-sound-lib__where">{problem}</div>}
      {!linked && (
        <button type="button" className="atlas-sound-lib__link" onClick={(event) => actions.link(kind, event.currentTarget.ownerDocument.defaultView ?? window)}>{t('audio.library.linkFolder')}</button>
      )}
      {shelves[kind].tags.map((tag) => (
        <RailTag key={tag.key} actions={actions} kind={kind} name={tag.name} count={tag.count} selected={shown && selected.has(tag.key)} onTag={onTag} />
      ))}
      {kind === 'ambience' && <StarterPackButton library={library} actions={actions} className="atlas-sound-lib__link" />}
    </section>
  );
}

/** Each root with its count and where it lies, and the tags of its tracks. */
export function LibraryRail({ kind, ...props }: RailProps): React.JSX.Element {
  return (
    <nav className="atlas-sound-lib__rail" aria-label={t('audio.library.rail')}>
      <RailRoot {...props} kind="music" shown={kind === 'music'} />
      <RailRoot {...props} kind="ambience" shown={kind === 'ambience'} />
    </nav>
  );
}
