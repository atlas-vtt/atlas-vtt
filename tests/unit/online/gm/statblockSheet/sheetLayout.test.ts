import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { parseBookStatblock, type SheetNode } from '../../../../../src/app/online/protocol/index.ts';
import { placedSheetValues } from '../../../../../src/app/online/gm/book/placedResources';
import type { ResourceDefinition } from '../../../../../src/app/resources/resourceTypes';
import { paneCardWidth } from '../../../../../src/app/statblocks/editor/note-panel/paneCardWidth';
import type { TemplateBlock, TemplateField } from '../../../../../src/app/statblocks/model/templateTypes';
import { EMBER_KEEPER, EMBER_KEEPER_NOTE } from '../../../../fixtures/emberKeeperTemplate';
import { templateOf } from '../../../statblocks/render/sheetTestKit';
import { resolvedOf } from './sheetKit';

/** The sheet's shape: each node's kind and block, containers with what they hold. */
function shape(nodes: readonly SheetNode[]): unknown[] {
  return nodes.map((node) => {
    const tag = `${node.k}:${node.frame?.block ?? '?'}${node.frame?.look ? `/${node.frame.look}` : ''}${node.frame?.size ? `@${node.frame.size}` : ''}`;
    if (node.k === 'section' || node.k === 'row') return [tag, shape(node.nodes)];
    if (node.k === 'tabs') return [tag, node.tabs.map((tab) => [tab.label, shape(tab.nodes)])];
    return tag;
  });
}

const draw = (panelWidth?: number) => statblockSheet({
  resolved: resolvedOf(EMBER_KEEPER, EMBER_KEEPER_NOTE), definitions: [], resources: undefined, ...(panelWidth !== undefined && { panelWidth }),
})!;

describe('the player\'s sheet in the GM\'s layout', () => {
  it('keeps the template\'s blocks, order, rows and looks, and leaves the ability lists to the Abilities tab', () => {
    const statblock = draw();
    expect(parseBookStatblock(statblock)).toEqual(statblock);
    expect(shape(statblock.blocks)).toEqual([
      'value:text',
      'value:stat/run-in',
      ['row:row', ['value:stat/run-in@fit', 'value:stat/run-in@fit', 'value:stat/run-in@fit', 'value:stat/run-in@fit']],
      'divider:divider',
      ['row:row', ['track:track/gauge@fit', 'track:track/gauge@fit']],
      'divider:divider',
      ['row:row', ['value:stat/stacked@fit', 'value:stat/stacked@fit', 'metric:metric@fill', 'value:stat/stacked@fit', 'value:stat/stacked@fit']],
      ['row:row', ['metric:metric@fill', 'metric:metric@fill', 'metric:metric@fill', 'metric:metric@fill']],
      'divider:divider',
      ['row:row', ['value:tags/comma@fill', 'value:tags/comma@fill']],
      'divider:divider',
      ['section:section', [['row:row', [['section:section@fill', Array(5).fill('value:stat/run-in')], ['section:section@fill', Array(5).fill('value:stat/run-in')]]]]],
    ]);
    expect(statblock.card).toEqual({ width: 540, columnWidth: 22, maxColumns: 1, description: true });
    // The header's hit points are the Encumbrance gauge beside the art, sent as the track the card draws
    expect(statblock.sigils).toEqual({ hp: expect.objectContaining({ label: 'Encumbrance', text: { opening: '12' } }) });
    expect(statblock.hitPoints).toMatchObject({ k: 'track', label: 'Encumbrance', look: 'gauge', frame: { block: 'track', look: 'gauge' } });
  });

  it('shows every ability list apart, in the template\'s order, with the headings and tabs the card gives it', () => {
    const { abilities } = draw();
    expect(abilities.map((component) => [component.heading, component.section, component.tabs.map((tab) => tab.label)])).toEqual([
      [null, null, ['Edge', 'Feats', 'Dark gifts']],
      [null, 'Spellcasting', ['Spellroots', 'Spellwords', 'Edicts']],
      ['Weapons', null, [null]],
      ['Armour', null, ['Head', 'Torso', 'Left arm', 'Right arm', 'Left leg', 'Right leg']],
    ]);
    expect(abilities[2]?.parts.map((part) => part.label)).toEqual(['Die', 'Range', 'Damage']);
    expect(abilities[1]?.tabs.map((tab) => tab.list)).toEqual(['roots', 'words', 'edicts']);
  });

  it('lays the card out at the GM\'s panel width: a one-column card up to its feed width, a wider template the whole panel', () => {
    expect(paneCardWidth(400, 1)).toBe(400 - 44);
    expect(paneCardWidth(1000, 1)).toBe(540);
    expect(paneCardWidth(1000, 2)).toBe(956);
    expect(draw(400).card?.width).toBe(356);
    expect(draw(2000).card?.width).toBe(540);
  });
});

describe('the gauges the template places', () => {
  const resource = (key: string, field: string, direction: ResourceDefinition['direction']): ResourceDefinition => ({ key, name: key, field, direction, color: '#aa0000', visibleToPlayers: false });
  const DEFINITIONS = [resource('mist', 'mist', 'drains'), resource('vigour', 'vigour', 'drains'), resource('burden', 'encumbrance', 'fills')];
  const resolved = resolvedOf(EMBER_KEEPER, EMBER_KEEPER_NOTE);

  it('stand where the template places them, also for a resource the token holds none of, and only there', () => {
    const statblock = statblockSheet({ resolved, definitions: DEFINITIONS, resources: { mist: { current: 8, max: 15 } } })!;
    const gauges = statblock.blocks.flatMap((node) => (node.k === 'row' ? node.nodes : [])).filter((node) => node.k === 'track');
    expect(gauges.map((node) => node.k === 'track' && [node.resource, node.current, node.max])).toEqual([['mist', 8, 15], ['vigour', 12, 12]]);
    // Encumbrance beside the art, from where the statblock starts it, and nowhere else
    expect(statblock.hitPoints).toMatchObject({ k: 'track', resource: 'burden', current: 0, max: 12 });
    expect(JSON.stringify(statblock.blocks)).not.toContain('Encumbrance');
  });

  it('are the player\'s to change, starting where the statblock starts them, until the token holds a value of them', () => {
    expect(placedSheetValues(resolved, DEFINITIONS, { mist: { current: 8, max: 15 } }).map(({ definition, value, editable }) => [definition.key, value, editable])).toEqual([
      ['burden', { current: 0, max: 12 }, true],
      ['vigour', { current: 12, max: 12 }, true],
    ]);
    expect(placedSheetValues(resolved, DEFINITIONS, { mist: { current: 8, max: 15 }, vigour: { current: 3, max: 12 }, burden: { current: 5, max: 12 } })).toEqual([]);
  });
});

describe('what the abilities leave behind on the sheet', () => {
  const FIELDS: TemplateField[] = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'speed', label: 'Speed', type: 'text' },
    { key: 'size', label: 'Size', type: 'text' },
    { key: 'actions', label: 'Actions', type: 'entries' },
    { key: 'traits', label: 'Traits', type: 'entries' },
  ];
  const NOTE = { name: 'Ana', speed: '30 ft.', size: 'Small', actions: [{ name: 'Bite', desc: 'Teeth.' }], traits: [{ name: 'Keen', desc: 'Sees far.' }] };
  const sheet = (blocks: TemplateBlock[]) => statblockSheet({ resolved: resolvedOf(templateOf(FIELDS, blocks), NOTE), definitions: [], resources: undefined })!;

  it('closes the gap an ability tile leaves in a row', () => {
    const { blocks, abilities } = sheet([{ id: 'row00001', type: 'row', blocks: [
      { id: 'speed001', type: 'stat', field: 'speed', look: 'stacked' },
      { id: 'list0001', type: 'entries', field: 'actions' },
      { id: 'size0001', type: 'stat', field: 'size', look: 'stacked' },
    ] }]);
    expect(shape(blocks)).toEqual([['row:row', ['value:stat/stacked@fit', 'value:stat/stacked@fit']]]);
    expect(abilities.map((component) => component.name)).toEqual(['Actions']);
  });

  it('keeps a section\'s other blocks under its heading, and names the abilities that left it by that heading', () => {
    const { blocks, abilities } = sheet([{ id: 'sect0001', type: 'section', heading: 'Combat', blocks: [
      { id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' },
      { id: 'list0001', type: 'entries', field: 'actions' },
    ] }]);
    expect(blocks).toMatchObject([{ k: 'section', heading: 'Combat', nodes: [{ k: 'value', value: { label: 'Speed' } }] }]);
    expect(abilities[0]).toMatchObject({ name: 'Actions', heading: null, section: 'Combat' });
  });

  it('ends a heading\'s run at the next Section, so a heading over abilities alone never stands over the Section after it', () => {
    const { blocks } = sheet([
      { id: 'head0001', type: 'heading', text: 'Actions', level: 'section' },
      { id: 'list0001', type: 'entries', field: 'actions' },
      { id: 'sect0001', type: 'section', heading: 'Gear', blocks: [{ id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' }] },
    ]);
    expect(shape(blocks)).toEqual([['section:section', ['value:stat/run-in']]]);
  });

  it('lays a card out at the default where a template\'s columns are no number', () => {
    const template = templateOf(FIELDS, [{ id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' }]);
    const broken = { ...template, layout: { ...template.layout, maxColumns: Number.NaN as 1, columnWidth: Number.NaN } };
    const statblock = statblockSheet({ resolved: resolvedOf(broken, NOTE), definitions: [], resources: undefined, panelWidth: Number.NaN })!;
    expect(statblock.card).toEqual({ width: 540, columnWidth: 22, maxColumns: 1, description: false });
    expect(parseBookStatblock(statblock)).toEqual(statblock);
  });

  it('drops a heading and the rules left with nothing between them once the abilities went', () => {
    const { blocks } = sheet([
      { id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' },
      { id: 'divi0001', type: 'divider' },
      { id: 'head0001', type: 'heading', text: 'Actions', level: 'section' },
      { id: 'list0001', type: 'entries', field: 'actions' },
      { id: 'divi0002', type: 'divider' },
      { id: 'head0002', type: 'heading', text: 'Traits', level: 'section' },
      { id: 'list0002', type: 'entries', field: 'traits' },
      { id: 'size0001', type: 'stat', field: 'size', look: 'run-in' },
    ]);
    expect(shape(blocks)).toEqual(['value:stat/run-in', 'divider:divider', 'heading:heading/section', 'value:stat/run-in']);
  });
});
