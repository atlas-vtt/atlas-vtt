import { describe, expect, it } from 'vitest';
import { checkAbilityEdit } from '../../../../src/app/online/gm/book/abilityEdit.ts';
import type { EditInputs } from '../../../../src/app/online/gm/book/statblockChecks.ts';
import { drawnStatblock, statblockSheet } from '../../../../src/app/online/gm/book/statblockSheet.ts';
import { storedRead } from '../../../../src/app/online/gm/book/statblockSheets.ts';
import { MAX_SHEET_TEXT, parseBookStatblock, type AbilityEntry, type BookStatblock } from '../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { fakeStoring } from './fakeStoring.ts';
import { resolvedOf } from './statblockSheet/sheetKit';
import { propertiesOf, templateOf } from './statblockNotes.ts';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex'] },
  { key: 'actions', label: 'Actions', type: 'entries', entry: { extras: [{ key: 'roll', label: 'Roll', type: 'dice' }] } },
];
const TEMPLATE: StatblockTemplate = templateOf(FIELDS, [
  { id: 'stats000', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)' }] },
  { id: 'actions0', type: 'entries', field: 'actions' },
]);
const LONG = `${'The blade sings. '.repeat(30)}It hits for @str.mod more.`;
const NOTE = [
  '---', 'statblock: true', 'atlas-template: test-template-abc123', 'name: Ana', 'stats: [16, 12]', 'actions:',
  '  - name: Slash +@str.mod', '    roll: 1d8+@str.mod', '    desc: Hits for @str.mod damage.',
  '  - name: Kick', '    roll: 1d4', '    desc: A plain kick.',
  `  - name: Song`, `    desc: ${LONG}`, '---', '',
].join('\n');

const fields = propertiesOf(NOTE) ?? {};
const resolved = resolvedOf(TEMPLATE, fields);
const drawn = (template: StatblockTemplate = TEMPLATE): BookStatblock => statblockSheet({ resolved: resolvedOf(template, fields), definitions: [], resources: undefined })!;
const entries = (statblock: BookStatblock): readonly AbilityEntry[] => statblock.abilities[0]?.tabs[0]?.entries ?? [];

describe('an ability a player edits, as their page is sent it', () => {
  it('shows its references filled in and carries only what differs as the note writes it', () => {
    const [slash, kick] = entries(drawn());
    expect(slash).toMatchObject({ name: 'Slash +3', text: { opening: 'Hits for 3 damage.' }, parts: { roll: '1d8+3' } });
    expect(slash?.written).toEqual({ name: 'Slash +@str.mod', text: { opening: 'Hits for @str.mod damage.' }, parts: { roll: '1d8+@str.mod' } });
    expect(kick?.written).toBeUndefined();
  });

  it('carries a long text as written by its stored id too, and its opening alone where the store does not keep it', async () => {
    const { statblock, texts } = await drawnStatblock({ resolved, definitions: [], resources: undefined }, fakeStoring());
    const song = statblock === null ? undefined : entries(statblock)[2];
    expect(song?.written?.text?.opening.length).toBeLessThanOrEqual(MAX_SHEET_TEXT);
    const hash = song?.written?.text?.whole?.hash;
    expect(hash).toBeDefined();
    expect(song?.written?.text?.whole?.id).toMatch(/^[0-9a-f]{64}$/);
    expect(new TextDecoder().decode(texts.find((text) => text.ref.hash === hash)?.bytes)).toBe(LONG);

    const unstored = await drawnStatblock({ resolved, definitions: [], resources: undefined }, fakeStoring(() => true));
    const opening = unstored.statblock === null ? undefined : entries(unstored.statblock)[2];
    expect(opening?.written?.text).toEqual({ opening: song?.written?.text?.opening });
    expect(unstored.texts).toEqual([]);
  });

  it('travels as the page reads it, and not with a list the player only reads', () => {
    const statblock = drawn();
    expect(parseBookStatblock(statblock)).toEqual(statblock);
    expect(entries(drawn({ ...TEMPLATE, players: { actions: 'read' } }))[0]?.written).toBeUndefined();
  });

  it('is saved unchanged from what was written without touching the note', () => {
    const sent = drawn();
    const slash = entries(sent)[0]!;
    const inputs: EditInputs = { resolved, sent, read: (field) => storedRead(fields, field) };
    const written = { name: slash.written?.name ?? slash.name, text: slash.written?.text?.opening ?? '', parts: { ...slash.parts, ...slash.written?.parts } };
    expect(checkAbilityEdit(inputs, { t: 'book-ability', op: 'edit', list: 'actions', key: slash.key, entry: written })?.patches).toEqual([]);
  });
});
