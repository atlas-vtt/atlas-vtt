// @vitest-environment node
import type { PlayerDrag, PlayerMove } from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import { runUntracked } from '../../../../src/app/stores/history';
import type { LevelLink, SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { ALIAS, ANA, SCENE, STORE_FACTORY, table as realTable, type StoreFactory, type Table } from './realStore.ts';

const { createViewAtlasStore } = (await import(/* @vite-ignore */ STORE_FACTORY)) as { createViewAtlasStore: StoreFactory };

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
  { id: 'roof', name: 'Roof', elevation: { bottom: 20, top: 30 }, background: null },
];
const AREA = [{ x: 400, y: 400 }, { x: 600, y: 400 }, { x: 600, y: 600 }, { x: 400, y: 600 }];

/** A table whose scene has three levels and the stairs `link` on the ground floor, where the ogre stands. */
function table(link: LevelLink['levels']): Table {
  const t = realTable(createViewAtlasStore);
  runUntracked(t.store, () => t.store.setState((draft) => {
    (draft as unknown as { levels: SceneLevel[] }).levels = LEVELS;
    draft.objects.levelLinks = { stairs: { id: 'stairs', kind: 'level-link', polygon: AREA, levels: link } };
  }));
  return t;
}

const move = (x: number, y: number): PlayerMove => ({ t: 'move', scene: SCENE, id: ALIAS.ogre, x, y });
const drag = (x: number, y: number): PlayerDrag => ({ t: 'drag', scene: SCENE, id: ALIAS.ogre, x, y });

describe('a player\'s token on stairs the GM drew', () => {
  it('goes to the level they lead to, in the move\'s one undo step', () => {
    const t = table(['ground', 'upper']);
    t.moves.receive(ANA, move(500, 500));
    expect(t.store.getState().objects.tokens.ogre).toMatchObject({ x: 500, y: 500, level: 'upper' });
    expect(t.history.getState().pastStates).toHaveLength(1);
    t.history.getState().undo();
    expect(t.store.getState().objects.tokens.ogre?.level).toBeUndefined();
  });

  it('goes there when a drag puts it down there, and only then', () => {
    const t = table(['ground', 'upper']);
    t.moves.drag(ANA, drag(300, 300));
    t.moves.drag(ANA, drag(500, 500));
    expect(t.store.getState().objects.tokens.ogre?.level).toBeUndefined();
    t.moves.receive(ANA, move(500, 500));
    expect(t.store.getState().objects.tokens.ogre?.level).toBe('upper');
  });

  it('stays on its level where the stairs offer several: only the GM picks an elevator\'s floor', () => {
    const t = table('all');
    t.moves.receive(ANA, move(500, 500));
    expect(t.store.getState().objects.tokens.ogre).toMatchObject({ x: 500, y: 500 });
    expect(t.store.getState().objects.tokens.ogre?.level).toBeUndefined();
  });
});
