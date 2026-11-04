import { describe, expect, it } from 'vitest';
import { applyLinkChange, statblockTokenChanges, syncLinkedTokens } from '../../src/app/pixi/token-renderer/statblockTokenSync';
import { HP_RESOURCE } from '../../src/app/resources/resourceDefinitions';
import type { LinkChangeEvent } from '../../src/app/services/TokenStatblockLinkService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { builtInTemplate } from '../../src/app/statblocks/library/builtInTemplates';
import type { LibraryTemplate } from '../../src/app/statblocks/model/resolvedTypes';
import { resolveNative } from '../../src/app/statblocks/resolve/resolveStatblock';
import type { Character } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const WARDEN = 'Bestiary/Marsh Warden.md';
const warden: Character = {
  id: 't1', kind: 'character', x: 0, y: 0, imagePath: 'art/warden.webp', name: 'Marsh Warden',
  statblockPath: WARDEN, resources: { hp: { current: 10, max: 14 } },
};

function mapWith(tokens: Record<string, Character>): { store: ViewAtlasStore; steps: () => number } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `token-sync-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/marsh.atlasmap');
  store.getState().setTokens(tokens);
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return { store, steps: () => history.getState().pastStates.length };
}

describe('linked tokens following their statblock', () => {
  it('take a statblock edit without it becoming an undo step of the open map', () => {
    const { store, steps } = mapWith({ t1: warden, t2: { ...warden, id: 't2', statblockPath: 'Bestiary/Other.md' } });

    syncLinkedTokens(store, WARDEN, { fields: { name: 'Marsh Warden', hp: 30, cr: 2 } }, [HP_RESOURCE], null);

    const { t1, t2 } = store.getState().objects.tokens as Record<string, Character>;
    expect(t1).toMatchObject({ resources: { hp: { current: 10, max: 30 } }, difficulty: 'CR 2' });
    expect(t2?.resources).toEqual({ hp: { current: 10, max: 14 } });
    expect(steps()).toBe(0);
  });

  it('leave tokens already in step alone', () => {
    const { store, steps } = mapWith({ t1: { ...warden, difficulty: 'CR 2' } });
    const before = store.getState().objects;

    syncLinkedTokens(store, WARDEN, { fields: { name: 'Marsh Warden', hp: 14, cr: 2 } }, [HP_RESOURCE], null);

    expect(store.getState().objects).toBe(before);
    expect(steps()).toBe(0);
  });

  it('read a value its template moved to a new key from the note\'s former key', () => {
    const generic = builtInTemplate('builtin:generic-creature')!;
    const fields = generic.template.fields.map((field) => (field.key === 'hp' ? { ...field, key: 'vigour', formerKeys: ['hp'] } : field));
    const template: LibraryTemplate = { template: { ...generic.template, fields }, name: 'Generic', status: 'ok', builtIn: true, path: null };
    const resolved = resolveNative(WARDEN, { kind: 'atlas', templateId: generic.id }, { name: 'Marsh Warden', hp: 22 }, { get: () => template });

    const changes = statblockTokenChanges({ t1: warden }, WARDEN, resolved, [{ ...HP_RESOURCE, field: 'vigour' }], 'art/new.webp');

    expect(changes).toEqual([{ id: 't1', changes: { resources: { hp: { current: 10, max: 22 } }, imagePath: 'art/new.webp' } }]);
  });
});

describe('open-map tokens following a change of their art\'s link', () => {
  const art = warden.imagePath;
  const unlinked = (fromNote?: boolean): LinkChangeEvent => ({ type: 'unlinked', tokenImagePath: art, statblockPath: null, ...(fromNote && { fromNote }) });
  const other: Character = { ...warden, id: 't3', imagePath: 'art/ogre.webp', statblockPath: 'Bestiary/Ogre.md' };

  it('take an unlink the note\'s image caused without it becoming an undo step', () => {
    const { store, steps } = mapWith({ t1: warden, t2: { ...warden, id: 't2' }, t3: other });

    applyLinkChange(store, unlinked(true), () => null);

    const { t1, t2, t3 } = store.getState().objects.tokens as Record<string, Character>;
    expect([t1?.statblockPath, t1?.resources, t2?.resources]).toEqual([undefined, undefined, undefined]);
    expect(t3).toEqual(other);
    expect(steps()).toBe(0);
  });

  it('take a link the note\'s image caused untracked, with what the statblock gives', () => {
    const { store, steps } = mapWith({ t1: { ...warden, statblockPath: undefined, resources: undefined } });

    applyLinkChange(store, { type: 'linked', tokenImagePath: art, statblockPath: WARDEN, fromNote: true }, (_token, path) => ({ statblockPath: path, resources: { hp: { current: 9, max: 9 } } }));

    expect(store.getState().objects.tokens.t1).toMatchObject({ statblockPath: WARDEN, resources: { hp: { current: 9, max: 9 } } });
    expect(steps()).toBe(0);
  });

  it('make a link change made by hand one undo step for all its tokens', () => {
    const { store, steps } = mapWith({ t1: warden, t2: { ...warden, id: 't2' } });

    applyLinkChange(store, unlinked(), () => null);

    expect(steps()).toBe(1);
  });
});
