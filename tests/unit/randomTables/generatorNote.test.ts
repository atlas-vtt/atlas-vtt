import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { TFile } from 'obsidian';
import type { TableResult } from '../../../src/app/loot/lootHistory';
import { generatorNoteText, saveTagsOf } from '../../../src/app/randomTables/generatorNote';
import { saveGeneratorNote } from '../../../src/app/randomTables/saveGeneratorNote';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const RESULT: TableResult = {
  id: 'r',
  source: ['Weapons', 'Magic Weapon'],
  notePath: 'Generators/Weapons.md',
  text: '+1 Longsword',
  fields: [
    { label: 'Type', value: 'Longsword', row: 1 },
    { label: 'Bonus', value: '+1', row: 2 },
    { label: 'Special Benefit', value: 'Glows near [[Goblins]]', row: 3 },
    { label: 'Name', value: 'not the name', row: 4 },
  ],
  generator: { path: 'Generators/Weapons.md', index: 0 },
};

function frontmatterOf(text: string): unknown {
  const end = text.indexOf('\n---', 4);
  return parse(text.slice(4, end));
}

describe('a result as a note', () => {
  it('has its name and one key per part in frontmatter, and the parts as paragraphs', () => {
    const text = generatorNoteText(RESULT);
    expect(frontmatterOf(text)).toEqual({ name: '+1 Longsword', type: 'Longsword', bonus: '+1', special_benefit: 'Glows near [[Goblins]]' });
    expect(text.slice(text.indexOf('\n---', 4) + 4)).toBe(
      '\n\n**Type.** Longsword\n\n**Bonus.** +1\n\n**Special Benefit.** Glows near [[Goblins]]\n\n**Name.** not the name\n',
    );
  });

  it('takes the generator\'s save tags, one or a list, `#` left out', () => {
    expect(saveTagsOf({ 'atlas-save-tags': ['#loot', 'magic-weapon', 3, ''] })).toEqual(['loot', 'magic-weapon']);
    expect(saveTagsOf({ 'atlas-save-tags': 'loot' })).toEqual(['loot']);
    expect(saveTagsOf({ tags: ['generator'] })).toEqual([]);
    const text = generatorNoteText({ ...RESULT, fields: [...RESULT.fields, { label: 'Tags', value: 'mine' }] }, ['loot']);
    expect(frontmatterOf(text)).toMatchObject({ tags: ['loot'] });
  });
});

describe('saving a result as a note', () => {
  it('writes into the save folder under the result\'s name, numbered where taken, never over a file', async () => {
    const { app, files } = createInMemoryApp({
      files: { 'Generators/Weapons.md': '---\natlas-save-tags: loot\n---\n', 'Loot/Weapons/+1 Longsword.md': 'mine' },
    });
    app.metadataCache.getFileCache = (file: TFile) => (file.path === 'Generators/Weapons.md' ? { frontmatter: { 'atlas-save-tags': ['loot'] } } : null);

    const first = await saveGeneratorNote(app, RESULT, 'Loot/Weapons');
    const second = await saveGeneratorNote(app, RESULT, 'Loot/Weapons');
    expect([first.path, second.path]).toEqual(['Loot/Weapons/+1 Longsword 2.md', 'Loot/Weapons/+1 Longsword 3.md']);
    expect(files.get('Loot/Weapons/+1 Longsword.md')).toBe('mine');
    expect(frontmatterOf(files.get(first.path)!)).toMatchObject({ name: '+1 Longsword', tags: ['loot'] });
  });

  it('creates the folder, and names a file of characters a file cannot carry', async () => {
    const { app, files } = createInMemoryApp({ files: {} });
    const file = await saveGeneratorNote(app, { ...RESULT, text: 'Sword: "Dawn/Dusk"' }, 'New folder');
    expect(file.path).toBe('New folder/Sword- -Dawn-Dusk-.md');
    expect(files.has(file.path)).toBe(true);
  });
});
