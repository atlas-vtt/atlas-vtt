// @vitest-environment jsdom
/**
 * Statblocks that come from Fantasy Statblocks keep what they showed once an
 * Atlas template draws them: a system that keeps its level under a key of its
 * own (`tier`) has it as the header's level, and abilities written with their
 * text under `text` show it, whether the template was imported from the
 * layout or made in the template editor. The layout and the notes are written
 * for these tests.
 */

import { describe, expect, it } from 'vitest';
import { hiddenFields } from '../../../../src/app/statblocks/editor/statblock-pane/templateChoices';
import { commitLabel } from '../../../../src/app/statblocks/editor/template-editor/labelCommit';
import { fsLayoutToTemplate } from '../../../../src/app/statblocks/fs/fsLayoutToTemplate';
import type { FsLayout } from '../../../../src/app/statblocks/fs/fsLayoutTypes';
import { withHeader } from '../../../../src/app/statblocks/model/headerDuplicates';
import { headerParts, type HeaderPart } from '../../../../src/app/statblocks/model/templateHeader';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { resolveStatblockText } from '../../../../src/app/statblocks/resolve/resolveStatblockText';
import { creatureVault, forbidWrites } from '../../../mocks/creatureVault';
import { libraryEntry, lookupOf } from '../library/templateTexts';
import { blockEl, blockText, renderSheet, valueOf } from '../render/sheetTestKit';
import { template } from '../template-editor/editorKit';
import { expectParses } from './fsCodeKit';
import { outline } from './fsOutline';

const FENLAND: FsLayout = {
  name: 'Fenland foe',
  id: 'fenland-foe',
  blocks: [
    { type: 'heading', id: 'f01', properties: ['name'], size: 1 },
    {
      type: 'group', id: 'f02', properties: [], nested: [
        { type: 'property', id: 'f03', properties: ['tier'], conditioned: true, callback: 'return `${monster.tier} · ${monster.type}`;' },
        { type: 'property', id: 'f04', properties: ['dread'], display: 'Dread' },
        {
          type: 'inline', id: 'f05', properties: [], nested: [
            { type: 'traits', id: 'f06', properties: ['feats'], heading: 'Features', callback: 'return property.text;' },
          ],
        },
      ],
    },
  ],
};

/** A frontmatter statblock of the layout, given the template in place: its values as they were, a `level` of its own among them. */
function note(templateId: string, rating: string): string {
  return [
    '---', 'statblock: true', `atlas-template: ${templateId}`, 'layout: Fenland foe', 'name: Mire Stalker', rating, 'type: Lurker', 'dread: 3',
    'feats:', '  - name: Drag Under', '    text: Pulls one foe beneath the water.', '---', '',
  ].join('\n');
}

function part(source: StatblockTemplate, id: HeaderPart['id']): HeaderPart {
  return headerParts(source).find((each) => each.id === id)!;
}

/** The header's level as the card shows it: its label, then its value. */
function levelOn(container: HTMLElement): [string, string] {
  return [blockEl(container, 'header-level')?.querySelector('.atlas-sb-label')?.textContent ?? '', valueOf(container, 'header-level')];
}

/** The card of the note as every mount draws it: resolved, then drawn; nothing is written on the way. */
async function drawn(source: StatblockTemplate, text: string): Promise<{ container: HTMLElement; fields: Readonly<Record<string, unknown>>; rating: string | undefined }> {
  const { app } = creatureVault();
  const refusals = forbidWrites(app);
  const resolved = await resolveStatblockText(text, 'Bestiary/Mire Stalker.md', { app, templates: lookupOf(libraryEntry(source, 'Fenland foe')) });
  if (!resolved?.template) throw new Error('the note resolved to no template');
  const { container } = renderSheet(resolved.template, { ...resolved.fields });
  for (const refusal of refusals) expect(refusal).not.toHaveBeenCalled();
  return { container, fields: resolved.fields, rating: resolved.meanings.rating };
}

describe('a layout that keeps its level under a key of its own', () => {
  // As the library reads the imported file.
  const imported = withHeader(fsLayoutToTemplate(FENLAND, { id: 'fenland-foe-abc123' }).template);

  it('has that key as the header\'s level, and no second level beside it', () => {
    expect(part(imported, 'level')).toMatchObject({ key: 'tier', label: 'Tier', hidden: false });
    expect(part(imported, 'type')).toMatchObject({ key: 'type', hidden: false });
    expect(imported.fields.find((field) => field.key === 'tier')?.meaning).toBe('rating');
    expect(imported.fields.some((field) => field.key === 'level')).toBe(false);
    expect(hiddenFields(imported).map((field) => field.key)).not.toContain('level');
    // The line that only strung the tier and the type together stands in the header.
    expect(outline(imported.layout.blocks)).toEqual([
      'section',
      '  stat dread whenEmpty="fallback" fallback="-"',
      '  entries feats heading="Features"',
    ]);
    expectParses(imported);
  });

  it('reads each ability\'s text from the key the layout\'s own callback names, however deep the block lies', () => {
    expect(imported.fields.find((field) => field.key === 'feats')?.entry).toEqual({ textKey: 'text' });
  });

  it('draws a note of the layout with its tier, its type and its abilities\' text, and keeps the note\'s own level', async () => {
    const { container, fields, rating } = await drawn(imported, note(imported.id, 'tier: 2\nlevel: 7'));
    expect(levelOn(container)).toEqual(['Tier', '2']);
    expect(blockText(container, 'header-type')).toBe('Lurker');
    expect(container.textContent).toContain('Drag Under');
    expect(container.textContent).toContain('Pulls one foe beneath the water.');
    expect(rating).toBe('tier');
    expect(fields).toMatchObject({ tier: 2, level: 7, type: 'Lurker', dread: 3 });
  });
});

describe('a template made for such statblocks in the template editor', () => {
  const FIELDS: TemplateField[] = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'image', label: 'Token art', type: 'image' },
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
    { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
    { key: 'description', label: 'Description', type: 'markdown', meaning: 'description' },
    { key: 'traits', label: 'Traits', type: 'entries' },
  ];
  const CREATURE = template([{ id: 'ent-trts', type: 'entries', field: 'traits' }, { id: 'newent01', type: 'entries', field: '' }], FIELDS, 'creature-abc123');
  /** The keys the collection's statblocks hold. */
  const KEYS = ['name', 'tier', 'type', 'dread', 'feats'];

  it('shows the statblocks\' tier once the level is renamed Tier, and still reads a level written before', async () => {
    const renamed = commitLabel(CREATURE, 'header-level', 'Tier', KEYS).template;
    expect(part(renamed, 'level')).toMatchObject({ key: 'tier', label: 'Tier' });
    expect(renamed.fields.find((field) => field.key === 'tier')).toMatchObject({ type: 'rating', meaning: 'rating', formerKeys: ['level'] });

    expect(levelOn((await drawn(renamed, note(renamed.id, 'tier: 2'))).container)).toEqual(['Tier', '2']);
    expect(levelOn((await drawn(renamed, note(renamed.id, 'level: 4'))).container)).toEqual(['Tier', '4']);
  });

  it('shows the text of abilities an added list finds under the statblocks\' own key', async () => {
    const named = commitLabel(CREATURE, 'newent01', 'Feats', KEYS);
    expect(named.bound).toEqual({ key: 'feats', created: true, fromCollection: true });
    const { container } = await drawn(named.template, note(named.template.id, 'tier: 2'));
    expect(blockText(container, 'newent01')).toContain('Drag Under');
    expect(blockText(container, 'newent01')).toContain('Pulls one foe beneath the water.');
  });
});
