import { describe, expect, it } from 'vitest';
import { blockAccess, playerAccess } from '../../../../src/app/online/gm/book/playerAccess';
import { renameFieldKey } from '../../../../src/app/statblocks/model/fieldOps';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';

const FIELDS: TemplateField[] = [
  ...MARSH_CREATURE.fields,
  { key: 'title', label: 'Known as', type: 'text', meaning: 'display-name' },
  { key: 'spells', label: 'Spells', type: 'spells' },
  { key: 'notes', label: 'GM notes', type: 'markdown' },
  { key: 'stress', label: 'Stress', type: 'number' },
  { key: 'bonus', label: 'Bonus actions', type: 'entries' },
  { key: 'portrait', label: 'Portrait', type: 'image' },
];
const template = (players?: StatblockTemplate['players']): StatblockTemplate => ({ ...MARSH_CREATURE, fields: FIELDS, ...(players && { players }) });
const tabs = (...lists: string[]): TemplateBlock => ({
  id: 'tabs0001', type: 'tabs', blocks: lists.map((field, index) => ({ id: `tab0000${index}`, type: 'section', heading: field, blocks: [{ id: `lst0000${index}`, type: 'entries', field }] })),
});

describe('what a player may do with a field of their own statblock', () => {
  it('lets them change every value and ability by default', () => {
    for (const key of ['speed', 'ac', 'hp', 'stats', 'languages', 'cr', 'size', 'notes', 'stress', 'actions', 'traits']) expect(playerAccess(template(), key), key).toBe('edit');
  });

  it('lets them only read a spell list, the name, the display name and pictures, or not see a spell list', () => {
    for (const key of ['spells', 'name', 'title', 'image', 'portrait']) expect(playerAccess(template(), key), key).toBe('read');
    expect(playerAccess(template({ spells: 'edit' }), 'spells')).toBe('read');
    expect(playerAccess(template({ spells: 'hidden' }), 'spells')).toBe('hidden');
    expect(playerAccess(template({ name: 'edit', title: 'hidden', image: 'hidden' }), 'name')).toBe('read');
    expect(playerAccess(template({ name: 'edit', title: 'hidden', image: 'hidden' }), 'title')).toBe('read');
    expect(playerAccess(template({ image: 'hidden' }), 'image')).toBe('read');
  });

  it('follows what the template sets, and hides what the template names nowhere', () => {
    const set = template({ notes: 'hidden', speed: 'read', actions: 'read' });
    expect(playerAccess(set, 'notes')).toBe('hidden');
    expect(playerAccess(set, 'speed')).toBe('read');
    expect(playerAccess(set, 'actions')).toBe('read');
    expect(playerAccess(set, 'ac')).toBe('edit');
    expect(playerAccess(set, 'secret')).toBe('hidden');
  });

  it('reads a setting this Atlas does not know as hidden', () => {
    expect(playerAccess(template({ notes: 'private' }), 'notes')).toBe('hidden');
    expect(playerAccess(template({ spells: 'private' }), 'spells')).toBe('hidden');
    expect(playerAccess(template({ name: 'private' }), 'name')).toBe('read');
  });

  it('keeps a setting across a rename, read by the new key and the old one', () => {
    const renamed = renameFieldKey(template({ notes: 'hidden' }), 'notes', 'gm_notes');
    expect(renamed.players).toEqual({ gm_notes: 'hidden' });
    expect(playerAccess(renamed, 'gm_notes')).toBe('hidden');
    expect(playerAccess(renamed, 'notes')).toBe('hidden');
    const stale: StatblockTemplate = { ...renamed, players: { notes: 'read' } };
    expect(playerAccess(stale, 'gm_notes')).toBe('read');
  });
});

describe('what a player may do with what a block shows', () => {
  it('hides a block whose text reads a hidden field anywhere, but not for its condition', () => {
    const set = template({ notes: 'hidden' });
    const reading: TemplateBlock[] = [
      { id: 'p1', type: 'stat', field: 'speed', look: 'run-in', pattern: '{speed} ({notes})' },
      { id: 'p2', type: 'title', field: 'name', level: 2, pattern: '{name}[ {notes}]' },
      { id: 'p3', type: 'line', fields: ['size'], pattern: '{size} {=notes * 2}' },
      { id: 'p4', type: 'stat', field: 'speed', look: 'run-in', whenEmpty: 'fallback', fallback: '{notes}' },
      { id: 'p5', type: 'stat', field: 'hp', look: 'run-in', rollFrom: 'notes' },
      { id: 'p6', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Mod', formula: 'value + notes' }] },
      { id: 'p7', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Save', field: 'notes' }] },
      { id: 'p8', type: 'entries', field: 'actions', introField: 'notes' },
      { id: 'p9', type: 'tags', field: 'languages', look: 'comma', whenEmpty: 'fallback', fallback: '{secret}' },
      { id: 'pa', type: 'metric', fields: ['ac'], whenEmpty: 'fallback', fallback: '{notes}' },
      { id: 'tabs0002', type: 'tabs', blocks: [{ id: 'tab00000', type: 'section', heading: 'A', blocks: [{ id: 'lst00000', type: 'entries', field: 'actions', introField: 'notes' }] }] },
    ];
    for (const block of reading) expect(blockAccess(set, block), block.id).toBe('hidden');
    expect(blockAccess(set, { id: 'c1', type: 'stat', field: 'speed', look: 'run-in', showWhen: { field: 'notes', is: 'present' } })).toBe('edit');
    expect(blockAccess(template(), reading[0]!)).toBe('read');
  });

  it('lets a player change a Title, Line or Stat only where it shows one field\'s own value', () => {
    const shown = (block: TemplateBlock): string => blockAccess(template(), block);
    expect(shown({ id: 's1', type: 'stat', field: 'speed', look: 'run-in' })).toBe('edit');
    expect(shown({ id: 's2', type: 'stat', field: 'speed', look: 'run-in', pattern: '{speed}' })).toBe('edit');
    expect(shown({ id: 's3', type: 'stat', field: 'speed', look: 'run-in', pattern: '{speed|lookup:xp}' })).toBe('read');
    expect(shown({ id: 's4', type: 'stat', field: 'speed', look: 'run-in', pattern: '{speed|signed} ({=speed + 10})' })).toBe('read');
    expect(shown({ id: 's5', type: 'stat', field: 'speed', look: 'run-in', pattern: 'Speed {speed}' })).toBe('read');
    expect(shown({ id: 'l1', type: 'line', fields: ['size'] })).toBe('edit');
    expect(shown({ id: 'l2', type: 'line', fields: ['size', 'speed'] })).toBe('read');
  });


  it('sets an Abilities component for all its lists at once, the strictest deciding', () => {
    expect(blockAccess(template(), tabs('actions', 'bonus'))).toBe('edit');
    expect(blockAccess(template({ bonus: 'read' }), tabs('actions', 'bonus'))).toBe('read');
    expect(blockAccess(template({ bonus: 'hidden', actions: 'read' }), tabs('actions', 'bonus'))).toBe('hidden');
    expect(blockAccess(template({ actions: 'read' }), { id: 'e1', type: 'entries', field: 'actions' })).toBe('read');
  });

  it('reads a track bound to a resource, and lets a player change one that is not', () => {
    expect(blockAccess(template(), { id: 't1', type: 'track', field: 'stress', look: 'boxes', counts: 'up' })).toBe('edit');
    expect(blockAccess(template(), { id: 't1', type: 'track', field: 'stress', look: 'boxes', counts: 'up', resource: 'stress' })).toBe('read');
    expect(blockAccess(template({ stress: 'hidden' }), { id: 't1', type: 'track', field: 'stress', look: 'boxes', counts: 'up', resource: 'stress' })).toBe('hidden');
  });

  it('reads a line of several values, hidden where one of them is, and a metric shows while one number does', () => {
    const line: TemplateBlock = { id: 'l1', type: 'line', fields: ['size', 'type'], pattern: '{size} {type}' };
    expect(blockAccess(template(), line)).toBe('read');
    expect(blockAccess(template({ type: 'hidden' }), line)).toBe('hidden');
    expect(blockAccess(template(), { id: 'l2', type: 'line', fields: ['size'] })).toBe('edit');
    const metric: TemplateBlock = { id: 'm1', type: 'metric', fields: ['ac', 'stress', ''] };
    expect(blockAccess(template({ ac: 'hidden' }), metric)).toBe('edit');
    expect(blockAccess(template({ ac: 'hidden', stress: 'hidden' }), metric)).toBe('hidden');
  });

  it('never offers code or blocks of a newer Atlas, and only reads containers and fixed text', () => {
    expect(blockAccess(template(), { id: 's1', type: 'script', summary: 'x', fs: {} })).toBe('hidden');
    expect(blockAccess(template(), { id: 'o1', type: 'opaque', raw: {} })).toBe('hidden');
    expect(blockAccess(template(), { id: 'x1', type: 'text', text: 'Fixed words' })).toBe('read');
    expect(blockAccess(template(), { id: 'd1', type: 'divider' })).toBe('read');
    expect(blockAccess(template({ notes: 'hidden' }), { id: 'x2', type: 'text', field: 'notes' })).toBe('hidden');
  });
});
