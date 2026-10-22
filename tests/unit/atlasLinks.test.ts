// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, type EditorSuggestContext, type EmbedContext, type EmbedCreator, type Plugin } from 'obsidian';
import { findByLinkName, isEncounterPath, linkSafeName, snapshotNameOfSubpath } from '../../src/app/links/atlasLinkTargets';
import { atlasLink } from '../../src/app/links/atlasLinkText';
import { SnapshotLinkSuggest, registerSnapshotLinkSuggest } from '../../src/app/links/SnapshotLinkSuggest';
import { registerAtlasLinks } from '../../src/app/links/registerAtlasLinks';
import { SceneEmbed } from '../../src/app/links/SceneEmbed';
import { EncounterEmbed } from '../../src/app/links/EncounterEmbed';
import { SceneSnapshotService } from '../../src/app/snapshots/SceneSnapshotService';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { AssetService } from '../../src/app/services/AssetService';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const ENCOUNTER_PATH = 'atlas-vtt/collections/c/encounters/encounter-1-abc.json';

afterEach(() => {
  AssetService.resetInstance();
});

describe('link names', () => {
  it('reads the characters a link cannot hold as spaces', () => {
    expect(linkSafeName('Before [the] fight #2 | ^x')).toBe('Before the fight 2 x');
  });

  it('reads the snapshot a subpath names, but no block reference', () => {
    expect(snapshotNameOfSubpath('#Before the fight')).toBe('Before the fight');
    expect(snapshotNameOfSubpath('#^block')).toBeNull();
    expect(snapshotNameOfSubpath('')).toBeNull();
    expect(snapshotNameOfSubpath('#  ')).toBeNull();
  });

  it('finds a name as written first, else ignoring case', () => {
    const items = ['Ambush', 'ambush', 'Camp #1'];
    expect(findByLinkName(items, 'ambush', (item) => item)).toBe('ambush');
    expect(findByLinkName(items, 'AMBUSH', (item) => item)).toBe('Ambush');
    expect(findByLinkName(items, 'Camp 1', (item) => item)).toBe('Camp #1');
    expect(findByLinkName(items, 'Camp', (item) => item)).toBeNull();
  });

  it('knows encounter files by their place in a collection', () => {
    expect(isEncounterPath(ENCOUNTER_PATH)).toBe(true);
    expect(isEncounterPath('atlas-vtt/collections/c/encounters/Bosses/e.json')).toBe(true);
    expect(isEncounterPath('atlas-vtt/collections/c/scenes/s.json')).toBe(false);
    expect(isEncounterPath('notes/encounters/e.json')).toBe(false);
  });
});

describe('atlasLink', () => {
  it("names encounters by their name and snapshots after the scene's #", () => {
    const generate = vi.fn((file: TFile, _source: string, subpath?: string, alias?: string) => `[[${file.path}${subpath ?? ''}${alias ? `|${alias}` : ''}]]`);
    const app = { fileManager: { generateMarkdownLink: generate } } as never;
    expect(atlasLink(app, new TFile(ENCOUNTER_PATH), 'Notes/a.md', { name: 'Goblin [ambush]' }))
      .toBe(`[[${ENCOUNTER_PATH}|Goblin ambush]]`);
    expect(atlasLink(app, new TFile(MAP_PATH), '', { name: 'Cave', snapshot: 'Before #2' })).toBe(`[[${MAP_PATH}#Before 2]]`);
  });
});

interface FakeEditor {
  getLine: (line: number) => string;
  replaceRange: ReturnType<typeof vi.fn>;
  setCursor: ReturnType<typeof vi.fn>;
}

function fakeEditor(line: string): FakeEditor {
  return { getLine: () => line, replaceRange: vi.fn(), setCursor: vi.fn() };
}

describe('snapshot link suggestions', () => {
  async function sceneWithSnapshots(): Promise<SnapshotLinkSuggest> {
    const vault = createInMemoryApp({ files: { [MAP_PATH]: JSON.stringify({ version: 4, state: { mapPath: MAP_PATH } }), 'Notes/a.md': '' } });
    await AssetService.getInstance(vault.app).initialize();
    const service = new SceneSnapshotService(vault.app);
    const scene = (await AssetService.getInstance(vault.app).getAssets(undefined, 'scene'))[0]!;
    await service.create(sceneSnapshotFolder('c', scene.id), new TFile(MAP_PATH), 'Before the fight', null);
    await service.create(sceneSnapshotFolder('c', scene.id), new TFile(MAP_PATH), 'After the fight', null);
    return new SnapshotLinkSuggest(vault.app as never);
  }

  it('triggers after the # of a link to a scene only', async () => {
    const suggest = await sceneWithSnapshots();
    const file = new TFile('Notes/a.md');
    const sceneLink = 'See ![[Cave.atlasmap#Bef';
    expect(suggest.onTrigger({ line: 0, ch: sceneLink.length }, fakeEditor(sceneLink) as never, file))
      .toEqual({ start: { line: 0, ch: sceneLink.length - 3 }, end: { line: 0, ch: sceneLink.length }, query: 'Bef' });
    const noteLink = '[[a#Bef';
    expect(suggest.onTrigger({ line: 0, ch: noteLink.length }, fakeEditor(noteLink) as never, file)).toBeNull();
  });

  it("lists the scene's snapshots and completes the link with the chosen one", async () => {
    const suggest = await sceneWithSnapshots();
    const line = 'See ![[Cave.atlasmap#fight]] now';
    const ch = line.indexOf(']]');
    const editor = fakeEditor(line);
    const trigger = suggest.onTrigger({ line: 0, ch }, editor as never, new TFile('Notes/a.md'))!;
    const context = { ...trigger, editor, file: null } as unknown as EditorSuggestContext;

    const suggestions = await suggest.getSuggestions(context);
    expect(suggestions.map((suggestion) => suggestion.name).sort()).toEqual(['After the fight', 'Before the fight']);

    suggest.context = context;
    suggest.selectSuggestion(suggestions.find((suggestion) => suggestion.name === 'Before the fight')!);
    expect(editor.replaceRange).toHaveBeenCalledWith('[[Cave.atlasmap#Before the fight]]', { line: 0, ch: 5 }, { line: 0, ch: ch + 2 });
    expect(editor.setCursor).toHaveBeenCalledWith({ line: 0, ch: 5 + '[[Cave.atlasmap#Before the fight]]'.length });
  });

  it("is asked before Obsidian's own link suggester", () => {
    const builtIn = { name: 'link suggest' };
    const suggests: unknown[] = [builtIn];
    const plugin = {
      app: { workspace: { editorSuggest: { suggests } } },
      registerEditorSuggest: (suggest: unknown) => suggests.push(suggest),
    } as unknown as Plugin;
    registerSnapshotLinkSuggest(plugin);
    expect(suggests[0]).toBeInstanceOf(SnapshotLinkSuggest);
    expect(suggests[1]).toBe(builtIn);
  });
});

describe('embeds', () => {
  function fakePlugin(registered: string[] = []): { plugin: Plugin; creators: Map<string, EmbedCreator>; unload: () => void } {
    const creators = new Map<string, EmbedCreator>();
    const cleanups: Array<() => void> = [];
    const embedRegistry = {
      isExtensionRegistered: (extension: string) => registered.includes(extension) || creators.has(extension),
      registerExtension: (extension: string, creator: EmbedCreator) => creators.set(extension, creator),
      unregisterExtension: (extension: string) => creators.delete(extension),
    };
    const plugin = {
      app: { embedRegistry, workspace: {} },
      register: (cleanup: () => void) => cleanups.push(cleanup),
      registerEditorSuggest: vi.fn(),
      addCommand: vi.fn(),
    } as unknown as Plugin;
    return { plugin, creators, unload: () => cleanups.forEach((cleanup) => cleanup()) };
  }

  const context = (): EmbedContext => ({ app: {} as never, containerEl: document.createElement('div'), linktext: '', sourcePath: '', depth: 0 });

  it('shows scenes and encounter files, and leaves other JSON files to Obsidian', () => {
    const { plugin, creators, unload } = fakePlugin();
    registerAtlasLinks(plugin);

    expect(creators.get('atlasmap')?.(context(), new TFile(MAP_PATH), '#Snap')).toBeInstanceOf(SceneEmbed);
    expect(creators.get('json')?.(context(), new TFile(ENCOUNTER_PATH), '')).toBeInstanceOf(EncounterEmbed);
    expect(creators.get('json')?.(context(), new TFile('data/config.json'), '')).toBeNull();

    unload();
    expect(creators.size).toBe(0);
  });

  it('leaves an extension another plugin already shows alone', () => {
    const { plugin, creators } = fakePlugin(['json']);
    registerAtlasLinks(plugin);
    expect([...creators.keys()]).toEqual(['atlasmap']);
  });
});
