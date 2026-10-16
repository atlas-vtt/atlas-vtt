// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { drawnStatblock, statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { parseBookStatblock } from '../../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate } from '../../../../../src/app/statblocks/model/templateTypes';
import { templateOf } from '../../../statblocks/render/sheetTestKit';
import { resolvedOf, statblockTexts } from './sheetKit';

const SECRET = 'SENTINEL';

/** A template that shows a player only part of what its note holds, every other place holding a secret. */
const TEMPLATE: StatblockTemplate = {
  ...templateOf(
    [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'hp', label: 'Hit points', type: 'number', meaning: 'hit-points' },
      { key: 'ac', label: 'Armour', type: 'number', meaning: 'armor' },
      { key: 'description', label: 'Description', type: 'markdown', meaning: 'description' },
      { key: 'speed', label: 'Speed', type: 'text' },
      { key: 'notes', label: 'GM notes', type: 'markdown' },
      { key: 'whisper', label: 'Whisper', type: 'text' },
      { key: 'bonus', label: 'Bonus', type: 'number' },
      { key: 'shown', label: 'Shown', type: 'number' },
      { key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX'] },
      { key: 'empty', label: 'Empty', type: 'text' },
      { key: 'actions', label: 'Actions', type: 'entries' },
      { key: 'lair', label: 'Lair actions', type: 'entries' },
      { key: 'intro', label: 'Intro', type: 'markdown' },
    ],
    [
      { id: 'speed001', type: 'stat', field: 'speed', look: 'run-in', className: `${SECRET}-class`, fsExtras: { note: `${SECRET}-fs` } },
      { id: 'patt0001', type: 'stat', field: 'speed', look: 'run-in', label: 'Pattern', pattern: '{speed} ({notes})' },
      { id: 'fall0001', type: 'stat', field: 'empty', look: 'run-in', whenEmpty: 'fallback', fallback: 'From {notes}' },
      { id: 'cond0001', type: 'stat', field: 'shown', look: 'run-in', label: 'Conditioned', showWhen: { field: 'notes', is: 'present' } },
      { id: 'cond0002', type: 'stat', field: 'shown', look: 'run-in', label: 'Never', showWhen: { field: 'notes', is: 'absent' } },
      { id: 'note0001', type: 'text', field: 'notes' },
      { id: 'whis0001', type: 'stat', field: 'whisper', look: 'run-in' },
      { id: 'metr0001', type: 'metric', heading: 'Numbers', fields: ['shown', 'bonus'] },
      { id: 'tabl0001', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Mod', formula: 'value + bonus' }] },
      { id: 'tabl0002', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Save', field: 'notes' }] },
      { id: 'rawk0001', type: 'stat', field: 'speed', look: 'run-in', label: 'Unknown key', pattern: '{speed}[ {gm_secret}]' },
      { id: 'scri0001', type: 'script', summary: `${SECRET}-summary`, fs: { code: `${SECRET}-code` } },
      { id: 'opaq0001', type: 'opaque', raw: { text: `${SECRET}-raw` } },
      { id: 'list0001', type: 'entries', field: 'actions', introField: 'intro' },
      { id: 'lair0001', type: 'entries', field: 'lair' },
    ],
  ),
  header: { hidden: ['description'] },
  players: { notes: 'hidden', whisper: 'private', bonus: 'hidden', lair: 'hidden' },
};

const NOTE: Record<string, unknown> = {
  name: 'Ana', hp: 12, ac: 15, speed: '30 ft.', shown: 7, stats: [10, 14],
  description: `${SECRET} description`,
  notes: `${SECRET} notes`,
  whisper: `${SECRET} whisper`,
  bonus: 424242,
  intro: 'Ana fights with her actions.',
  actions: [{ name: 'Bite', desc: 'One bite.' }],
  lair: [{ name: `${SECRET} lair`, desc: `${SECRET} lair text` }],
  gm_secret: `${SECRET} unknown key`,
  tags: [`${SECRET}-tag`],
  aliases: [`${SECRET}-alias`],
  'atlas-template': `${SECRET}-template`,
};

const drawn = (template: StatblockTemplate, note: Record<string, unknown>): string => JSON.stringify(statblockSheet({ resolved: { ...resolvedOf(template, note), path: `${SECRET}/Ana.md` }, definitions: [], resources: undefined }));

describe('what a player is never sent of their statblock', () => {
  it('keeps hidden fields, a setting of a newer Atlas, code, unknown keys and the note\'s own properties out of the sheet', () => {
    const json = drawn(TEMPLATE, NOTE);
    expect(json).not.toContain(SECRET);
    expect(json).not.toContain('424242');
  });

  it('shows what the template lets players see, and only the outcome of a condition on a hidden field', () => {
    const statblock = statblockSheet({ resolved: resolvedOf(TEMPLATE, NOTE), definitions: [], resources: undefined })!;
    expect(parseBookStatblock(statblock)).toEqual(statblock);
    const texts = statblockTexts(statblock);
    expect(texts).toEqual(expect.arrayContaining(['Speed', '30 ft.', 'Conditioned', 'Shown', '7', 'Bite', 'One bite.', 'Ana fights with her actions.']));
    expect(texts).not.toContain('Never');
    expect(texts).not.toContain('Pattern');
    expect(texts).not.toContain('Unknown key');
    expect(statblock.abilities.map((component) => component.name)).toEqual(['Actions']);
    const metric = statblock.blocks.find((node) => node.k === 'metric');
    expect(metric).toMatchObject({ k: 'metric', heading: null, values: [{ label: 'Shown' }] });
  });

  it('leaves out a number of a Metric the player may not see, alone', () => {
    const template: StatblockTemplate = { ...TEMPLATE, players: { bonus: 'hidden' }, layout: { ...TEMPLATE.layout, blocks: [{ id: 'metr0001', type: 'metric', heading: 'Numbers', fields: ['bonus', 'shown', 'speed'] }] } };
    const statblock = statblockSheet({ resolved: resolvedOf(template, NOTE), definitions: [], resources: undefined })!;
    expect(statblock.blocks).toMatchObject([{ k: 'metric', heading: 'Numbers', values: [{ label: 'Shown' }, { label: 'Speed' }] }]);
    expect(JSON.stringify(statblock)).not.toContain('424242');
  });

  it('serves the whole of a long text only to the sheet that names it, never one hidden from players', async () => {
    const long = `${'A long tale of the road. '.repeat(40)}The end.`;
    const { statblock, texts } = await drawnStatblock({ resolved: resolvedOf(TEMPLATE, { ...NOTE, notes: `${SECRET} ${long}`, intro: long }), definitions: [], resources: undefined });
    expect(texts).toHaveLength(1);
    expect(new TextDecoder().decode(texts[0]!.bytes)).toBe(long);
    expect(JSON.stringify(statblock)).toContain(texts[0]!.ref.hash);
    expect(texts.map((text) => new TextDecoder().decode(text.bytes)).join('')).not.toContain(SECRET);
  });
});
