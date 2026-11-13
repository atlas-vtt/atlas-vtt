import { describe, expect, it } from 'vitest';
import { checkAbilityEdit } from '../../../../src/app/online/gm/book/abilityEdit.ts';
import { abilityLink, plainAbilityName } from '../../../../src/app/online/gm/book/abilityLinks.ts';
import type { EditInputs } from '../../../../src/app/online/gm/book/statblockChecks.ts';
import { drawnStatblock } from '../../../../src/app/online/gm/book/statblockSheet.ts';
import { storedRead } from '../../../../src/app/online/gm/book/statblockSheets.ts';
import { MAX_BOOK_TITLE, parseBookStatblock, type AbilityEntry, type AbilityInput, type BookStatblock } from '../../../../src/app/online/protocol/index.ts';
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

  it('reads as its words where its heading has brackets of its own', () => {
    expect(plainAbilityName('[Rage (3/day)](#Rage%20(3/day))')).toBe('Rage (3/day)');
    expect(plainAbilityName('**[Channel Divinity (2/Short Rest)](<#Channel Divinity (2/Short Rest)>)**')).toBe('Channel Divinity (2/Short Rest)');
    expect(abilityLink('[Rage (3/day)](#Rage%20(3/day))')).toBe('#Rage (3/day)');
    expect(abilityLink('**[Channel Divinity (2/Short Rest)](<#Channel Divinity (2/Short Rest)>)**')).toBe('#Channel Divinity (2/Short Rest)');
    // Brackets that do not close, and text after the link, are no link of the whole name.
    expect(abilityLink('[Rage](#Rage (3/day)')).toBeNull();
    expect(abilityLink('[Rage](#Rage) (3/day)')).toBeNull();
    expect(abilityLink('[Rage](#Rage)[Fury](#Fury)')).toBeNull();
    expect(plainAbilityName('[Rage](#Rage) (3/day)')).toBe('Rage (3/day)');
  });

  it('reads a link with a title as its words and its address alone', () => {
    expect(plainAbilityName('**[Rage](#Rage "Rage (3/day)")**')).toBe('Rage');
    expect(abilityLink('**[Rage](#Rage "Rage (3/day)")**')).toBe('#Rage');
    expect(abilityLink("[Channel Divinity](<#Channel Divinity (2/Short Rest)> 'Twice')")).toBe('#Channel Divinity (2/Short Rest)');
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

const WAVE = 'Tidal Wave of the Drowned and Forgotten Kings';
const SMITE = 'Blinding Smite of the Dawn That Never Came';
const STEP = 'Misty Step Through the Veil Between the Worlds';
const WAVE_LINK = `[${WAVE}](#${encodeURI(WAVE)})`;
const SMITE_LINK = `**[${SMITE}](#${encodeURI(SMITE)})**`;
const STEP_LINK = `[[#${STEP}|${STEP}]]`;
const WARCRY = `${'War Cry of the Ninth Legion '.repeat(4)}at Dawn`;
const LONG_NOTE = [
  '---', 'statblock: true', 'atlas-template: test-template-abc123', 'name: Ana', 'actions:',
  `  - name: "${WAVE_LINK}"`, `  - name: "${SMITE_LINK}"`, `  - name: "${STEP_LINK}"`, '  - name: "[Rage (3/day)](#Rage%20(3/day))"',
  `  - name: ${WARCRY}`, '    desc: Shouted.', '---', '',
].join('\n');
const longFields = propertiesOf(LONG_NOTE) ?? {};
const longResolved = resolvedOf(TEMPLATE, longFields);
const LONG_LINKED: Record<string, string> = { [`#${WAVE}`]: 'The sea rises.', [`#${SMITE}`]: 'The blade shines.', [`#${STEP}`]: 'You step through.', '#Rage (3/day)': 'You rage.' };
const longDrawn = async (): Promise<BookStatblock> => (await drawnStatblock({ resolved: longResolved, definitions: [], resources: undefined, readLink: async (link) => LONG_LINKED[link] ?? null })).statblock!;

describe('an ability whose name is a link longer than a line', () => {
  it('is longer than a name a page takes, as the note writes it', () => {
    for (const link of [WAVE_LINK, SMITE_LINK, STEP_LINK]) expect(link.length).toBeGreaterThan(MAX_BOOK_TITLE);
  });

  it('shows the words of the whole link and the text it names, and reads on a page', async () => {
    const sent = await longDrawn();
    expect(parseBookStatblock(JSON.parse(JSON.stringify(sent)))).toEqual(sent);
    expect(entries(sent).slice(0, 4).map((entry) => [entry.name, entry.text.opening])).toEqual([
      [WAVE, 'The sea rises.'], [SMITE, 'The blade shines.'], [STEP, 'You step through.'], ['Rage (3/day)', 'You rage.'],
    ]);
  });

  it('carries no half of the link as its written name', async () => {
    const [wave, smite, step, rage] = entries(await longDrawn());
    for (const entry of [wave, smite, step]) expect(entry?.written).toEqual({ text: { opening: '' } });
    expect(rage?.written).toEqual({ name: '[Rage (3/day)](#Rage%20(3/day))', text: { opening: '' } });
  });

  it('keeps the link in the note when its player saves the ability under the words it shows', async () => {
    const sent = await longDrawn();
    const [wave, , , , warcry] = entries(sent);
    const inputs: EditInputs = { resolved: longResolved, sent, read: (field) => storedRead(longFields, field) };
    const edit = (key: string, entry: AbilityInput) => checkAbilityEdit(inputs, { t: 'book-ability', op: 'edit', list: 'actions', key, entry });
    expect(edit(wave!.key, { name: WAVE, text: '', parts: {} })?.patches).toEqual([]);
    expect(edit(wave!.key, { name: WAVE, text: 'It drowns the hall.', parts: {} })?.patches).toEqual([
      { op: 'set', path: ['actions', 0], base: { name: WAVE_LINK }, next: { name: WAVE_LINK, desc: 'It drowns the hall.' } },
    ]);
    // Another name is the player's to give.
    expect(edit(wave!.key, { name: 'Tidal Wave', text: '', parts: {} })?.patches).toEqual([
      { op: 'set', path: ['actions', 0], base: { name: WAVE_LINK }, next: { name: 'Tidal Wave' } },
    ]);
    // A name that is no link is cut where a line ends, and written as it is sent.
    expect(warcry?.name).toBe([...WARCRY].slice(0, MAX_BOOK_TITLE).join('').trim());
    expect(edit(warcry!.key, { name: warcry!.name, text: 'Shouted.', parts: {} })?.patches).toEqual([
      { op: 'set', path: ['actions', 4], base: { name: WARCRY, desc: 'Shouted.' }, next: { name: warcry!.name, desc: 'Shouted.' } },
    ]);
  });
});
