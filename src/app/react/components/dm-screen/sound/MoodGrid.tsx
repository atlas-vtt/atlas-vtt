import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { t } from '../../../../i18n';
import type { Mood } from '../../../../sound/soundTypes';
import { moodProblems, type MoodProblem } from '../../../../soundDirector/moodReadiness';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { MoodStore } from '../../../../soundLibrary/MoodStore';
import { orderForMove } from '../../../../soundLibrary/moodOrdering';
import { confirmAction } from '../../../../ui/confirmDialog';
import { useContextMenu } from '../../../root/ContextMenuContext';
import { useAtlasStore } from '../../../ViewStoreContext';
import { MoodCard } from './MoodCard';
import { MoodEditDialog } from './MoodEditDialog';
import { useMoodDrag } from './useMoodDrag';
import { useSoundValue } from './useSound';

interface MoodGridProps {
  app: App;
  director: SoundDirector;
  collectionId: string;
  moods: readonly Mood[];
  /** Whether the open map belongs to this collection, so its scene may link these moods. */
  sameCollectionAsMap: boolean;
}

const NO_PROBLEMS: readonly MoodProblem[] = [];

/** The moods in their fixed places, numbered as the keys that press them. */
export function MoodGrid({ app, director, collectionId, moods, sameCollectionAsMap }: MoodGridProps): React.JSX.Element {
  const store = MoodStore.forApp(app);
  const gridRef = useRef<HTMLDivElement>(null);
  const menu = useContextMenu();
  const sceneSound = useAtlasStore((state) => state.sound);
  const setSceneSound = useAtlasStore((state) => state.setSceneSound);
  const [editing, setEditing] = useState<Mood | null>(null);
  const activeId = useSoundValue(director, (snapshot) => (snapshot.mix.mood?.collectionId === collectionId ? snapshot.mix.mood.id : null));
  const shelfRevision = useSoundValue(director, (snapshot) => snapshot.shelfRevision);

  const move = useCallback((mood: Mood, index: number): void => {
    const order = orderForMove(moods, mood.id, index);
    if (order !== null) store.saveMood(collectionId, { ...mood, order });
  }, [collectionId, moods, store]);

  const canMove = useCallback((mood: Mood) => !store.isReadOnly(collectionId, mood.id), [collectionId, store]);
  const { shown, draggingId, start, consumeClick } = useMoodDrag(gridRef, moods, canMove, move);

  const press = useCallback((mood: Mood): void => {
    if (!consumeClick()) director.press(collectionId, mood);
  }, [collectionId, consumeClick, director]);

  const openMenu = useCallback((mood: Mood, anchor: HTMLElement): void => {
    const box = anchor.getBoundingClientRect();
    const readOnly = store.isReadOnly(collectionId, mood.id);
    menu.open([
      { type: 'item', label: t('audio.mood.edit'), disabled: readOnly, ...(readOnly && { description: t('audio.mood.readOnly') }), onClick: () => setEditing(mood) },
      { type: 'item', label: t('audio.mood.duplicate'), onClick: () => store.createMood(collectionId, { name: t('audio.mood.copyName', { name: mood.name }), fadeSeconds: mood.fadeSeconds, music: mood.music, layers: mood.layers }) },
      { type: 'item', label: t('audio.mood.linkScene'), checked: sceneSound?.mood === mood.id, disabled: !sameCollectionAsMap, onClick: () => setSceneSound(withLink(sceneSound, 'mood', mood.id)) },
      { type: 'item', label: t('audio.mood.linkCombat'), checked: sceneSound?.combatMood === mood.id, disabled: !sameCollectionAsMap, onClick: () => setSceneSound(withLink(sceneSound, 'combatMood', mood.id)) },
      { type: 'item', label: t('audio.mood.delete'), destructive: true, disabled: readOnly, onClick: () => void confirmDelete(store, collectionId, mood) },
    ], { x: box.left, y: box.bottom }, { returnFocus: anchor });
  }, [collectionId, menu, sameCollectionAsMap, sceneSound, setSceneSound, store]);

  // Copies a mood names are made before anyone presses it.
  useEffect(() => {
    director.shelf.request(moods.flatMap((mood) => director.shelf.recordsOf(mood)));
  }, [director, moods, shelfRevision]);

  const problems = useMemo(() => new Map(moods.map((mood) => [mood.id, moodProblems(mood, director.shelf)])), [director, moods, shelfRevision]);
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
          next={mood.id === nextId}
          dragging={mood.id === draggingId}
          problems={problems.get(mood.id) ?? NO_PROBLEMS}
          onPress={press}
          onMenu={openMenu}
          onDragStart={start}
        />
      ))}
      {editing && <MoodEditDialog mood={editing} onClose={() => setEditing(null)} onSave={(changed) => store.saveMood(collectionId, changed)} />}
    </div>
  );
}

function withLink(sound: { mood?: string; combatMood?: string } | null, key: 'mood' | 'combatMood', id: string): { mood?: string; combatMood?: string } | null {
  const { [key]: current, ...rest } = sound ?? {};
  return current === id ? rest : { ...rest, [key]: id };
}

async function confirmDelete(store: MoodStore, collectionId: string, mood: Mood): Promise<void> {
  const sure = await confirmAction({
    title: t('audio.mood.deleteTitle', { name: mood.name }),
    message: [t('audio.mood.deleteMessage')],
    confirmLabel: t('audio.mood.delete'),
    destructive: true,
  });
  if (sure) store.removeMood(collectionId, mood.id);
}
