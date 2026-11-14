import { annotationList } from '../../../src/app/annotations/annotationList';
import type { DrawingInput, TextInput } from '../../../src/app/annotations/annotationTypes';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { DrawingStroke, TextElement } from '../../../src/app/types';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

export type Point = { x: number; y: number };

export const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
export const PEN: DrawingInput = { type: 'pen', points: [{ x: 0, y: 0 }, { x: 70, y: 35 }], color: '#aa3300', width: 4, opacity: 1 };
export const ROOM: DrawingInput = {
  type: 'line', points: [{ x: 0, y: 0 }, { x: 140, y: 0 }, { x: 140, y: 140 }, { x: 0, y: 140 }, { x: 0, y: 0 }], color: '#336699', width: 6, opacity: 1,
  fill: 'soft', holes: [[{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }]],
};
export const CURVE: DrawingInput = {
  type: 'line', points: [{ x: 0, y: 0 }, { x: 10, y: 6 }, { x: 20, y: 9 }, { x: 30, y: 6 }, { x: 40, y: 0 }], color: '#ffffff', width: 6, opacity: 1,
  anchors: [{ x: 0, y: 0 }, { x: 20, y: 9 }, { x: 40, y: 0 }],
};
export const LABEL: TextInput = { x: 10, y: 20, text: 'Crypt', fontSize: 24, fontFamily: 'Arial', color: '#ffffff' };

export interface Setup {
  store: ViewAtlasStore;
  steps: () => number;
  undo: () => void;
  redo: () => void;
  drawings: () => Record<string, DrawingStroke>;
  texts: () => Record<string, TextElement>;
  /** The ids of the level shown, lowest first. */
  shown: () => string[];
}

export function setup(levels?: SceneLevel[], viewed?: string): Setup {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `annotations-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/annotations.atlasmap');
  if (levels) store.setState({ levels, viewedLevel: viewed ?? null });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return {
    store,
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    redo: () => history.getState().redo(),
    drawings: () => store.getState().objects.drawings,
    texts: () => store.getState().objects.texts,
    shown: () => annotationList(levelObjects(store.getState())).map(({ id }) => id),
  };
}

export const shifted = (points: readonly Point[], dx: number, dy: number): Point[] => points.map(({ x, y }) => ({ x: x + dx, y: y + dy }));
