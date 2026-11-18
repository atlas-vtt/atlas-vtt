import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { annotationList } from '../../../src/app/annotations/annotationList';
import type { Annotation } from '../../../src/app/annotations/annotationTypes';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import { selectionMenuStyles } from '../../../src/app/packages/components/toolbar/selectionMenuStyles';
import { annotationMenu } from '../../../src/app/pixi/annotations/annotationMenu';
import { pinMenuEntries } from '../../../src/app/pixi/pinMenu';
import { InteractionController } from '../../../src/app/pixi/token-renderer/InteractionController';
import type { ContextMenuEntry } from '../../../src/app/react/components/context-menu/AtlasContextMenu';
import type { ResourceDefinition } from '../../../src/app/resources/resourceTypes';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import type { Character, Token } from '../../../src/app/types';
import type { ConditionDefinition } from '../../../src/app/types/collectionSettingsTypes';
import type { EventEmitter } from '../../../src/app/utils/typedEmitter';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const opened = vi.hoisted(() => ({ entries: [] as ContextMenuEntry[] }));
vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({
  openContextMenuGlobal: (entries: ContextMenuEntry[]) => { opened.entries = entries; },
  closeContextMenuGlobal: () => {},
}));

/** What a menu shows, row by row: every row's kind, words, icon and state, a submenu's rows, and what a row of its own making draws. */
function shape(entries: readonly ContextMenuEntry[]): unknown[] {
  return entries.map((entry) => {
    if (entry.type === 'custom') return { custom: renderToStaticMarkup(<>{entry.render()}</>) };
    if (entry.type === 'submenu') {
      return { submenu: entry.label, icon: entry.icon, follows: entry.subscribe !== undefined, rows: shape(typeof entry.children === 'function' ? entry.children() : entry.children) };
    }
    // A row that can be chosen is drawn alike whether it says so or says nothing
    const { onClick: _onClick, type: _type, leading, stepper, label, disabled, ...state } = entry;
    return { item: label, ...state, ...(disabled && { disabled }), ...(leading !== undefined && { leading: true }), ...(stepper && { stepper: stepper.value }) };
  });
}

const HP: ResourceDefinition = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#e93147', defeatedWhenSpent: true, visibleToPlayers: true };
const CONDITIONS: ConditionDefinition[] = [
  { id: 'poisoned', name: 'Poisoned', color: '#08b94e' },
  { id: 'frightened', name: 'Frightened', color: '#7852ee', valued: true },
];

const plain = (id: string): Token => ({ id, kind: 'token', imagePath: `${id}.png`, x: 0, y: 0 });
const character = (id: string, changes: Partial<Character> = {}): Character => ({
  id, kind: 'character', name: id, imagePath: `${id}.png`, x: 70, y: 70, size: 1, resources: { hp: { current: 7, max: 9 } }, ...changes,
});

function scene(selectedIds: (ids: { text: string; stamp: string; pen: string }) => string[]): {
  store: ViewAtlasStore; ids: { text: string; stamp: string; pen: string }; rightClick: (id: string) => unknown[]; annotations: (ids: string[]) => Annotation[];
} {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `menu-parity-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const tokens = {
    goblin: character('goblin', { conditions: ['poisoned'] }),
    ogre: character('ogre', { statblockPath: 'Bestiary/Ogre.md', isHidden: true }),
    crate: plain('crate'),
  };
  store.setState({ activeTool: 'select', isMapLoading: false, isGMView: true, objects: { ...store.getState().objects, tokens } });
  const ids = {
    text: store.getState().addText({ x: 300, y: 200, text: 'Gate', fontSize: 24, fontFamily: 'Atlas Fantaisie Artistique', color: '#ffffff' }),
    stamp: store.getState().addDrawing({ type: 'icon', icon: 'skull', points: [{ x: 300, y: 300 }], color: '#e93147', width: 70, opacity: 1 }),
    pen: store.getState().addDrawing({ type: 'pen', points: [{ x: 0, y: 0 }, { x: 40, y: 30 }], color: '#086ddd', width: 4, opacity: 1 }),
  };
  store.getState().setSelection(selectedIds(ids));
  const controller = new InteractionController({} as Viewport, store, {} as GridSystem, {} as EventEmitter, app as unknown as App);
  controller.conditionDefsProvider = () => CONDITIONS;
  controller.resourceDefsProvider = () => [HP];
  const rightClick = (id: string): unknown[] => {
    opened.entries = [];
    controller.handleViewportTokenPointerDown(id, { button: 2, stopPropagation: () => {}, clientX: 0, clientY: 0, global: { x: 0, y: 0 } } as unknown as FederatedPointerEvent);
    return shape(opened.entries);
  };
  const annotations = (wanted: string[]): Annotation[] => annotationList(store.getState().objects).filter(({ id }) => wanted.includes(id));
  return { store, ids, rightClick, annotations };
}

const annotationShape = (store: ViewAtlasStore, selected: Annotation[], clicked: Annotation | null): unknown[] =>
  shape(annotationMenu(selected, clicked, store.getState(), () => undefined, selectionMenuStyles(selected, store)));

/**
 * The menus a right-click opens on the map, as they were before they were built from the
 * selection's actions (`selectionActions`): the same rows in the same order, for a fine pointer.
 */
describe('the desktop menus of what is selected', () => {
  it('a token alone', () => {
    const { rightClick } = scene(() => []);
    expect(rightClick('goblin')).toMatchSnapshot();
  });

  it('a token without values of its own, and one with a statblock that is hidden', () => {
    const { rightClick } = scene(() => []);
    expect(rightClick('crate')).toMatchSnapshot();
    expect(rightClick('ogre')).toMatchSnapshot();
  });

  it('a token of a selection of tokens', () => {
    const { rightClick } = scene(() => ['goblin', 'ogre', 'crate']);
    expect(rightClick('ogre')).toMatchSnapshot();
  });

  it('a token outside the selection', () => {
    const { rightClick } = scene(() => ['goblin', 'ogre']);
    expect(rightClick('crate')).toMatchSnapshot();
  });

  it('a token of a selection of tokens, a text and drawings', () => {
    const { rightClick } = scene(({ text, stamp, pen }) => ['goblin', 'crate', text, stamp, pen]);
    expect(rightClick('goblin')).toMatchSnapshot();
  });

  it('a text', () => {
    const { store, ids, annotations } = scene(({ text }) => [text]);
    const [text] = annotations([ids.text]);
    expect(annotationShape(store, [text!], text!)).toMatchSnapshot();
  });

  it('a drawing, and a locked one', () => {
    const { store, ids, annotations } = scene(({ pen }) => [pen]);
    const [pen] = annotations([ids.pen]);
    expect(annotationShape(store, [pen!], pen!)).toMatchSnapshot();
    store.getState().updateAnnotations([ids.pen], { locked: true });
    const [locked] = annotations([ids.pen]);
    expect(annotationShape(store, [locked!], locked!)).toMatchSnapshot();
  });

  it('a text and drawings selected with tokens, from one of the drawings and from their frame', () => {
    const { store, ids, annotations } = scene(({ text, stamp, pen }) => ['goblin', 'crate', text, stamp, pen]);
    const selected = annotations([ids.text, ids.stamp, ids.pen]);
    expect(annotationShape(store, selected, selected.find(({ id }) => id === ids.stamp)!)).toMatchSnapshot();
    expect(annotationShape(store, selected, null)).toMatchSnapshot();
  });

  it('a pin', () => {
    const { store } = scene(() => []);
    const id = store.getState().addNotePin(120, 80, 'Notes/Tavern.md');
    expect(shape(pinMenuEntries(store, store.getState().objects.pins[id]!))).toMatchSnapshot();
    store.getState().updateNotePin(id, { showName: true, readable: true });
    expect(shape(pinMenuEntries(store, store.getState().objects.pins[id]!))).toMatchSnapshot();
  });
});
