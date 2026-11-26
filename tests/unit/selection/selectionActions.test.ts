import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { Viewport } from 'pixi-viewport';
import { annotationList } from '../../../src/app/annotations/annotationList';
import type { Annotation } from '../../../src/app/annotations/annotationTypes';
import { copyMapObjects } from '../../../src/app/clipboard/mapClipboardActions';
import type { GridSystem } from '../../../src/app/grid/GridSystem';
import { SelectionBarSource, type ScreenBox } from '../../../src/app/pixi/selection/selectionBarSource';
import type { ContextMenuEntry } from '../../../src/app/react/components/context-menu/AtlasContextMenu';
import type { ResourceDefinition } from '../../../src/app/resources/resourceTypes';
import { annotationActions } from '../../../src/app/selection/annotationActionList';
import { emptyMapActions } from '../../../src/app/selection/emptyMapMenu';
import { pinActions } from '../../../src/app/selection/pinActionList';
import { primaryActions, type RunAction, type SelectionAction } from '../../../src/app/selection/selectionActions';
import { selectionMenu } from '../../../src/app/selection/selectionMenu';
import { tokenActions, type TokenActionHost } from '../../../src/app/selection/tokenActionList';
import { annotationExtras } from '../../../src/app/selection/wholeSelection';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { Character, Token } from '../../../src/app/types';
import type { ConditionDefinition } from '../../../src/app/types/collectionSettingsTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal: () => true, closeContextMenuGlobal: () => {} }));

const HP: ResourceDefinition = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#e93147', defeatedWhenSpent: true, visibleToPlayers: true };
const POISONED: ConditionDefinition = { id: 'poisoned', name: 'Poisoned', color: '#08b94e' };
const VIEWPORT = { screenWidth: 800, screenHeight: 600, toWorld: (x: number, y: number) => ({ x, y }) };

const crate: Token = { id: 'crate', kind: 'token', imagePath: 'crate.png', x: 0, y: 0 };
const goblin: Character = { id: 'goblin', kind: 'character', name: 'Goblin', imagePath: 'goblin.png', x: 70, y: 70, size: 1, resources: { hp: { current: 7, max: 9 } } };

interface Scene {
  store: ViewAtlasStore;
  ids: { text: string; pen: string };
  /** The actions of a token, as the view hands them out; `touch` for a finger, `conditions` for a system with some. */
  ofToken(id: string, more?: Partial<TokenActionHost>): SelectionAction[];
  annotations(ids: string[]): Annotation[];
  steps(): number;
  undo(): void;
  edited: string[];
}

function scene(selected: (ids: { text: string; pen: string }) => string[] = () => []): Scene {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `selection-actions-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ activeTool: 'select', isMapLoading: false, isGMView: true, objects: { ...store.getState().objects, tokens: { crate, goblin } } });
  const ids = {
    text: store.getState().addText({ x: 300, y: 200, text: 'Gate', fontSize: 24, fontFamily: 'Atlas Fantaisie Artistique', color: '#ffffff' }),
    pen: store.getState().addDrawing({ type: 'pen', points: [{ x: 0, y: 0 }, { x: 40, y: 30 }], color: '#086ddd', width: 4, opacity: 1 }),
  };
  store.getState().setSelection(selected(ids));
  getHistoryStore(store)!.getState().clear();
  const edited: string[] = [];
  const host: TokenActionHost = {
    store, app: app as unknown as App, grid: {} as GridSystem, isPlayerView: false, movement: undefined, touch: false,
    conditions: () => [], resources: () => [HP], editToken: (token) => edited.push(token.id), changeResource: () => undefined, paste: () => undefined,
  };
  return {
    store, ids, edited,
    ofToken: (id, more = {}) => tokenActions({ ...host, ...more }, store.getState().objects.tokens[id]!, { x: 0, y: 0 }),
    annotations: (wanted) => annotationList(store.getState().objects).filter(({ id }) => wanted.includes(id)),
    steps: () => getHistoryStore(store)!.getState().pastStates.length,
    undo: () => getHistoryStore(store)!.getState().undo(),
  };
}

const ids = (actions: readonly SelectionAction[]): string[] => actions.map(({ id }) => id);
const named = (actions: readonly SelectionAction[], id: string): RunAction => {
  const action = actions.find((one) => one.id === id);
  if (action?.kind !== 'run') throw new Error(`no "${id}" to run`);
  return action;
};
const bar = (actions: readonly SelectionAction[]): string[] => primaryActions(actions).map((action) => `${action.id}:${action.primary?.label}`);
const objectIds = (store: ViewAtlasStore): string[] => {
  const { tokens, drawings, texts } = store.getState().objects;
  return [...Object.keys(tokens), ...Object.keys(drawings), ...Object.keys(texts)].sort();
};

describe('what can be done with a token', () => {
  it('is described once, in the menu\'s order, with Edit, Duplicate and Delete as the bar\'s own', () => {
    const { ofToken } = scene();
    const actions = ofToken('goblin');
    expect(ids(actions)).toEqual([
      'size', 'height', 'aura', 'visibility', 'vision', 'carry-light', 'duplicate', 'copy', 'save-encounter', 'edit', 'initiative',
      'link-statblock', 'ring', 'reset', 'kill', 'delete',
    ]);
    expect(bar(actions)).toEqual(['edit:Edit', 'duplicate:Duplicate', 'delete:Delete']);
    expect(actions.every((action) => action.kind === 'row' || action.enabled)).toBe(true);
    expect(named(actions, 'delete').destructive).toBe(true);
  });

  it('has Conditions among the bar\'s own where the map\'s system defines some, before the destructive one', () => {
    const { ofToken } = scene();
    expect(bar(ofToken('goblin', { conditions: () => [POISONED] }))).toEqual(['edit:Edit', 'duplicate:Duplicate', 'conditions:Conditions', 'delete:Delete']);
  });

  it('offers Kill only for a token a spent resource defeats, and no Reset for one that tracks nothing', () => {
    const { ofToken } = scene();
    expect(ids(ofToken('crate'))).not.toContain('kill');
    expect(ids(ofToken('crate'))).not.toContain('reset');
  });

  it('runs what the menu runs: Edit opens the token, the switch hides it', () => {
    const { ofToken, store, edited } = scene();
    named(ofToken('goblin'), 'edit').run();
    expect(edited).toEqual(['goblin']);
    named(ofToken('goblin'), 'visibility').run();
    expect(store.getState().objects.tokens['goblin']?.isHidden).toBe(true);
    expect(named(ofToken('goblin'), 'visibility').label).toBe('Show');
  });

  it('offers Paste under a finger only, and only once something was copied', async () => {
    const { ofToken, store } = scene();
    expect(ids(ofToken('goblin'))).not.toContain('paste');
    const paste = vi.fn();
    expect(named(ofToken('goblin', { touch: true, paste }), 'paste').enabled).toBe(false);
    await copyMapObjects(store, ['goblin']);
    const after = ofToken('goblin', { touch: true, paste });
    expect(ids(after).slice(ids(after).indexOf('copy'), ids(after).indexOf('copy') + 2)).toEqual(['copy', 'paste']);
    expect(named(after, 'paste').enabled).toBe(true);
    named(after, 'paste').run();
    expect(paste).toHaveBeenCalledOnce();
  });
});

describe('Duplicate and Delete of a token\'s actions', () => {
  it('take every selected token, in one undo step each', () => {
    const { ofToken, store, steps, undo } = scene(() => ['goblin', 'crate']);
    named(ofToken('crate'), 'delete').run();
    expect(Object.keys(store.getState().objects.tokens)).toEqual([]);
    expect(steps()).toBe(1);
    undo();
    expect(Object.keys(store.getState().objects.tokens).sort()).toEqual(['crate', 'goblin']);
  });

  it('take the drawings and texts selected with it too, in one undo step each', () => {
    const { ofToken, store, ids: made, steps, undo } = scene(({ text, pen }) => ['goblin', text, pen]);
    const before = objectIds(store);
    named(ofToken('goblin'), 'duplicate').run();
    expect(objectIds(store)).toHaveLength(before.length + 3);
    expect(steps()).toBe(1);
    undo();
    store.getState().setSelection(['goblin', made.text, made.pen]);
    named(ofToken('goblin'), 'delete').run();
    expect(objectIds(store)).toEqual(['crate']);
    expect(steps()).toBe(1);
    undo();
    expect(objectIds(store)).toEqual(before);
  });

  it('take a token outside the selection alone', () => {
    const { ofToken, store, ids: made } = scene(({ text }) => ['goblin', text]);
    named(ofToken('crate'), 'delete').run();
    expect(objectIds(store)).toEqual(['goblin', made.pen, made.text].sort());
  });
});

describe('what can be done with drawings and texts', () => {
  const of = (s: Scene, selected: Annotation[], clicked: Annotation | null, touch = false): SelectionAction[] =>
    annotationActions(selected, clicked, s.store.getState(), () => undefined, [], annotationExtras(s.store, VIEWPORT as unknown as Viewport, selected.map(({ id }) => id), touch));

  it('gives a text Edit, Duplicate and Delete as the bar\'s own, a drawing Duplicate and Delete', () => {
    const s = scene(({ text }) => [text]);
    const [text] = s.annotations([s.ids.text]);
    const [pen] = s.annotations([s.ids.pen]);
    expect(bar(of(s, [text!], text!))).toEqual(['edit:Edit', 'duplicate:Duplicate', 'delete:Delete']);
    expect(bar(of(s, [pen!], pen!))).toEqual(['duplicate:Duplicate', 'delete:Delete']);
    // Several selected: none of them is the one to type in.
    expect(bar(of(s, [text!, pen!], null))).toEqual(['duplicate:Duplicate', 'delete:Delete']);
  });

  it('leaves a locked one only its unlocking and Duplicate', () => {
    const s = scene(({ text }) => [text]);
    s.store.getState().updateAnnotations([s.ids.text], { locked: true });
    const [text] = s.annotations([s.ids.text]);
    const actions = of(s, [text!], text!);
    const enabled = actions.filter((action): action is RunAction => action.kind === 'run' && action.enabled).map(({ id }) => id);
    expect(enabled).toEqual(['lock', 'duplicate']);
    expect(named(actions, 'lock').label).toBe('Unlock');
  });

  it('deletes and duplicates the tokens selected with them, in one undo step each', () => {
    const s = scene(({ text, pen }) => ['goblin', text, pen]);
    const selected = s.annotations([s.ids.text, s.ids.pen]);
    const before = objectIds(s.store);
    named(of(s, selected, null), 'duplicate').run();
    expect(objectIds(s.store)).toHaveLength(before.length + 3);
    s.undo();
    s.store.getState().setSelection(['goblin', s.ids.text, s.ids.pen]);
    named(of(s, selected, null), 'delete').run();
    expect(objectIds(s.store)).toEqual(['crate']);
    expect(s.steps()).toBe(1);
    s.undo();
    expect(objectIds(s.store)).toEqual(before);
  });

  it('offers Copy and Paste under a finger only', async () => {
    const s = scene(({ pen }) => [pen]);
    const [pen] = s.annotations([s.ids.pen]);
    expect(ids(of(s, [pen!], pen!))).not.toContain('copy');
    const touched = of(s, [pen!], pen!, true);
    expect(ids(touched).slice(-4)).toEqual(['duplicate', 'copy', 'paste', 'delete']);
    named(touched, 'copy').run();
    await vi.waitFor(() => expect(named(of(s, [pen!], pen!, true), 'paste').enabled).toBe(true));
  });
});

describe('what can be done with a pin', () => {
  it('has Edit, Duplicate and Delete as its own', () => {
    const { store } = scene();
    const id = store.getState().addNotePin(120, 80, 'Notes/Tavern.md');
    const actions = pinActions(store, store.getState().objects.pins[id]!);
    expect(ids(actions)).toEqual(['open', 'edit', 'preview', 'readable', 'show-name', 'rename', 'duplicate', 'delete']);
    expect(bar(actions)).toEqual(['edit:Edit', 'duplicate:Duplicate', 'delete:Delete']);
    named(actions, 'delete').run();
    expect(store.getState().objects.pins[id]).toBeUndefined();
  });
});

describe('the menu of a list of actions', () => {
  const run = (id: string, more: Partial<RunAction> = {}): RunAction => ({ kind: 'run', id, label: id, icon: 'x', enabled: true, run: () => undefined, ...more });

  it('draws an action as an item, choices as a submenu, and says what cannot be chosen and what destroys', () => {
    const choices: ContextMenuEntry[] = [{ type: 'item', label: 'One', onClick: () => undefined }];
    const menu = selectionMenu([
      run('open'), run('locked', { enabled: false }), run('remove', { destructive: true }), run('shown', { checked: true }),
      { kind: 'choices', id: 'colour', label: 'Colour', icon: 'palette', enabled: true, choices },
    ], () => undefined);
    expect(menu.map((entry) => (entry.type === 'custom' ? null : { ...entry, onClick: undefined }))).toEqual([
      { type: 'item', label: 'open', icon: 'x', onClick: undefined },
      { type: 'item', label: 'locked', icon: 'x', disabled: true, onClick: undefined },
      { type: 'item', label: 'remove', icon: 'x', destructive: true, onClick: undefined },
      { type: 'item', label: 'shown', icon: 'x', checked: true, onClick: undefined },
      { type: 'submenu', label: 'Colour', icon: 'palette', children: choices, onClick: undefined },
    ]);
  });

  it('puts the actions that stand side by side into one row', () => {
    const menu = selectionMenu([run('edit'), run('kill', { sideBySide: true }), run('delete', { sideBySide: true })], () => undefined);
    expect(menu.map(({ type }) => type)).toEqual(['item', 'custom']);
  });
});

describe('what a finger held on the empty map offers', () => {
  it('pastes at the point once something was copied, and selects every token the canvas shows', async () => {
    const { store } = scene();
    const shown = { visibleTokenIds: () => ['goblin'] };
    expect(ids(emptyMapActions(store, shown, { x: 400, y: 300 }))).toEqual(['paste', 'select-all']);
    await copyMapObjects(store, ['crate']);
    const actions = emptyMapActions(store, shown, { x: 400, y: 300 });
    expect(named(actions, 'paste').enabled).toBe(true);
    named(actions, 'select-all').run();
    expect(store.getState().selectedIds).toEqual(['goblin']);
    named(actions, 'paste').run();
    await vi.waitFor(() => expect(Object.keys(store.getState().objects.tokens)).toHaveLength(3));
    const pasted = Object.values(store.getState().objects.tokens).find((token) => token.id !== 'crate' && token.id !== 'goblin')!;
    expect(Math.hypot(pasted.x - 400, pasted.y - 300)).toBeLessThan(80);
  });
});

describe('what the bar above a selection reads of a view', () => {
  const source = (s: Scene, more: { box?: boolean; busy?: boolean; transforming?: boolean; reshaping?: boolean } = {}): SelectionBarSource => new SelectionBarSource({
    store: s.store,
    viewport: { scale: { x: 2 }, toScreen: (x: number, y: number) => ({ x: 2 * x + 10, y: 2 * y + 20 }) } as unknown as Viewport,
    tokens: () => ({ tokenActions: (id) => s.ofToken(id), transforming: () => more.transforming === true }),
    selection: () => ({ shownBox: () => (more.box === false ? null : { x: 100, y: 50, width: 40, height: 30 }), busy: more.busy === true }),
    annotations: () => ({ barFrame: () => null, selectionActions: () => [{ kind: 'run', id: 'of-annotations', label: '', enabled: true, run: () => undefined }], reshaping: more.reshaping === true }),
  });

  it('offers the actions of the first selected token, and those of the drawings and texts where no token is selected', () => {
    const s = scene(({ pen }) => [pen, 'crate', 'goblin']);
    expect(ids(source(s).actions({ x: 0, y: 0 }))).toEqual(ids(s.ofToken('crate')));
    s.store.getState().setSelection([s.ids.pen]);
    expect(ids(source(s).actions({ x: 0, y: 0 }))).toEqual(['of-annotations']);
  });

  it('says where the selection stands on the canvas, and that it stands nowhere while nothing of it shows', () => {
    const s = scene(() => ['goblin']);
    const box: ScreenBox = { left: 0, top: 0, right: 0, bottom: 0 };
    expect(source(s).shown(box)).toBe(true);
    expect(box).toEqual({ left: 210, top: 120, right: 290, bottom: 180 });
    expect(source(s, { box: false }).shown(box)).toBe(false);
    expect(source(s, { box: false }).shows()).toBe(false);
  });

  it('is busy while the selection is dragged, resized, turned or a marquee is drawn', () => {
    const s = scene(() => ['goblin']);
    expect(source(s).busy()).toBe(false);
    expect(source(s, { busy: true }).busy()).toBe(true);
    expect(source(s, { transforming: true }).busy()).toBe(true);
    expect(source(s, { reshaping: true }).busy()).toBe(true);
    s.store.getState().setIsDragging(true);
    expect(source(s).busy()).toBe(true);
  });
});
