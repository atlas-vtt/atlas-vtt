import { describe, expect, it } from 'vitest';
import { checkAbilityEdit } from '../../../../src/app/online/gm/book/abilityEdit.ts';
import { abilityLink, plainAbilityName } from '../../../../src/app/online/gm/book/abilityLinks.ts';
import type { EditInputs } from '../../../../src/app/online/gm/book/statblockChecks.ts';
import { drawnStatblock } from '../../../../src/app/online/gm/book/statblockSheet.ts';
import { storedRead } from '../../../../src/app/online/gm/book/statblockSheets.ts';
import type { AbilityEntry, AbilityInput, BookStatblock } from '../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { resolvedOf } from './statblockSheet/sheetKit';
import { propertiesOf, templateOf } from './statblockNotes.ts';

describe('an ability name that links', () => {
  it('reads as the words it shows', () => {
    expect(plainAbilityName('**[Chill Touch](#Chill%20Touch)**')).toBe('Chill Touch');
    expect(plainAbilityName('[[Spells/Eldritch Blast#Blast|Eldritch Blast]]')).toBe('Eldritch Blast');
    expect(plainAbilityName('_[[Crimson Rite]]_')).toBe('Crimson Rite');
    expect(plainAbilityName('Sneak_Attack 2*3*4')).toBe('Sneak_Attack 2*3*4');
  });

  it('names its heading or note only where the name is the link alone', () => {
    expect(abilityLink('**[Chill Touch](#Chill%20Touch)**')).toBe('#Chill Touch');
    expect(abilityLink('[[Spells/Eldritch Blast#Blast|Eldritch Blast]]')).toBe('Spells/Eldritch Blast#Blast');
    expect(abilityLink('Uses [[Crimson Rite]] twice')).toBeNull();
    expect(abilityLink('[Rules](https://example.com/rite)')).toBeNull();
    expect(abilityLink('Unarmed Strike')).toBeNull();
  });
});

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'actions', label: 'Actions', type: 'entries' },
];
const TEMPLATE: StatblockTemplate = templateOf(FIELDS, [{ id: 'actions0', type: 'entries', field: 'actions' }]);
const RITE = '**[Crimson Rite](#Crimson%20Rite)**';
const NOTE = [
  '---', 'statblock: true', 'atlas-template: test-template-abc123', 'name: Ana', 'actions:',
  `  - name: "${RITE}"`, '  - name: "[[Chill Touch]]"', '    desc: Its own words.', '---', '',
].join('\n');
const fields = propertiesOf(NOTE) ?? {};
const resolved = resolvedOf(TEMPLATE, fields);
const LINKED: Record<string, string> = { '#Crimson Rite': 'Your weapon burns with a rite of blood.', 'Chill Touch': 'Ignored: the ability has words of its own.' };

const drawn = async (): Promise<BookStatblock> => (await drawnStatblock({ resolved, definitions: [], resources: undefined, readLink: async (link) => LINKED[link] ?? null })).statblock!;
const entries = (statblock: BookStatblock): readonly AbilityEntry[] => statblock.abilities[0]?.tabs[0]?.entries ?? [];

describe('an ability whose name links, as its player is sent it', () => {
  it('shows the plain name and the text the link names where it has none of its own', async () => {
    const [rite, touch] = entries(await drawn());
    expect(rite).toMatchObject({ name: 'Crimson Rite', text: { opening: LINKED['#Crimson Rite'] } });
    expect(touch).toMatchObject({ name: 'Chill Touch', text: { opening: 'Its own words.' } });
  });

  it('carries the name as written and no text, so saving it keeps the link', async () => {
    const sent = await drawn();
    const rite = entries(sent)[0]!;
    expect(rite.written).toEqual({ name: RITE, text: { opening: '' } });
    const inputs: EditInputs = { resolved, sent, read: (field) => storedRead(fields, field) };
    const edit = (entry: AbilityInput, op: 'edit' | 'add' = 'edit') =>
      checkAbilityEdit(inputs, op === 'edit' ? { t: 'book-ability', op, list: 'actions', key: rite.key, entry } : { t: 'book-ability', op, list: 'actions', after: null, entry });
    expect(edit({ name: RITE, text: '', parts: {} })?.patches).toEqual([]);
    expect(edit({ name: RITE, text: 'Burns twice.', parts: {} })).not.toBeNull();
    expect(edit({ name: 'Crimson Rite', text: '', parts: {} })).not.toBeNull();
  });

  it('never lets a player write a link, which would show them the note it names', async () => {
    const sent = await drawn();
    const rite = entries(sent)[0]!;
    const inputs: EditInputs = { resolved, sent, read: (field) => storedRead(fields, field) };
    expect(checkAbilityEdit(inputs, { t: 'book-ability', op: 'edit', list: 'actions', key: rite.key, entry: { name: '[[GM Secrets]]', text: '', parts: {} } })).toBeNull();
    expect(checkAbilityEdit(inputs, { t: 'book-ability', op: 'add', list: 'actions', after: null, entry: { name: '[x](#Plans)', text: '', parts: {} } })).toBeNull();
  });
});
