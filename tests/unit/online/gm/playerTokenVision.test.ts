import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { Ownership, readOwnership } from '../../../../src/app/online/gm/ownership.ts';
import { ATLAS_VIEW_TYPE, type SceneStore } from '../../../../src/app/online/gm/atlasView.ts';
import { createViewAtlasStore } from '../../../../src/app/storeFactory';
import { getHistoryStore } from '../../../../src/app/stores/history';
import type { Token } from '../../../../src/app/types';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const MAP = 'Scenes/Cave.atlasmap';

/** The GM's control over one open Atlas tab showing a fighter (blind), an ogre (blind) and a scout who sees. */
function table(): { readonly online: OnlineControl; readonly owners: Ownership; readonly vision: (id: string) => unknown; readonly steps: () => number; readonly undo: () => void; readonly switchOff: (id: string) => void } {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `vision-${Math.random()}`);
  const placed = (id: string, changes: Partial<Token> = {}): Token => ({ id, kind: 'token', imagePath: `${id}.webp`, x: 0, y: 0, ...changes });
  const tokens = { fighter: placed('fighter'), ogre: placed('ogre'), scout: placed('scout', { vision: { enabled: true, range: 60 } }) };
  store.setState({ persistenceEnabled: false, mapPath: MAP, selectedIds: ['ogre'], objects: { ...store.getState().objects, tokens } });
  const leaf = { view: { getViewType: () => ATLAS_VIEW_TYPE, atlasStore: store as unknown as SceneStore } };
  app.workspace.getMostRecentLeaf = (() => leaf) as unknown as typeof app.workspace.getMostRecentLeaf;
  const owners = new Ownership(readOwnership(undefined), () => undefined);
  owners.welcome([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
  const online = new OnlineControl(app as unknown as App, owners);
  const history = getHistoryStore(store)!;
  return {
    online, owners,
    vision: (id) => store.getState().objects.tokens[id]?.vision,
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    switchOff: (id) => store.getState().updateTokens([{ id, changes: { vision: { enabled: false } } }]),
  };
}

describe('a token the GM gives to a player', () => {
  it('sees from then on, in one undo step, keeping its own vision where it already saw', () => {
    const { online, owners, vision, steps, undo } = table();
    const before = steps();
    online.give(['fighter', 'scout'], ANA);
    expect([vision('fighter'), vision('scout')]).toEqual([{ enabled: true }, { enabled: true, range: 60 }]);
    expect(owners.ownerOf('fighter', undefined)).toBe(ANA);
    expect(steps()).toBe(before + 1);
    undo();
    expect(vision('fighter')).toBeUndefined();
  });

  it('is switched on once: vision the GM switches off later stays off when the token passes to another player', () => {
    const { online, vision, switchOff } = table();
    online.give(['fighter'], ANA);
    switchOff('fighter');
    online.give(['fighter'], BEN);
    expect(vision('fighter')).toEqual({ enabled: false });
  });

  it('changes nothing for a player nobody knows, or when the GM takes it back', () => {
    const { online, vision } = table();
    online.give(['fighter'], 'c'.repeat(20));
    expect(vision('fighter')).toBeUndefined();
    online.give(['scout'], null);
    expect(vision('scout')).toEqual({ enabled: true, range: 60 });
  });
});

describe('a token the GM makes a player token', () => {
  it('sees from then on, in one undo step; the selected one too; making it the GM\'s switches nothing off', () => {
    const { online, owners, vision, steps } = table();
    const before = steps();
    online.markPlayerTokens(['fighter'], true);
    expect(vision('fighter')).toEqual({ enabled: true });
    expect(steps()).toBe(before + 1);
    expect(online.markSelected(true)).toBe(1);
    expect(vision('ogre')).toEqual({ enabled: true });
    online.markPlayerTokens(['fighter'], false);
    expect(vision('fighter')).toEqual({ enabled: true });
    expect(owners.isPlayerToken(MAP, 'fighter', { id: 'fighter', kind: 'token', imagePath: '', x: 0, y: 0 })).toBe(false);
  });

  it('keeps vision the GM switched off once it is a player token: assigning it from the panel switches nothing on', () => {
    const { online, vision, switchOff } = table();
    online.markPlayerTokens(['fighter'], true);
    switchOff('fighter');
    online.markPlayerTokens(['fighter'], true);
    expect(vision('fighter')).toEqual({ enabled: false });
  });
});
