import { describe, expect, it } from 'vitest';
import { renderPattern } from '../../../../src/app/statblocks/expressions/pattern';
import { parsePattern } from '../../../../src/app/statblocks/expressions/patternParse';
import { isExpressionError } from '../../../../src/app/statblocks/expressions/errors';
import { fsLayoutToTemplate } from '../../../../src/app/statblocks/fs/fsLayoutToTemplate';
import { lookupCallback } from '../../../../src/app/statblocks/fs/fsLookupCallbacks';
import type { FsLayout } from '../../../../src/app/statblocks/fs/fsLayoutTypes';
import { flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import { readerFor } from '../../../../src/app/statblocks/values/fieldValues';

/** The table of the bundled 5e layout's Challenge and Proficiency Bonus callbacks, cut to a few rows (SRD values). */
const CR_TABLE = `const CR = {
    "0": {
        cr: "0",
        value: 0,
        xp: 10
    },
    "1/4": {
        cr: "1/4",

        value: 0.25,
        xp: 50
    },
    "5": { cr: "5", value: 5, xp: 1800 },
    "17": { cr: "17", value: 17, xp: 18000 },
};`;

const CHALLENGE = `${CR_TABLE}
if ("cr" in monster && monster.cr in CR) {
    return \`\${CR[
        monster.cr
    ].cr} (\${CR[
        monster.cr
    ].xp.toLocaleString()} XP)\`;
}
return "";`;

const PROFICIENCY = `${CR_TABLE}
if ("cr" in monster && monster.cr in CR) {
    return \`+\${Math.max(
            Math.floor(2 + ((CR[monster.cr]?.value ?? 0) - 1) / 4),
            2
        )}\`;
}
return "";`;

describe('lookupCallback', () => {
  it('works out what a table callback writes for each row', () => {
    expect(lookupCallback(CHALLENGE)).toEqual({
      key: 'cr',
      rows: { '0': '0 (10 XP)', '1/4': '1/4 (50 XP)', '5': '5 (1,800 XP)', '17': '17 (18,000 XP)' },
    });
    expect(lookupCallback(PROFICIENCY)).toEqual({ key: 'cr', rows: { '0': '+2', '1/4': '+2', '5': '+3', '17': '+6' } });
  });

  it.each([
    ['a callback without a table', 'return monster.cr;'],
    ['a table never tested', `${CR_TABLE}\nreturn CR[monster.cr].xp;`],
    ['a test on something else', `${CR_TABLE}\nif (monster.hp) { return CR[monster.cr].xp; }\nreturn "";`],
    ['more after the table\'s return', `${CR_TABLE}\nif (monster.cr in CR) { return CR[monster.cr].xp; }\nreturn monster.cr;`],
    ['a value the table lacks', `${CR_TABLE}\nif (monster.cr in CR) { return CR[monster.cr].gold; }\nreturn "";`],
    ['a call it does not know', `${CR_TABLE}\nif (monster.cr in CR) { return alert(CR[monster.cr].xp); }\nreturn "";`],
    ['a value read from elsewhere on the creature', `${CR_TABLE}\nif (monster.cr in CR) { return monster.hp + CR[monster.cr].xp; }\nreturn "";`],
  ])('leaves %s to JavaScript', (_, code) => {
    expect(lookupCallback(code)).toBeNull();
  });
});

const LAYOUT: FsLayout = {
  name: 'Challenge layout',
  id: 'challenge-layout',
  blocks: [
    { type: 'heading', id: 'h', properties: ['name'], size: 1 },
    {
      type: 'inline', id: 'i', properties: [], conditioned: true, nested: [
        { type: 'property', id: 'c', display: 'Challenge', properties: ['cr'], callback: CHALLENGE },
        { type: 'property', id: 'p', display: 'Proficiency Bonus', properties: ['cr'], callback: PROFICIENCY },
      ],
    },
  ],
} as unknown as FsLayout;

describe('importing a layout whose lines look values up', () => {
  const { template, report } = fsLayoutToTemplate(LAYOUT, { id: 'challenge-abc123' });

  it('writes each table out as a lookup and keeps no script', () => {
    expect(report.scripts).toEqual([]);
    expect(template.lookups).toEqual({
      challenge: { '0': '0 (10 XP)', '1/4': '1/4 (50 XP)', '5': '5 (1,800 XP)', '17': '17 (18,000 XP)' },
      proficiency_bonus: { '0': '+2', '1/4': '+2', '5': '+3', '17': '+6' },
    });
    const stats = flattenReadingOrder(template.layout.blocks).filter((block) => block.type === 'stat');
    expect(stats.map((block) => ['label' in block ? block.label : undefined, 'pattern' in block ? block.pattern : undefined])).toEqual([
      [undefined, '{cr|lookup:challenge}'],
      ['Proficiency Bonus', '{cr|lookup:proficiency_bonus}'],
    ]);
  });

  it('shows what Fantasy Statblocks shows, and nothing for a rating the table lacks', () => {
    const pattern = parsePattern('{cr|lookup:challenge}');
    if (isExpressionError(pattern)) throw new Error(pattern.message);
    const context = { lookups: template.lookups };
    expect(renderPattern(pattern, readerFor({ cr: 17 }, template.fields), context).text).toBe('17 (18,000 XP)');
    expect(renderPattern(pattern, readerFor({ cr: '31' }, template.fields), context).text).toBe('');
  });
});
