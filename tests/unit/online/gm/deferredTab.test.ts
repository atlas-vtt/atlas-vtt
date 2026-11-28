import type { WorkspaceLeaf } from 'obsidian';
import type { TokenEntity } from '../../../../src/app/types';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATLAS_VIEW_TYPE } from '../../../../src/app/online/gm/atlasView.ts';
import { mapViewOf, sceneStoreOf } from '../../../../src/app/online/gm/mapViewOf.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { fakeAtlasTab } from './fakeAtlasTab.ts';
import { FakeRelay } from './fakeRelay.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import { app, atlasTab, png, present, storedAccount, workspace } from './fakeTable.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import { advanceSettled as advance } from './settled.ts';
import { GRID_SIZE, sceneState, token } from './shareHarness.ts';

/*
 * After a restart Obsidian holds a tab in the background as a placeholder until it is shown: a view that answers
 * Atlas's view type and has nothing else of an Atlas view. A table that resumes meanwhile reads it as no map tab.
 */

vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerDrags(): void {}
    showPlayerCursors(): void {}
    showPlayerStrokes(): void {}
    dispose(): void {}
  },
}));

vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({
  ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()),
  accentColour: () => '#112233',
}));

const ANA = 'anaanaanaanaanaanaan';
const CAVE = 'Scenes/Cave.atlasmap';
const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: CAVE, gate: { code: '483912', requireCode: false, askToJoin: false } };
const PLAYERS = [{ id: ANA, name: 'Ana' }];
const ASSIGNMENTS = { owners: { ana: ANA }, playerTokens: {} };
const NO_SCENE = '{"t":"scene","scene":null}';

function cave(): SceneState {
  const base = sceneState({ mapPath: CAVE, background: 'maps/cave.png', grid: { size: GRID_SIZE } as SceneState['grid'], lighting: { enabled: false, ambient: 1 } });
  const ana = { ...token('ana', { x: 210, y: 350 }), kind: 'character', name: 'Ana' } as TokenEntity;
  return { ...base, objects: { ...base.objects, tokens: { ana } } };
}

/** A leaf whose view Obsidian has not loaded yet. */
function deferredLeaf(): { view: unknown } {
  return { view: { getViewType: () => ATLAS_VIEW_TYPE } };
}

describe('an Atlas tab Obsidian has not loaded yet', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    workspace.leaves = [];
    workspace.presented = null;
    workspace.files = new Map([['maps/cave.png', png(700, 700)], ['art/ana.webp', png(4, 4)]]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is no map view and has no store', () => {
    const leaf = deferredLeaf() as unknown as WorkspaceLeaf;
    expect(mapViewOf(leaf)).toBeNull();
    expect(sceneStoreOf(leaf)).toBeNull();
  });

  it('shares nothing while a table resumes beside it, and its scene once it is loaded', async () => {
    const tab = atlasTab(cave());
    tab.view.renderer = fakeAtlasTab({ state: () => tab.store.getState(), source: GENERIC_SOURCE, bounds: { width: 1400, height: 1400 }, grid: () => ({ size: GRID_SIZE }) }).renderer;
    const leaf = deferredLeaf();
    workspace.leaves = [leaf as unknown as WorkspaceLeaf];
    present(tab);
    const relay = new FakeRelay();
    const online = new OnlineControl(app, boundOwnership(PLAYERS, ASSIGNMENTS), fakeCampaigns(PLAYERS, ASSIGNMENTS), undefined, storedAccount(), undefined, undefined, relay.open);
    let failure: unknown = null;
    void online.resume(SAVED).catch((reason: unknown) => (failure = reason));
    await advance(0);
    relay.outbox.welcome(PLAYERS);
    await advance(3_000);
    const scenes = (): string[] => relay.pages.of(ANA).all().filter((body) => body.t === 'scene').map((body) => JSON.stringify(body));
    const tokenLists = (): number => relay.pages.of(ANA).all().filter((body) => body.t === 'tokens').length;
    expect(failure).toBeNull();
    expect(scenes().at(-1)).toBe(NO_SCENE);
    expect(tokenLists()).toBe(0);

    leaf.view = tab.view;
    await advance(3_000);
    online.stop();
    expect(scenes().at(-1)).not.toBe(NO_SCENE);
    expect(scenes().at(-1)).toContain('"scene":{');
    expect(tokenLists()).toBeGreaterThan(0);
  });
});
