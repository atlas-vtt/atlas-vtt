import { describe, expect, it } from 'vitest';
import {
  indexTemplateFiles,
  isTemplatePath,
  listTemplates,
  movedTemplateFile,
  readTemplateFile,
  templateName,
} from '../../../../src/app/statblocks/library/templateFiles';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';
import { withHeader } from '../../../../src/app/statblocks/model/headerDuplicates';
import { MARSH_ID, MARSH_PATH, libraryEntry, marshText } from './templateTexts';

describe('template files', () => {
  it('names a template after its file', () => {
    expect(templateName(MARSH_PATH)).toBe('Marsh creature');
    expect(templateName('Top level.atlastemplate')).toBe('Top level');
    expect(templateName('a/v1.2 notes.atlastemplate')).toBe('v1.2 notes');
    expect(isTemplatePath(MARSH_PATH)).toBe(true);
    expect(isTemplatePath('a/notes.md')).toBe(false);
  });

  it('reads a file into what the library hands out, and moves it without reading it again', () => {
    const file = readTemplateFile(MARSH_PATH, marshText());
    expect(file).toMatchObject({ path: MARSH_PATH, name: 'Marsh creature', status: 'ok', problems: [] });
    expect(file.entry).toEqual({ template: withHeader(MARSH_CREATURE), name: 'Marsh creature', status: 'ok', builtIn: false, path: MARSH_PATH });

    const moved = movedTemplateFile(file, 'Elsewhere/Bog.atlastemplate');
    expect(moved).toMatchObject({ name: 'Bog', path: 'Elsewhere/Bog.atlastemplate', text: file.text });
    expect(moved.entry).toMatchObject({ name: 'Bog', path: 'Elsewhere/Bog.atlastemplate' });
    expect(moved.entry?.template).toBe(file.entry?.template);
  });

  it('gives no entry for a file that is no template', () => {
    expect(readTemplateFile('x.atlastemplate', '[]')).toMatchObject({ status: 'invalid', entry: null });
  });

  it('lets the lowest path by code units hold an id, so every machine agrees', () => {
    const lower = readTemplateFile('B/Copy.atlastemplate', marshText());
    const higher = readTemplateFile('a/Marsh creature.atlastemplate', marshText());
    const index = indexTemplateFiles([higher, lower]);
    expect(index.byId.get(MARSH_ID)).toBe(lower.entry);
    expect(index.duplicates).toEqual(new Map([['a/Marsh creature.atlastemplate', 'B/Copy.atlastemplate']]));
  });

  it('lists built-ins first, then templates by name', () => {
    const marsh = libraryEntry({ ...MARSH_CREATURE, id: 'marsh-aaaaaa' }, 'Marsh 10');
    const second = libraryEntry({ ...MARSH_CREATURE, id: 'marsh-bbbbbb' }, 'marsh 9');
    const builtIn = { ...libraryEntry({ ...MARSH_CREATURE, id: 'builtin:z' }, 'Zed'), builtIn: true, path: null };
    const index = { byId: new Map([[marsh.template.id, marsh], [second.template.id, second]]), duplicates: new Map() };
    expect(listTemplates([builtIn], index).map((entry) => entry.name)).toEqual(['Zed', 'marsh 9', 'Marsh 10']);
  });
});
