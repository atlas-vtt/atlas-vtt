import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { Plus } from 'lucide-react';
import { t } from '../../../../i18n';
import type { Mood } from '../../../../sound/soundTypes';
import { moodProblems, type MoodProblem } from '../../../../soundDirector/moodReadiness';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { MoodStore } from '../../../../soundLibrary/MoodStore';
import { confirmAction } from '../../../../ui/confirmDialog';
import { useContextMenu, type ContextMenuEntry } from '../../../root/ContextMenuContext';
import { SoundLibrary } from '../../../../soundLibrary/SoundLibrary';
import { SoundRecordStore } from '../../../../soundLibrary/SoundRecordStore';
import { relinkSound, type MissingSound } from './library/relinkSound';
import { useLibraryVersion, useSoundingKey } from './library/useLibrary';
import { useOptionalAtlasStore } from '../../../ViewStoreContext';
import { MoodCard } from './MoodCard';
import { MoodEditPopover } from './MoodEditPopover';
import { moodForPlayers } from './PlayersRow';
import { moodsMatching } from './moodSearch';
import { useMoodDrag } from './useMoodDrag';
import { useMoodScenes } from './useMoodScenes';
import { useSoundValue } from './useSound';
import { holdWord, useSoundHold } from './soundHold';
import { SOUND_KEYS } from './useSoundKeys';

interface MoodGridProps {
  app: App;
  director: SoundDirector;
  moods: readonly Mood[];
  /** The library's search, trimmed: while it holds text, only the moods it finds are shown. */
  search: string;
  moveMood: (mood: Mood, index: number) => void;
  onNewMood: () => void;
}

const NO_PROBLEMS: readonly MoodProblem[] = [];

/** The moods in their fixed places, numbered as the keys that press them. */
export function MoodGrid({ app, director, moods, search, moveMood, onNewMood }: MoodGridProps): React.JSX.Element {
  const store = MoodStore.forApp(app);
  const gridRef = useRef<HTMLDivElement>(null);
  const menu = useContextMenu();
  // A scene's links are the map's: in the page's own tab there is none to link to.
  const hasScene = useOptionalAtlasStore((state) => state.mapPath !== null, false);
  const sceneSound = useOptionalAtlasStore((state) => state.sound, null);
  const scenePath = useOptionalAtlasStore((state) => state.mapPath, null);
  const sceneImages = useMoodScenes(app, { path: scenePath, sound: sceneSound });
  const setSceneSound = useOptionalAtlasStore((state) => state.setSceneSound, null);
  const [editing, setEditing] = useState<{ mood: Mood; tile: HTMLElement } | null>(null);
  const activeId = useSoundValue(director, (snapshot) => snapshot.mix.mood?.id ?? null);
  const shelfRevision = useSoundValue(director, (snapshot) => snapshot.shelfRevision);
  const playersRevision = useSoundValue(director, (snapshot) => snapshot.playersRevision);
  const hold = useSoundHold(director);
  const ambiencePlays = useSoundValue(director, ({ mix }) => mix.table.layers.length > 0);
  // Paused music under ambience that plays on: the tile says which part is held.
  const stateWord = hold === 'paused' && ambiencePlays ? t('audio.musicPaused') : holdWord(hold);
  // The playing tile names what plays now, which a track pressed in the library may have replaced.
  const soundingKey = useSoundingKey(director);
  const soundingName = soundingKey === null ? null : (director.shelf.recordOfKey(soundingKey)?.name ?? null);

  const closeEditor = useCallback((): void => setEditing(null), []);
  const canMove = useCallback((mood: Mood) => !store.isReadOnly(mood.id), [store]);
  // A search shows a part of the moods, where a drop's place would not be the place in the whole order.
  const canDrag = useCallback((mood: Mood) => search === '' && canMove(mood), [canMove, search]);
  const { shown, draggingId, start, consumeClick } = useMoodDrag(gridRef, moods, canDrag, moveMood);

  const press = useCallback((mood: Mood): void => {
    if (!consumeClick()) director.press(mood);
  }, [consumeClick, director]);

  // A file gone from disk changes the library, not the shelf: both are read again for it.
  const libraryVersion = useLibraryVersion(SoundLibrary.forApp(app));
  const problems = useMemo(() => new Map(moods.map((mood) => [mood.id, moodProblems(mood, director.shelf)])), [director, moods, shelfRevision, libraryVersion]);

  const openMenu = useCallback((mood: Mood, anchor: HTMLElement): void => {
    const box = anchor.getBoundingClientRect();
    const at = moods.findIndex((one) => one.id === mood.id);
    const readOnly = store.isReadOnly(mood.id);
    menu.open([
      { type: 'item', label: t('audio.mood.edit'), disabled: readOnly, ...(readOnly && { description: t('audio.mood.readOnly') }), onClick: () => setEditing({ mood, tile: anchor.closest<HTMLElement>('.atlas-sound-mood') ?? anchor }) },
      { type: 'item', label: t('audio.mood.duplicate'), onClick: () => store.createMood({ ...moodMix(mood), name: t('audio.mood.copyName', { name: mood.name }) }) },
      // The order is the keys' 1–9 and 0: earlier and later without a drag, as Alt with the arrows does on a tile.
      { type: 'item', label: t('audio.mood.moveEarlier'), detail: SOUND_KEYS.moodEarlier, disabled: !canMove(mood) || at <= 0, onClick: () => moveMood(mood, at - 1) },
      { type: 'item', label: t('audio.mood.moveLater'), detail: SOUND_KEYS.moodLater, disabled: !canMove(mood) || at < 0 || at >= moods.length - 1, onClick: () => moveMood(mood, at + 1) },
      { type: 'item', label: t('audio.mood.linkScene'), checked: sceneSound?.mood === mood.id, disabled: !hasScene, onClick: () => setSceneSound?.(withLink(sceneSound, 'mood', mood.id)) },
      { type: 'item', label: t('audio.mood.linkCombat'), checked: sceneSound?.combatMood === mood.id, disabled: !hasScene, onClick: () => setSceneSound?.(withLink(sceneSound, 'combatMood', mood.id)) },
      ...relinkEntries(problems.get(mood.id) ?? NO_PROBLEMS, (record) => relinkSound(app, SoundLibrary.forApp(app), SoundRecordStore.forApp(app), record)),
      { type: 'item', label: t('audio.mood.delete'), destructive: true, disabled: readOnly, onClick: () => void confirmDelete(store, mood) },
    ], { x: box.left, y: box.bottom }, { returnFocus: anchor, label: t('audio.moodMenu', { name: mood.name }) });
  }, [app, canMove, hasScene, menu, moods, moveMood, problems, sceneSound, setSceneSound, store]);

  // Copies a mood names are made before anyone presses it.
  useEffect(() => {
    director.shelf.request(moods.flatMap((mood) => director.shelf.recordsOf(mood)));
  }, [director, moods, shelfRevision]);

  const forPlayers = useMemo(() => new Map(moods.map((mood) => [mood.id, moodForPlayers(mood, director)])), [director, moods, shelfRevision, playersRevision]);
  const musicNames = useMemo(() => new Map(moods.map((mood) => [mood.id, firstTrackName(mood, director)])), [director, moods, shelfRevision]);
  const activeAt = shown.findIndex((mood) => mood.id === activeId);
  const nextId = shown.length > 1 ? shown[(activeAt + 1) % shown.length]?.id : undefined;
  // Each tile keeps its number in the whole order, which is the key that presses it.
  const found = useMemo(() => (search === '' ? null : new Set(moodsMatching(moods, search, director).map((mood) => mood.id))), [director, moods, search, shelfRevision]);
  const tiles = shown.map((mood, index) => ({ mood, number: index + 1 })).filter(({ mood }) => found === null || found.has(mood.id));

  return (
    <>
    {/* A heading for the region, with what adds to it: no half tile peeking under the fold. */}
    <div className="atlas-sound-moods__head">
      <h2 className="atlas-sound-section">{t('audio.mood.title')}</h2>
      <button type="button" className="atlas-sound-button atlas-sound-button--quiet" onClick={onNewMood}>
        <Plus aria-hidden="true" />
        {t('audio.mood.new')}
      </button>
    </div>
    {tiles.length === 0 && <p className="atlas-sound-moods__none">{t('audio.mood.noneFound')}</p>}
    <div className="atlas-sound-moods__grid" ref={gridRef}>
      {tiles.map(({ mood, number }) => (
        <MoodCard
          key={mood.id}
          mood={mood}
          number={number}
          playing={mood.id === activeId}
          stateWord={stateWord}
          still={hold !== null}
          musicName={(mood.id === activeId ? soundingName : null) ?? musicNames.get(mood.id) ?? null}
          next={mood.id === nextId}
          dragging={mood.id === draggingId}
          problems={problems.get(mood.id) ?? NO_PROBLEMS}
          linked={sceneSound?.mood === mood.id}
          linkedInFight={sceneSound?.combatMood === mood.id}
          sceneImage={sceneImages.get(mood.id) ?? null}
          players={forPlayers.get(mood.id) ?? null}
          onPress={press}
          onMenu={openMenu}
          onDragStart={start}
        />
      ))}
      {editing && <MoodEditPopover mood={editing.mood} anchor={editing.tile} onClose={closeEditor} onSave={(changed) => {
        store.saveMood(changed);
        // The mood that plays takes its new space at once, as pressing it again would.
        if (changed.id === activeId && changed.room) director.desk.setRoom(changed.room);
      }} />}
    </div>
    </>
  );
}

const moodMix = ({ id: _id, order: _order, ...mix }: Mood): Omit<Mood, 'id' | 'order'> => mix;

/** A Relink for each track of the mood whose file is not found, where the mood's own menu is. */
function relinkEntries(problems: readonly MoodProblem[], relink: (sound: MissingSound) => void): ContextMenuEntry[] {
  return problems.flatMap((problem): ContextMenuEntry[] => (problem.kind === 'missing'
    ? [{ type: 'item', label: t('audio.mood.relink', { name: problem.name }), icon: 'file-search', onClick: () => relink(problem.record) }]
    : []));
}

function firstTrackName(mood: Mood, director: SoundDirector): string | null {
  const first = typeof mood.music === 'object' ? mood.music.tracks[0] : undefined;
  return first === undefined ? null : (director.shelf.recordOf(first)?.name ?? null);
}

function withLink(sound: { mood?: string; combatMood?: string } | null, key: 'mood' | 'combatMood', id: string): { mood?: string; combatMood?: string } | null {
  const { [key]: current, ...rest } = sound ?? {};
  return current === id ? rest : { ...rest, [key]: id };
}

async function confirmDelete(store: MoodStore, mood: Mood): Promise<void> {
  const sure = await confirmAction({
    title: t('audio.mood.deleteTitle', { name: mood.name }),
    message: [t('audio.mood.deleteMessage')],
    confirmLabel: t('audio.mood.delete'),
    destructive: true,
  });
  if (sure) store.removeMood(mood.id);
}
