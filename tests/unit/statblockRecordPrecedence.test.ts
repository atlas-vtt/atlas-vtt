// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createInMemoryApp, parseFrontmatter } from '../mocks/inMemoryVault';
import { readStatblockRecord } from '../../src/app/statblocks/resolve/statblockRecord';

const SRD_GOBLIN = { name: 'Goblin', source: '5e SRD', hp: 7, ac: 15, stats: [8, 14, 10, 10, 8, 8] };

function vault(files: Record<string, string>): ReturnType<typeof createInMemoryApp>['app'] {
  const made = createInMemoryApp({ files });
  // The notes' properties, as Obsidian's metadata cache reads them
  made.app.metadataCache.getFileCache = (file) => ({ frontmatter: parseFrontmatter(made.files.get(file.path) ?? '') });
  return made.app;
}

afterEach(() => {
  delete (window as Window & { FantasyStatblocks?: unknown }).FantasyStatblocks;
});

describe('a statblock note\'s values, where the note\'s properties and its statblock name the same key', () => {
  it('keeps a note\'s own values where it holds no statblock but shares a bestiary creature\'s name', async () => {
    // The SRD's Goblin is found by the note's name (the resolver calls such a creature a fence)
    Object.assign(window, { FantasyStatblocks: {
      isResolved: () => true, hasCreature: (name: string) => name === 'Goblin', getCreatureFromBestiary: () => SRD_GOBLIN, getBestiaryCreatures: () => [SRD_GOBLIN],
    } });
    const app = vault({ 'npcs/Goblin.md': '---\nname: Grek\nhp: 20\n---\nA goblin of the hills.\n' });
    const read = await readStatblockRecord(app, 'npcs/Goblin.md');
    expect(read?.record).toMatchObject({ name: 'Grek', hp: '20', ac: 15 });
  });

  it('reads a fence\'s own values over the note\'s properties', async () => {
    const app = vault({ 'npcs/Goblin.md': '---\nstatblock: inline\nhp: see below\ntags: [monster]\n---\n```statblock\nname: Goblin\nhp: 7\n```\n' });
    const read = await readStatblockRecord(app, 'npcs/Goblin.md');
    expect(read?.record).toMatchObject({ name: 'Goblin', hp: 7, tags: '[monster]' });
    expect(read?.fantasy).toBe(true);
  });

  it('reads a frontmatter statblock\'s properties over the bestiary\'s copy', async () => {
    const goblin = { ...SRD_GOBLIN, path: 'npcs/Goblin.md', hp: 5 };
    Object.assign(window, { FantasyStatblocks: { isResolved: () => true, hasCreature: () => true, getBestiaryCreatures: () => [goblin] } });
    const app = vault({ 'npcs/Goblin.md': '---\nstatblock: true\nname: Goblin\nhp: 9\n---\n' });
    expect((await readStatblockRecord(app, 'npcs/Goblin.md'))?.record).toMatchObject({ hp: '9' });
  });
});
