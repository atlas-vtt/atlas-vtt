import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { Plus } from 'lucide-react';
import { t } from '../../../../i18n';
import type { Mood } from '../../../../sound/soundTypes';
import { moodProblems, type MoodProblem } from '../../../../soundDirector/moodReadiness';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { MoodStore } from '../../../../soundLibrary/MoodStore';
import { confirmAction } from '../../../../ui/confirmDialog';
import { useContextMenu } from '../../../root/ContextMenuContext';
import { useOptionalAtlasStore } from '../../../ViewStoreContext';
import { MoodCard } from './MoodCard';
import { MoodEditPopover } from './MoodEditPopover';
import { moodForPlayers } from './PlayersRow';
import { useMoodDrag } from './useMoodDrag';
import { useMoodScenes } from './useMoodScenes';
import { useSoundValue } from './useSound';

interface MoodGridProps {
  app: App;
  director: SoundDirector;
  moods: readonly Mood[];
  moveMood: (mood: Mood, index: number) => void;
  onNewMood: () => void;
}

const NO_PROBLEMS: readonly MoodProblem[] = [];

/** The moods in their fixed places, numbered as the keys that press them. */
export function MoodGrid({ app, director, moods, moveMood, onNewMood }: MoodGridProps): React.JSX.Element {
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
  const silenced = useSoundValue(director, ({ mix }) => mix.table.silenced);

  const closeEditor = useCallback((): void => setEditing(null), []);
  const canMove = useCallback((mood: Mood) => !store.isReadOnly(mood.id), [store]);
  const { shown, draggingId, start, consumeClick } = useMoodDrag(gridRef, moods, canMove, moveMood);

  const press = useCallback((mood: Mood): void => {
    if (!consumeClick()) director.press(mood);
  }, [consumeClick, director]);

  const openMenu = useCallback((mood: Mood, anchor: HTMLElement): void => {
    const box = anchor.getBoundingClientRect();
    const readOnly = store.isReadOnly(mood.id);
    menu.open([
      { type: 'item', label: t('audio.mood.edit'), disabled: readOnly, ...(readOnly && { description: t('audio.mood.readOnly') }), onClick: () => setEditing({ mood, tile: anchor.closest<HTMLElement>('.atlas-sound-mood') ?? anchor }) },
      { type: 'item', label: t('audio.mood.duplicate'), onClick: () => store.createMood({ ...moodMix(mood), name: t('audio.mood.copyName', { name: mood.name }) }) },
      { type: 'item', label: t('audio.mood.linkScene'), checked: sceneSound?.mood === mood.id, disabled: !hasScene, onClick: () => setSceneSound?.(withLink(sceneSound, 'mood', mood.id)) },
      { type: 'item', label: t('audio.mood.linkCombat'), checked: sceneSound?.combatMood === mood.id, disabled: !hasScene, onClick: () => setSceneSound?.(withLink(sceneSound, 'combatMood', mood.id)) },
      { type: 'item', label: t('audio.mood.delete'), destructive: true, disabled: readOnly, onClick: () => void confirmDelete(store, mood) },
    ], { x: box.left, y: box.bottom }, { returnFocus: anchor });
  }, [hasScene, menu, sceneSound, setSceneSound, store]);

  // Copies a mood names are made before anyone presses it.
  useEffect(() => {
    director.shelf.request(moods.flatMap((mood) => director.shelf.recordsOf(mood)));
  }, [director, moods, shelfRevision]);

  const problems = useMemo(() => new Map(moods.map((mood) => [mood.id, moodProblems(mood, director.shelf)])), [director, moods, shelfRevision]);
  const forPlayers = useMemo(() => new Map(moods.map((mood) => [mood.id, moodForPlayers(mood, director)])), [director, moods, shelfRevision, playersRevision]);
  const musicNames = useMemo(() => new Map(moods.map((mood) => [mood.id, firstTrackName(mood, director)])), [director, moods, shelfRevision]);
  const activeAt = shown.findIndex((mood) => mood.id === activeId);
  const nextId = shown.length > 1 ? shown[(activeAt + 1) % shown.length]?.id : undefined;

  return (
    <div className="atlas-sound-moods__grid" ref={gridRef}>
      {shown.map((mood, index) => (
        <MoodCard
          key={mood.id}
          mood={mood}
          number={index + 1}
          playing={mood.id === activeId}
          silenced={silenced}
          musicName={musicNames.get(mood.id) ?? null}
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
      <button type="button" className="atlas-sound-ghost" onClick={onNewMood}>
        <Plus aria-hidden="true" />
        {t('audio.mood.new')}
      </button>
      {editing && <MoodEditPopover mood={editing.mood} anchor={editing.tile} onClose={closeEditor} onSave={(changed) => store.saveMood(changed)} />}
    </div>
  );
}

const moodMix = ({ id: _id, order: _order, ...mix }: Mood): Omit<Mood, 'id' | 'order'> => mix;

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
