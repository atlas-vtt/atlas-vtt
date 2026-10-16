// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  parseSheetRaw,
  fitsPlayerFrame, MAX_ABILITIES, MAX_ABILITY_COMPONENTS, MAX_ABILITY_PARTS, MAX_ABILITY_TABS, MAX_FIELD_KEY, MAX_FIELD_TEXT, MAX_SHEET_CHARS, MAX_SHEET_DEPTH,
  MAX_SHEET_KEYS, MAX_SHEET_LIST, MAX_SHEET_NODES, MAX_SHEET_OPTIONS, MAX_SHEET_TEXT, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, MAX_TOKEN_VALUE, parseBookMessage,
  parseBookStatblock, parseGmMessage, parsePlayerBookMessage, parsePlayerMessage, sheetBase, sheetItemKeys,
  type AbilityComponent, type AbilityEntry, type BookStatblock, type SheetNode, type SheetRaw, type SheetValue,
} from '../../../../src/app/online/protocol/index.ts';
import { entryItemKeys } from '../../../../src/app/statblocks/values/entryKeys';
import type { FieldValue } from '../../../../src/app/statblocks/model/templateTypes';

const TEXT_REF = { hash: 'b'.repeat(64), size: 9000, mime: 'text/markdown' };
const BASE = sheetBase('30 ft.');
const plain = (opening: string, extra: Partial<SheetValue> = {}): SheetValue => ({ label: null, look: 'plain', text: { opening }, field: null, prompt: null, ...extra });
const value = (shown: SheetValue): SheetNode => ({ k: 'value', value: shown });
const entry = (name: string, extra: Partial<AbilityEntry> = {}): AbilityEntry => ({ key: sheetBase(name), name, text: { opening: '' }, parts: {}, ...extra });
const component = (extra: Partial<AbilityComponent> = {}): AbilityComponent => ({ id: 'blk1', name: 'Actions', access: 'edit', parts: [], tabs: [{ label: null, list: 'actions', entries: [] }], ...extra });
const sheet = (extra: Partial<BookStatblock> = {}): BookStatblock => ({ editable: true, displayName: null, sigils: {}, blocks: [], abilities: [], ...extra });
const nodes = (count: number, make: (index: number) => SheetNode = () => ({ k: 'divider' })): SheetNode[] => Array.from({ length: count }, (_, index) => make(index));
const nested = (depth: number): SheetNode => (depth <= 1 ? { k: 'section', heading: null, nodes: [] } : { k: 'section', heading: null, nodes: [nested(depth - 1)] });
const range = (count: number, prefix = 'o'): string[] => Array.from({ length: count }, (_, index) => `${prefix}${index}`);

const FULL: BookStatblock = sheet({
  displayName: 'Ana the Bold',
  sigils: {
    hp: plain('12', { label: 'Hit points', resource: 'hp' }),
    armor: plain('15', { label: 'Armor class', field: { key: 'ac', base: sheetBase(15), type: 'number', value: 15 } }),
    level: plain('3', { label: 'Level' }),
    type: plain('Humanoid', { label: 'Type' }),
  },
  blocks: [
    { k: 'section', heading: 'Traits', nodes: [
      { k: 'row', nodes: [value(plain('30 ft.', { label: 'Speed', field: { key: 'speed', base: BASE, type: 'text', value: '30 ft.' } }))] },
      value(plain('', { label: 'Senses', prompt: 'Add senses', field: { key: 'senses', base: sheetBase(undefined), type: 'text', value: null } })),
      value({ label: 'Languages', look: 'words', text: { opening: 'Common, Elvish' }, words: ['Common', 'Elvish'], field: null, prompt: null }),
      value({ label: 'Saves', look: 'pairs', text: { opening: 'DEX +2' }, pairs: [{ label: 'DEX', value: '+2' }], field: null, prompt: null }),
      value({ label: 'Story', look: 'markdown', text: { opening: 'Born in a', whole: TEXT_REF }, field: { key: 'story', base: sheetBase('x'), type: 'markdown', value: 'x' }, prompt: null }),
    ] },
    { k: 'tabs', heading: 'Notes', tabs: [{ label: 'One', nodes: [{ k: 'heading', text: 'Inside', minor: true }] }] },
    { k: 'metric', heading: 'Defences', values: [plain('15', { label: 'AC' }), plain('+3', { label: 'Init' })] },
    { k: 'table', label: 'Abilities', columns: ['STR', 'DEX'], rows: [['10', '14']], worked: [['+0', null], [null, '+5']], workedLabels: ['Mod', ''], field: { key: 'stats', base: sheetBase([10, 14]), type: 'scores', value: [10, 14] } },
    { k: 'track', label: 'Stress', look: 'boxes', counts: 'up', current: 2, max: 6, resource: null, field: { key: 'stress', base: sheetBase(2), type: 'number', value: 2 } },
    { k: 'track', label: 'Hope', look: 'gauge', counts: 'down', current: 1, max: 3, resource: 'hope', field: null },
    { k: 'divider' },
  ],
  abilities: [
    component({
      parts: [{ key: 'cost', label: 'Cost', type: 'choice', options: ['Action', 'Bonus action'] }, { key: 'tags', label: 'Tags', type: 'list' }, { key: 'dmg', label: 'Damage', type: 'dice' }],
      tabs: [
        { label: 'Cantrips', list: 'cantrips', intro: { opening: 'Known by heart.', whole: TEXT_REF }, entries: [entry('Light', { text: { opening: 'A torch', whole: TEXT_REF }, parts: { cost: 'Action', tags: ['evocation'] } })] },
        { label: '1st level', list: 'spells1', entries: [entry('Healing Word', { parts: { cost: 'Bonus action', dmg: '1d4' } })] },
      ],
    }),
    component({ id: 'spl2', name: 'Spells', access: 'read', spells: true, tabs: [{ label: '1st', list: 'spells', entries: [entry('Shield')] }] }),
  ],
});

describe('a statblock for a player', () => {
  it('reads every kind of node, sigil and ability, and none for a character without one', () => {
    expect(parseBookStatblock(FULL)).toEqual(FULL);
    expect(parseBookStatblock(null)).toBeNull();
    expect(parseBookStatblock(sheet({ editable: false }))).toEqual(sheet({ editable: false }));
    expect(parseBookMessage({ t: 'book-statblock', statblock: FULL })).toEqual({ t: 'book-statblock', statblock: FULL });
    expect(parseGmMessage({ t: 'book-statblock', statblock: null })).toEqual({ t: 'book-statblock', statblock: null });
  });

  it('refuses a statblock that is malformed, and the message that carries it', () => {
    for (const broken of [undefined, 'sheet', { ...FULL, editable: 'yes' }, { ...FULL, blocks: 'none' }, { ...FULL, sigils: null }, { ...FULL, abilities: {} }, { ...FULL, displayName: 7 }]) {
      expect(parseBookStatblock(broken), JSON.stringify(broken)).toBeUndefined();
    }
    expect(parseBookMessage({ t: 'book-statblock', statblock: { ...FULL, editable: 1 } })).toBeNull();
    expect(parseBookMessage({ t: 'book-statblock' })).toBeNull();
    expect(parseGmMessage({ t: 'book-statblock', statblock: 'x' })).toBeNull();
  });

  it('reads a spells component as read-only whatever it says', () => {
    const read = parseBookStatblock(sheet({ abilities: [component({ spells: true, access: 'edit' })] }));
    expect(read?.abilities[0]).toMatchObject({ access: 'read', spells: true });
  });

  it('refuses nodes, values and parts it does not know or that are malformed', () => {
    const broken: unknown[] = [
      { k: 'picture' }, { k: 'heading', text: 'x' }, { k: 'heading', text: '', minor: false },
      value({ ...plain('x'), look: 'html' as SheetValue['look'] }),
      value({ ...plain('x'), text: { opening: 'x', whole: { hash: 'z', size: 1, mime: 'text/markdown' } } }),
      value({ ...plain('x'), text: { opening: 'x', whole: { ...TEXT_REF, mime: 'image/png' } } }),
      value({ ...plain('x'), resource: '' }),
      value({ ...plain('x'), pairs: [{ label: 'DEX' }] as never }),
      { k: 'metric', heading: null, values: [] },
      { k: 'metric', heading: null, values: Array.from({ length: 7 }, () => plain('1')) },
      { k: 'track', label: null, look: 'dots', counts: 'up', current: 0, max: 1, resource: null, field: null },
      { k: 'track', label: null, look: 'boxes', counts: 'up', current: -1, max: 1, resource: null, field: null },
      { k: 'track', label: null, look: 'boxes', counts: 'up', current: 0, max: MAX_TOKEN_VALUE + 1, resource: null, field: null },
      { k: 'tabs', heading: null, tabs: [] },
      { k: 'table', label: null, columns: ['a'], rows: [['1', '2']], worked: [], field: null },
    ];
    for (const node of broken) expect(parseBookStatblock(sheet({ blocks: [node as SheetNode] })), JSON.stringify(node)).toBeUndefined();
    expect(parseBookStatblock(sheet({ blocks: [{ k: 'metric', heading: null, values: Array.from({ length: 6 }, () => plain('1')) }] }))).toBeDefined();
  });

  it('reads a table without labels for its worked-out rows and a list without an intro, as an older GM sends them, and refuses malformed ones', () => {
    const table: SheetNode = { k: 'table', label: null, columns: ['A'], rows: [['1']], worked: [['+0']], field: null };
    expect(parseBookStatblock(sheet({ blocks: [table] }))).toEqual(sheet({ blocks: [table] }));
    for (const workedLabels of [['Mod', 'Save'], [], [7], ['x'.repeat(81)]]) {
      expect(parseBookStatblock(sheet({ blocks: [{ ...table, workedLabels } as SheetNode] })), JSON.stringify(workedLabels)).toBeUndefined();
    }
    for (const intro of [null, 'Known.', { opening: 'x'.repeat(MAX_SHEET_TEXT + 1) }]) {
      expect(parseBookStatblock(sheet({ abilities: [component({ tabs: [{ label: null, list: 'a', intro, entries: [] } as never] })] })), JSON.stringify(intro)).toBeUndefined();
    }
  });

  it('cleans control characters out of lines and texts', () => {
    const read = parseBookStatblock(sheet({ displayName: 'An\u0007a', blocks: [value(plain('one\u0000two\r\nthree', { label: 'Spe‮ed' }))] }));
    expect(read?.displayName).toBe('An a');
    expect(read?.blocks[0]).toEqual(value(plain('one two\nthree', { label: 'Spe ed' })));
  });
});

describe('the limits of a statblock', () => {
  it('holds as many nodes as it may, counted at every depth, and no more', () => {
    expect(parseBookStatblock(sheet({ blocks: nodes(MAX_SHEET_NODES) }))).toBeDefined();
    expect(parseBookStatblock(sheet({ blocks: nodes(MAX_SHEET_NODES + 1) }))).toBeUndefined();
    const inSections = [{ k: 'section', heading: null, nodes: nodes(MAX_SHEET_NODES - 1) } as SheetNode];
    expect(parseBookStatblock(sheet({ blocks: inSections }))).toBeDefined();
    expect(parseBookStatblock(sheet({ blocks: [...inSections, { k: 'divider' }, { k: 'divider' }] }))).toBeUndefined();
  });

  it('nests as deep as it may and no deeper', () => {
    expect(parseBookStatblock(sheet({ blocks: [nested(MAX_SHEET_DEPTH)] }))).toBeDefined();
    expect(parseBookStatblock(sheet({ blocks: [nested(MAX_SHEET_DEPTH + 1)] }))).toBeUndefined();
  });

  it('holds as many characters of text as its budget, sigils counted, and no more', () => {
    const full = Math.floor(MAX_SHEET_CHARS / MAX_SHEET_TEXT);
    const blocks = nodes(full, () => value(plain('x'.repeat(MAX_SHEET_TEXT))));
    expect(MAX_SHEET_CHARS % MAX_SHEET_TEXT).toBe(0);
    expect(parseBookStatblock(sheet({ blocks }))).toBeDefined();
    expect(parseBookStatblock(sheet({ blocks, sigils: { hp: plain('1') } }))).toBeUndefined();
    expect(parseBookStatblock(sheet({ blocks: [...blocks, { k: 'heading', text: 'x', minor: false }] }))).toBeUndefined();
  });

  it('cuts no opening: one longer than a sheet holds is refused', () => {
    expect(parseBookStatblock(sheet({ blocks: [value(plain('x'.repeat(MAX_SHEET_TEXT)))] }))).toBeDefined();
    expect(parseBookStatblock(sheet({ blocks: [value(plain('x'.repeat(MAX_SHEET_TEXT + 1)))] }))).toBeUndefined();
  });

  it('holds as many abilities over all lists as it may and no more', () => {
    const entries = (count: number, prefix: string): AbilityEntry[] => range(count, prefix).map((name) => entry(name));
    const split = (count: number): BookStatblock => sheet({ abilities: [component({ tabs: [{ label: 'A', list: 'a', entries: entries(count - 100, 'a') }, { label: 'B', list: 'b', entries: entries(100, 'b') }] })] });
    expect(parseBookStatblock(split(MAX_ABILITIES))).toBeDefined();
    expect(parseBookStatblock(split(MAX_ABILITIES + 1))).toBeUndefined();
  });

  it('holds as many components, tabs, parts and options as it may and no more', () => {
    const components = (count: number): AbilityComponent[] => range(count, 'c').map((id) => component({ id }));
    expect(parseBookStatblock(sheet({ abilities: components(MAX_ABILITY_COMPONENTS) }))).toBeDefined();
    expect(parseBookStatblock(sheet({ abilities: components(MAX_ABILITY_COMPONENTS + 1) }))).toBeUndefined();
    const tabs = (count: number): AbilityComponent => component({ tabs: range(count).map((list) => ({ label: list, list, entries: [] })) });
    expect(parseBookStatblock(sheet({ abilities: [tabs(MAX_ABILITY_TABS)] }))).toBeDefined();
    expect(parseBookStatblock(sheet({ abilities: [tabs(MAX_ABILITY_TABS + 1)] }))).toBeUndefined();
    expect(parseBookStatblock(sheet({ abilities: [component({ tabs: [] })] }))).toBeUndefined();
    const parts = (count: number): AbilityComponent => component({ parts: range(count).map((key) => ({ key, label: key, type: 'text' as const })) });
    expect(parseBookStatblock(sheet({ abilities: [parts(MAX_ABILITY_PARTS)] }))).toBeDefined();
    expect(parseBookStatblock(sheet({ abilities: [parts(MAX_ABILITY_PARTS + 1)] }))).toBeUndefined();
    const options = (count: number): AbilityComponent => component({ parts: [{ key: 'cost', label: 'Cost', type: 'choice', options: range(count) }] });
    expect(parseBookStatblock(sheet({ abilities: [options(MAX_SHEET_OPTIONS)] }))).toBeDefined();
    expect(parseBookStatblock(sheet({ abilities: [options(MAX_SHEET_OPTIONS + 1)] }))).toBeUndefined();
    const sheetTabs = (count: number): SheetNode => ({ k: 'tabs', heading: null, tabs: range(count).map((label) => ({ label, nodes: [] })) });
    expect(parseBookStatblock(sheet({ blocks: [sheetTabs(MAX_ABILITY_TABS)] }))).toBeDefined();
    expect(parseBookStatblock(sheet({ blocks: [sheetTabs(MAX_ABILITY_TABS + 1)] }))).toBeUndefined();
  });

  it('refuses components that share an id, or whose id, access or part is malformed', () => {
    expect(parseBookStatblock(sheet({ abilities: [component(), component()] }))).toBeUndefined();
    for (const broken of [{ id: 'Block-1' }, { id: 'a'.repeat(17) }, { access: 'add-own' }, { parts: [{ key: 'k', label: 'K', type: 'roll' }] }, { parts: [{ key: '', label: 'K', type: 'text' }] }, { parts: [{ key: 'k', label: 'K', type: 'choice', several: 'yes' }] }]) {
      expect(parseBookStatblock(sheet({ abilities: [{ ...component(), ...broken } as AbilityComponent] })), JSON.stringify(broken)).toBeUndefined();
    }
    for (const broken of [{ key: 'Light' }, { name: 'x'.repeat(81) }, { name: 7 }, { parts: 'none' }, { text: { opening: 'x'.repeat(MAX_SHEET_TEXT + 1) } }]) {
      expect(parseBookStatblock(sheet({ abilities: [component({ tabs: [{ label: null, list: 'a', entries: [{ ...entry('Light'), ...broken } as AbilityEntry] }] })] })), JSON.stringify(broken)).toBeUndefined();
    }
  });

  it('reads an ability without a name, as a note may hold one', () => {
    expect(parseBookStatblock(sheet({ abilities: [component({ tabs: [{ label: null, list: 'a', entries: [entry('', { key: sheetBase({}) })] }] })] }))).toBeDefined();
  });

  it('holds tables of as many rows and columns as they may and no more', () => {
    const table = (rows: number, columns: number): SheetNode => ({ k: 'table', label: null, columns: range(columns), rows: Array.from({ length: rows }, () => range(columns)), worked: [], field: null });
    expect(parseBookStatblock(sheet({ blocks: [table(MAX_TABLE_ROWS, MAX_TABLE_COLUMNS)] }))).toBeDefined();
    expect(parseBookStatblock(sheet({ blocks: [table(MAX_TABLE_ROWS + 1, 1)] }))).toBeUndefined();
    expect(parseBookStatblock(sheet({ blocks: [table(1, MAX_TABLE_COLUMNS + 1)] }))).toBeUndefined();
  });

  it('holds lists of words and pairs as long as they may be and no longer', () => {
    const words = (count: number): SheetNode => value({ ...plain(''), look: 'words', words: range(count) });
    const pairs = (count: number): SheetNode => value({ ...plain(''), look: 'pairs', pairs: range(count).map((label) => ({ label, value: '1' })) });
    expect(parseBookStatblock(sheet({ blocks: [words(MAX_SHEET_LIST), pairs(MAX_SHEET_LIST)] }))).toBeDefined();
    expect(parseBookStatblock(sheet({ blocks: [words(MAX_SHEET_LIST + 1)] }))).toBeUndefined();
    expect(parseBookStatblock(sheet({ blocks: [pairs(MAX_SHEET_LIST + 1)] }))).toBeUndefined();
  });

  it('holds a field\'s stored value within the list, key, depth and option limits', () => {
    const field = (extra: Record<string, unknown>): BookStatblock => sheet({ blocks: [value(plain('x', { field: { key: 'k', base: BASE, type: 'list', value: null, ...extra } as SheetValue['field'] }))] });
    const map = (count: number): Record<string, number> => Object.fromEntries(range(count).map((key) => [key, 1]));
    expect(parseBookStatblock(field({ value: range(MAX_SHEET_LIST) }))).toBeDefined();
    expect(parseBookStatblock(field({ value: range(MAX_SHEET_LIST + 1) }))).toBeUndefined();
    expect(parseBookStatblock(field({ value: map(MAX_SHEET_KEYS) }))).toBeDefined();
    expect(parseBookStatblock(field({ value: map(MAX_SHEET_KEYS + 1) }))).toBeUndefined();
    expect(parseBookStatblock(field({ value: [[['deep']]] }))).toBeDefined();
    expect(parseBookStatblock(field({ value: [[[['deeper']]]] }))).toBeUndefined();
    expect(parseBookStatblock(field({ value: 'x'.repeat(MAX_FIELD_TEXT) }))).toBeDefined();
    expect(parseBookStatblock(field({ value: 'x'.repeat(MAX_FIELD_TEXT + 1) }))).toBeUndefined();
    expect(parseBookStatblock(field({ value: MAX_TOKEN_VALUE + 1 }))).toBeUndefined();
    expect(parseBookStatblock(field({ value: Number.NaN }))).toBeUndefined();
    expect(parseBookStatblock(field({ options: range(MAX_SHEET_OPTIONS) }))).toBeDefined();
    expect(parseBookStatblock(field({ options: range(MAX_SHEET_OPTIONS + 1) }))).toBeUndefined();
    expect(parseBookStatblock(field({ key: 'k'.repeat(MAX_FIELD_KEY) }))).toBeDefined();
    for (const broken of [{ key: 'k'.repeat(MAX_FIELD_KEY + 1) }, { key: 'k\u0001' }, { key: '' }, { type: 'formula' }, { open: 'yes' }, { unit: 7 }]) {
      expect(parseBookStatblock(field(broken)), JSON.stringify(broken)).toBeUndefined();
    }
  });

  it('refuses a malformed base', () => {
    const withBase = (base: string): unknown => parseBookStatblock(sheet({ blocks: [value(plain('x', { field: { key: 'k', base, type: 'text', value: 'x' } }))] }));
    expect(withBase('0~0')).toBeDefined();
    expect(withBase('zzzzzzzz~9999')).toBeDefined();
    for (const base of ['', 'abc', 'ABC~0', 'abc~', '~0', 'abc~12345', '123456789~0', 'ab-c~0', 'abc~0 ']) expect(withBase(base), base).toBeUndefined();
  });
});

describe('what a player changes of their statblock', () => {
  const add = { t: 'book-ability', op: 'add', list: 'actions', after: null, entry: { name: 'Healing Word', text: 'Heals.', parts: { cost: 'Bonus action' } } } as const;

  it('reads a value set, cleared and one cell of a table', () => {
    expect(parsePlayerBookMessage({ t: 'book-field', key: 'speed', base: BASE, value: '40 ft.' })).toEqual({ t: 'book-field', key: 'speed', base: BASE, value: '40 ft.' });
    expect(parsePlayerBookMessage({ t: 'book-field', key: 'speed', base: BASE, value: null })).toEqual({ t: 'book-field', key: 'speed', base: BASE, value: null });
    expect(parsePlayerBookMessage({ t: 'book-field', key: 'tags', base: BASE, value: ['a', { b: 1 }] })).toEqual({ t: 'book-field', key: 'tags', base: BASE, value: ['a', { b: 1 }] });
    expect(parsePlayerMessage({ t: 'book-field', key: 'stats', base: BASE, value: 12, cell: [0, 1] })).toEqual({ t: 'book-field', key: 'stats', base: BASE, value: 12, cell: [0, 1] });
    expect(parsePlayerMessage({ t: 'book-field', key: 'stats', base: BASE, value: null, cell: [MAX_TABLE_ROWS - 1, MAX_TABLE_COLUMNS - 1] })).toMatchObject({ cell: [MAX_TABLE_ROWS - 1, MAX_TABLE_COLUMNS - 1] });
  });

  it('refuses a malformed value edit', () => {
    const broken: Record<string, unknown>[] = [
      { key: '', base: BASE, value: 1 }, { key: 'a\u0000', base: BASE, value: 1 }, { key: 'k', base: 'nope', value: 1 }, { key: 'k', value: 1 },
      { key: 'k', base: BASE, value: Number.POSITIVE_INFINITY }, { key: 'k', base: BASE }, { key: 'k', base: BASE, value: 'x'.repeat(MAX_FIELD_TEXT + 1) },
      { key: 'k', base: BASE, value: 1, cell: [MAX_TABLE_ROWS, 0] }, { key: 'k', base: BASE, value: 1, cell: [0, MAX_TABLE_COLUMNS] }, { key: 'k', base: BASE, value: 1, cell: [0] },
      { key: 'k', base: BASE, value: 1, cell: [0.5, 0] }, { key: 'k', base: BASE, value: 1, cell: [-1, 0] }, { key: 'k', base: BASE, value: [1], cell: [0, 0] },
      { key: 'k', base: BASE, value: true, cell: [0, 0] },
    ];
    for (const message of broken) expect(parsePlayerMessage({ t: 'book-field', ...message }), JSON.stringify(message)).toBeNull();
  });

  it('reads an ability added, changed and removed, cleaned', () => {
    expect(parsePlayerMessage(add)).toEqual(add);
    const after = sheetBase('x');
    expect(parsePlayerMessage({ ...add, after, entry: { name: ' Bless\u0007 ', text: 'a\r\nb', parts: {} } })).toEqual({ ...add, after, entry: { name: 'Bless', text: 'a\nb', parts: {} } });
    expect(parsePlayerMessage({ t: 'book-ability', op: 'edit', list: 'actions', key: BASE, entry: add.entry, after: null })).toEqual({ t: 'book-ability', op: 'edit', list: 'actions', key: BASE, entry: add.entry });
    expect(parsePlayerMessage({ t: 'book-ability', op: 'remove', list: 'actions', key: BASE, entry: add.entry })).toEqual({ t: 'book-ability', op: 'remove', list: 'actions', key: BASE });
  });

  it('refuses a malformed ability edit', () => {
    const broken: Record<string, unknown>[] = [
      { ...add, op: 'move' }, { ...add, list: '' }, { ...add, after: 'Bless' }, { ...add, after: undefined },
      { ...add, entry: { ...add.entry, name: '' } }, { ...add, entry: { ...add.entry, name: 'x'.repeat(81) } }, { ...add, entry: { ...add.entry, text: 'x'.repeat(MAX_FIELD_TEXT + 1) } },
      { ...add, entry: { ...add.entry, parts: null } }, { ...add, entry: { ...add.entry, parts: Object.fromEntries(range(MAX_SHEET_KEYS + 1).map((key) => [key, 1])) } },
      { ...add, entry: { ...add.entry, parts: { cost: Number.NaN } } }, { ...add, entry: undefined },
      { t: 'book-ability', op: 'edit', list: 'actions', key: 'bad', entry: add.entry }, { t: 'book-ability', op: 'edit', list: 'actions', key: BASE },
      { t: 'book-ability', op: 'remove', list: 'actions', key: 'bad' }, { t: 'book-ability', op: 'remove', list: 'a\u0000', key: BASE },
    ];
    for (const message of broken) expect(parsePlayerMessage(message), JSON.stringify(message)).toBeNull();
  });

  it('never takes a statblock from a player, nor a player\'s edit from the GM', () => {
    expect(parsePlayerMessage({ t: 'book-statblock', statblock: FULL })).toBeNull();
    expect(parseBookMessage({ t: 'book-field', key: 'speed', base: BASE, value: 1 })).toBeNull();
    expect(parseGmMessage(add)).toBeNull();
  });

  it('says whether an edit fits one player frame', () => {
    const text = (character: string): Parameters<typeof fitsPlayerFrame>[0] => ({ ...add, entry: { ...add.entry, text: character.repeat(MAX_FIELD_TEXT) } });
    expect(parsePlayerMessage(text('語'))).not.toBeNull();
    expect(fitsPlayerFrame(text('x'))).toBe(true);
    expect(fitsPlayerFrame(text('語'))).toBe(false);
    expect(fitsPlayerFrame({ t: 'book-field', key: 'story', base: BASE, value: '語'.repeat(MAX_FIELD_TEXT) })).toBe(false);
  });
});

describe('the base of a value', () => {
  const sample: (SheetRaw | undefined)[] = [
    undefined, null, true, false, 0, -0, 1.5, -MAX_TOKEN_VALUE, '', '30 ft.', 'Ünïcødé 語', 'a\nb',
    [], [1, 'two', null], [[1], [2, [3]]],
    { a: 1, b: 2 }, { b: 2, a: 1 }, { name: 'Bite', desc: 'Piercing.', extras: { cost: 'Action' } }, { extras: { cost: 'Action' }, desc: 'Piercing.', name: 'Bite' },
    [{ name: 'Bite' }, { name: 'Bite' }, { name: 'Claw' }],
  ];

  it('is the key the GM\'s Atlas gives the value as an item of a list', () => {
    for (const item of sample) expect(sheetBase(item), JSON.stringify(item)).toBe(entryItemKeys([item as FieldValue])[0]);
  });

  it('names the items of a list as the GM\'s Atlas does, equal items by occurrence', () => {
    const list = sample.filter((item): item is SheetRaw => item !== undefined);
    expect(sheetItemKeys(list)).toEqual(entryItemKeys(list as FieldValue[]));
    expect(sheetItemKeys(['a', 'a', 'b', 'a']).map((key) => key.split('~')[1])).toEqual(['0', '1', '0', '2']);
  });

  it('reads the same whatever order a map\'s keys came in', () => {
    expect(sheetBase({ a: 1, b: { c: 2, d: 3 } })).toBe(sheetBase({ b: { d: 3, c: 2 }, a: 1 }));
    expect(sheetBase([1, 2])).not.toBe(sheetBase([2, 1]));
  });
});

describe('a stored value naming an object key', () => {
  it('is refused, so no reader takes an inherited property for its own', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      expect(parseSheetRaw(JSON.parse(`{"${key}": {"x": 1}, "y": 2}`))).toBeUndefined();
    }
    expect(parseSheetRaw({ proto: 1 })).toEqual({ proto: 1 });
  });
});

describe('the rolls a sheet offers', () => {
  const sheet = (blocks: unknown[]): unknown => ({ editable: true, displayName: null, sigils: {}, blocks, abilities: [] });
  const value = (extra: Record<string, unknown>): unknown => ({ k: 'value', value: { label: 'Agility', look: 'plain', text: { opening: '2' }, field: null, prompt: null, ...extra } });
  const table = (extra: Record<string, unknown>): unknown => ({ k: 'table', label: null, columns: ['Str', 'Dex'], rows: [['10', '14']], worked: [['+0', '+2']], field: null, ...extra });

  it('carries a value\'s, a pair\'s and a table cell\'s roll', () => {
    const parsed = parseBookStatblock(sheet([
      value({ roll: '+2', look: 'pairs', pairs: [{ label: 'Stealth', value: '+5', roll: '+5' }] }),
      table({ workedRolls: [['+0', '+2']], rolls: [[null, null]] }),
    ]));
    expect(parsed?.blocks).toMatchObject([
      { value: { roll: '+2', pairs: [{ roll: '+5' }] } },
      { workedRolls: [['+0', '+2']], rolls: [[null, null]] },
    ]);
  });

  it('refuses rolls that are no line within a formula\'s length, or not shaped as the cells', () => {
    expect(parseBookStatblock(sheet([value({ roll: 'x'.repeat(101) })]))).toBeUndefined();
    expect(parseBookStatblock(sheet([value({ roll: 3 })]))).toBeUndefined();
    expect(parseBookStatblock(sheet([table({ workedRolls: [['+0']] })]))).toBeUndefined();
    expect(parseBookStatblock(sheet([table({ rolls: [['+0', '+2'], ['+1', '+1']] })]))).toBeUndefined();
  });
});
