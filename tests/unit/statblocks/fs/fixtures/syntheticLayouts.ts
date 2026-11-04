/**
 * Synthetic Fantasy Statblocks layouts written for these tests. They
 * reproduce the structures of FS layouts (JavaScript blocks, tracks drawn by
 * a script, `ifelse`, nested `layout` blocks, collapse, saves, tables with
 * `calculate`, traits with callbacks, spells, images, inline and group, the
 * flags, dice settings) without copying any bundled layout's content.
 */

import type { FsLayout } from '../../../../../src/app/statblocks/fs/fsLayoutTypes';

/** Sets a global if anything ever runs the layout's code; the tests check it stays unset. */
export const RAN_MARKER = '__atlasFsCodeRan';
const marks = `globalThis.${RAN_MARKER} = true;`;

export const FOOTER_LAYOUT: FsLayout = {
  name: 'Synthetic footer',
  id: 'synthetic-footer',
  blocks: [
    { type: 'property', id: 'f1', properties: ['source'], display: 'Source', conditioned: true },
  ],
};

export const BEAST_LAYOUT: FsLayout = {
  name: 'Synthetic beast',
  id: 'synthetic-beast',
  columns: 4,
  columnWidth: 320,
  forceColumns: true,
  cssProperties: { fontColor: '#333333' },
  diceParsing: [{ id: 'd1', regex: '(\\d+d\\d+)', parser: `${marks} return [{ text: matches[1] }];` }],
  blocks: [
    {
      type: 'inline', id: 'b01', properties: [], hasRule: true, nested: [
        {
          type: 'group', id: 'b02', properties: ['name', 'kind'], conditioned: true, nested: [
            {
              type: 'inline', id: 'b03', properties: [], nested: [
                { type: 'heading', id: 'b04', properties: ['name'], size: 1, conditioned: true },
                {
                  type: 'inline', id: 'b05', properties: [], hasRule: true, nested: [
                    { type: 'action', id: 'b06', icon: 'swords', callback: `${marks} openTracker(monster);` },
                    { type: 'action', id: 'b07', icon: 'cog', action: 'app:open-settings' },
                  ],
                },
              ],
            },
            { type: 'subheading', id: 'b08', properties: ['size', 'kind', 'alignment'], separator: ', ', conditioned: true },
          ],
        },
        { type: 'image', id: 'b09', properties: ['portrait'], conditioned: true },
      ],
    },
    {
      type: 'group', id: 'b10', properties: ['armor', 'vitality', 'pace'], conditioned: true, hasRule: true, nested: [
        {
          type: 'property', id: 'b11', properties: ['armor'], display: 'Armor', conditioned: true,
          callback: 'const parts = [monster.armor];\nif (monster.armor_note?.length) {\n  parts.push(`(${monster.armor_note})`);\n}\nreturn parts.join(" ");',
        },
        {
          type: 'property', id: 'b12', properties: ['vitality'], display: 'Vitality', conditioned: true, dice: true,
          diceProperty: 'vitality_dice', callback: 'return `${monster.vitality} (${monster.vitality_dice})`;',
          diceCallback: `${marks} return [{ text: monster.vitality_dice }];`,
        },
        { type: 'property', id: 'b13', properties: ['pace'], display: 'Pace', conditioned: true },
      ],
    },
    { type: 'table', id: 'b14', properties: ['scores'], headers: ['Might', 'Grace', 'Wits'], calculate: true, conditioned: true, hasRule: true },
    { type: 'table', id: 'b15', properties: ['knacks'], headers: ['Hunt', 'Hide'], calculate: true, modifier: 'Math.floor(stat / 3)' },
    { type: 'table', id: 'b16', properties: ['omens'], headers: ['Sky'], calculate: true, modifier: `${marks} return monster.luck > 2 ? stat : -stat;` },
    {
      type: 'group', id: 'b17', properties: [], nested: [
        { type: 'saves', id: 'b18', properties: ['resists'], display: 'Resists', conditioned: true },
        { type: 'saves', id: 'b19', properties: ['talents'], display: 'Talents', callback: `${marks} return { [Object.keys(property)[0]]: "+" + Object.values(property)[0] };` },
      ],
    },
    { type: 'property', id: 'b20', properties: ['level'], display: 'Level', conditioned: true, callback: 'return (monster.level < 0 ? "-" : "+") + Math.abs(monster.level);' },
    { type: 'property', id: 'b21', properties: ['rank'], display: 'Rank', conditioned: true, callback: 'return monster.rank + " " + monster.role;' },
    { type: 'property', id: 'b22', properties: ['languages'], display: 'Languages', fallback: 'None' },
    { type: 'property', id: 'b23', properties: ['aura'], display: 'Aura:', markdown: true, cls: 'glow', doNotAddClass: true },
    { type: 'traits', id: 'b24', properties: ['features'], heading: 'Features', conditioned: true, callback: 'return property.text;' },
    { type: 'traits', id: 'b25', properties: ['moves'], heading: 'Moves', conditioned: true, dice: true, subheadingText: '{{monster}} takes two moves.' },
    { type: 'traits', id: 'b26', properties: ['gambits'], heading: 'Gambits', callback: `${marks} var s = ""; if (property.cost) { s += property.cost + ": "; } return s + property.desc;` },
    { type: 'traits', id: 'b27', properties: ['lore'], heading: 'lore_title', headingProp: true, conditioned: true },
    { type: 'spells', id: 'b28', properties: ['spells'], heading: 'Spells', conditioned: true },
    { type: 'text', id: 'b29', properties: ['notes'], heading: 'Notes', markdown: true, conditioned: true },
    { type: 'text', id: 'b30', properties: [], heading: 'Tactics', text: '' },
    { type: 'text', id: 'b31', properties: [], text: 'Flees at half health.' },
    {
      type: 'collapse', id: 'b32', heading: 'Secrets', open: false, hasRule: true, nested: [
        { type: 'group', id: 'b33', properties: [], nested: [{ type: 'text', id: 'b34', properties: ['secrets'], markdown: true, conditioned: true }] },
      ],
    },
    { type: 'layout', id: 'b35', layout: 'synthetic-footer' },
    { type: 'layout', id: 'b36', layout: 'nowhere' },
    {
      type: 'ifelse', id: 'b37', conditions: [
        { condition: `${marks} return monster.boss === true;`, nested: [{ type: 'group', id: 'b38', properties: [], nested: [{ type: 'property', id: 'b39', properties: ['phase'], display: 'Phase' }] }] },
        { condition: '', nested: [{ type: 'group', id: 'b40', properties: [], nested: [{ type: 'traits', id: 'b41', properties: ['minions'] }] }] },
      ],
    },
    {
      type: 'javascript', id: 'b42',
      code: `${marks}\nconst el = createDiv({ cls: "synthetic-tracks" });\nfor (let i = 0; i < monster.hp; i++) el.createEl("input", { type: "checkbox" });\nfor (let i = 0; i < monster.wounds; i++) el.createEl("input", { type: "checkbox" });\nreturn el;`,
    },
    { type: 'javascript', id: 'b43', code: `${marks} const el = createDiv(); el.setText(monster.motto ?? ""); return el;` },
    { type: 'image', id: 'b44', properties: ['token'], conditioned: true },
    { type: 'property', id: 'b45', properties: ['initiative'], display: 'Initiative', customFlag: 1 } as FsLayout['blocks'][number],
    {
      type: 'group', id: 'b46', properties: [], heading: 'group_title', headingProp: true, cls: 'titled', nested: [
        { type: 'heading', id: 'b47', properties: ['epithet'], size: 5 },
      ],
    },
  ],
};

/** A layout that includes itself, through another. */
export const LOOP_LAYOUTS: FsLayout[] = [
  { name: 'Loop A', id: 'loop-a', blocks: [{ type: 'property', id: 'a1', properties: ['alpha'] }, { type: 'layout', id: 'a2', layout: 'loop-b' }] },
  { name: 'Loop B', id: 'loop-b', blocks: [{ type: 'property', id: 'b1', properties: ['beta'] }, { type: 'layout', id: 'b2', layout: 'loop-a' }] },
];

/** Each level includes the next ten times: 10^5 blocks if nothing stopped it. */
export function fanOutLayouts(levels: number): FsLayout[] {
  return Array.from({ length: levels }, (_, level): FsLayout => ({
    name: `Fan ${level}`,
    id: `fan-${level}`,
    blocks: level === levels - 1
      ? [{ type: 'property', id: 'leaf', properties: ['leaf'] }]
      : Array.from({ length: 10 }, (_, index) => ({ type: 'layout', id: `l${index}`, layout: `fan-${level + 1}` })),
  }));
}
