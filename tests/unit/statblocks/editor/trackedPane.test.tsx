// @vitest-environment jsdom
import { act, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { NOTE_PATH, renderPane, type PaneHarness } from './paneKit';

const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'pc-k7m2qa',
  fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'armor', label: 'Armor', type: 'number', tracks: { counts: 'up' } },
  ],
  layout: { maxColumns: 1, blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }, { id: 'metric01', type: 'metric', fields: ['armor'] }] },
};

// The same number shown as a track of boxes
const AS_BOXES: StatblockTemplate = {
  ...TEMPLATE,
  layout: { maxColumns: 1, blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }, { id: 'track001', type: 'track', field: 'armor', look: 'boxes', counts: 'up' }] },
};

const library = vi.hoisted(() => ({ tokens: [] as unknown[] }));
const place = vi.hoisted(() => ({ kept: true }));
const writeCharacterResources = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => library.tokens,
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});
vi.mock('../../../../src/app/react/hooks/useExperimentalFeature', () => ({ useExperimentalFeature: () => true }));
vi.mock('../../../../src/app/recovery/characterRest', () => {
  const character = { id: 'mira', name: 'Mira', resources: [], conditions: [], fields: new Map(), resourceValue: () => undefined, conditionValue: () => null, fieldValue: () => undefined, lookup: () => undefined };
  const rest = { character, holds: [], resourcePlace: () => (place.kept ? { kind: 'party', campaignId: 'camp' } : null) };
  return { characterRestOf: () => rest, characterRest: () => (library.tokens.length > 0 ? rest : null) };
});
vi.mock('../../../../src/app/recovery/restWrites', () => ({ writeCharacterResources }));

const MIRA = { id: 'mira', type: 'token', name: 'Mira', imagePath: 'mira.webp', tags: [], collection: 'campaign', createdAt: 1, modifiedAt: 1, playerCharacter: true, statblockPath: NOTE_PATH };

const apps: App[] = [];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  library.tokens = [];
  place.kept = true;
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

async function pane(template: StatblockTemplate = TEMPLATE): Promise<PaneHarness> {
  vi.spyOn(TemplateLibrary.prototype, 'get').mockReturnValue({ template, name: 'PC', status: 'ok', builtIn: false, path: 'Templates/PC.atlastemplate' });
  const harness = await renderPane({ frontmatter: { statblock: true, 'atlas-template': template.id, name: 'Mira', armor: 4 } });
  apps.push(harness.app);
  return harness;
}

const stepper = (harness: PaneHarness): HTMLElement | null => harness.result.container.querySelector<HTMLElement>('.atlas-sb-tracked__stepper');

describe('a tracked number beside a player character\'s note', () => {
  it('steps the character\'s current value, never the note', async () => {
    library.tokens = [MIRA];
    const harness = await pane();
    expect(stepper(harness)?.textContent).toContain('0 / 4');
    await act(async () => { fireEvent.click(harness.result.getByRole('button', { name: 'Increase Armor' })); });
    expect(writeCharacterResources).toHaveBeenCalledWith(harness.app, expect.anything(), new Map([['armor', { current: 1, max: 4 }]]));
    expect(harness.writer.patches()).toEqual([]);
  });

  it('steps nothing below 0, nor where nothing keeps the character\'s values', async () => {
    library.tokens = [MIRA];
    const harness = await pane();
    await act(async () => { fireEvent.click(harness.result.getByRole('button', { name: 'Decrease Armor' })); });
    expect(writeCharacterResources).not.toHaveBeenCalled();
    cleanup();
    place.kept = false;
    const nowhere = await pane();
    const [, more] = [...nowhere.result.container.querySelectorAll<HTMLElement>('.atlas-sb-tracked__step')];
    expect(more?.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { fireEvent.click(more!); });
    expect(writeCharacterResources).not.toHaveBeenCalled();
  });

  it('shows no stepper on a note no player character links', async () => {
    const harness = await pane();
    expect(stepper(harness)).toBeNull();
    expect(harness.result.container.textContent).toContain('0 / 4');
  });
});

describe('a tracked number shown as boxes beside a player character\'s note', () => {
  const boxes = (harness: PaneHarness): HTMLElement[] => [...harness.result.container.querySelectorAll<HTMLElement>('.atlas-sb-track-box')];

  it('sets the character\'s current value up to the box pressed, and a press on the last one marked takes it back', async () => {
    library.tokens = [MIRA];
    const harness = await pane(AS_BOXES);
    expect(boxes(harness)).toHaveLength(4);
    await act(async () => { fireEvent.click(harness.result.getByRole('button', { name: 'Armor 3 of 4' })); });
    expect(writeCharacterResources).toHaveBeenLastCalledWith(harness.app, expect.anything(), new Map([['armor', { current: 3, max: 4 }]]));
    expect(harness.writer.patches()).toEqual([]);
    // No value was kept yet, so the track still shows none marked: the first box marks one
    await act(async () => { fireEvent.click(harness.result.getByRole('button', { name: 'Armor 1 of 4' })); });
    expect(writeCharacterResources).toHaveBeenLastCalledWith(harness.app, expect.anything(), new Map([['armor', { current: 1, max: 4 }]]));
    expect(harness.result.container.querySelector('.atlas-sb-pane-editor')).toBeNull();
  });

  it('shows the maximum before the boxes, where a click edits it', async () => {
    library.tokens = [MIRA];
    const harness = await pane(AS_BOXES);
    const max = harness.result.container.querySelector<HTMLElement>('.atlas-sb-track-max');
    expect(max?.textContent).toBe('4');
    await act(async () => { fireEvent.click(max!); });
    expect(harness.result.container.querySelector('.atlas-sb-pane-editor input')).not.toBeNull();
  });

  it('draws boxes to look at, not to press, beside a note no player character links', async () => {
    const harness = await pane(AS_BOXES);
    expect(boxes(harness).map((box) => box.tagName)).toEqual(['SPAN', 'SPAN', 'SPAN', 'SPAN']);
    expect(harness.result.container.querySelector('.atlas-sb-track-max')?.textContent).toBe('4');
  });
});
