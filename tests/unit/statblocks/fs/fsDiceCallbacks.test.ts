import { describe, expect, it } from 'vitest';
import { callbackPattern } from '../../../../src/app/statblocks/fs/fsCallbackPatterns';
import { parseCallbackBody } from '../../../../src/app/statblocks/fs/fsCallbackSyntax';
import { diceCallbackKey } from '../../../../src/app/statblocks/fs/fsDiceCallbacks';
import { fsLayoutToTemplate } from '../../../../src/app/statblocks/fs/fsLayoutToTemplate';
import type { FsLayout } from '../../../../src/app/statblocks/fs/fsLayoutTypes';
import { lookupCallback } from '../../../../src/app/statblocks/fs/fsLookupCallbacks';
import { flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import type { StatblockTemplate, TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { expectParses, lostCode } from './fsCodeKit';

/** Basic 5e's hit points line, as Fantasy Statblocks writes it. */
const HIT_DICE_CALLBACK = `if ("hit_dice" in monster) {
  return [{ text: monster["hit_dice"] }];
} else {
  return property;
}`;
const HP_CALLBACK = 'let str = [monster.hp];\nif (monster.hit_dice?.length) {\n  str.push(`(${monster.hit_dice})`);\n}\nreturn str.join(" ");';

function hitPointsLayout(line: Record<string, unknown>): FsLayout {
  return {
    id: 'hit-points', name: 'Hit points',
    blocks: [
      { type: 'heading', id: 'h1', properties: ['name'], size: 1 },
      { type: 'property', id: 'p1', properties: ['hp'], display: 'Hit Points', conditioned: true, ...line },
      { type: 'property', id: 'p2', properties: ['speed'], display: 'Speed' },
    ],
  } as unknown as FsLayout;
}

function stats(template: StatblockTemplate): Extract<TemplateBlock, { type: 'stat' }>[] {
  return flattenReadingOrder(template.layout.blocks).filter((block): block is Extract<TemplateBlock, { type: 'stat' }> => block.type === 'stat');
}

describe('dice callbacks that pick where the dice come from', () => {
  it('name the field they roll from, however the test, the read and the fallback are written', () => {
    expect(diceCallbackKey(HIT_DICE_CALLBACK)).toBe('hit_dice');
    expect(diceCallbackKey('if (monster.hit_dice) return [{ text: monster.hit_dice }];\nreturn property;')).toBe('hit_dice');
    expect(diceCallbackKey('if ("damage" in monster) { return monster.damage; } else return property;')).toBe('damage');
  });

  it.each([
    ['another field than the one tested', 'if ("hit_dice" in monster) { return [{ text: monster.hp }]; } else { return property; }'],
    ['no fallback to the line', 'if ("hit_dice" in monster) { return [{ text: monster.hit_dice }]; }'],
    ['another fallback', 'if ("hit_dice" in monster) { return [{ text: monster.hit_dice }]; } else { return "1d6"; }'],
    ['more than the text', 'if ("hit_dice" in monster) { return [{ text: monster.hit_dice, original: "x" }]; } return property;'],
    ['both an else and a statement after it', 'if ("hit_dice" in monster) { return monster.hit_dice; } else { return property; } return property;'],
    ['work of its own', 'const d = monster.hit_dice; if (d) { return [{ text: d }]; } return property;'],
    ['no callback at all', 'return property;'],
  ])('are not recognised with %s', (_, code) => {
    expect(diceCallbackKey(code)).toBeNull();
  });

  it('are read with their else branch, which callback patterns and lookups still refuse', () => {
    const [guard] = parseCallbackBody(HIT_DICE_CALLBACK) ?? [];
    expect(guard).toMatchObject({ kind: 'if', otherwise: [{ kind: 'return', value: { kind: 'name', name: 'property' } }] });
    expect(parseCallbackBody('if (monster.a) return 1; else if (monster.b) return 2; else return 3;')?.[0]).toMatchObject({
      kind: 'if', otherwise: [{ kind: 'if', otherwise: [{ kind: 'return' }] }],
    });
    expect(callbackPattern('let s = [monster.a]; if (monster.b) { s.push(monster.b); } else { s.push("-"); } return s.join(" ");')).toBeNull();
    expect(lookupCallback('const T = { "1": { xp: 10 } }; if (monster.cr in T) { return T[monster.cr].xp; } else { return "?"; } return "";')).toBeNull();
  });
});

describe('a property whose dice roll from another field', () => {
  it('becomes a Value that rolls from it, its callback carried and not kept as code', () => {
    const layout = hitPointsLayout({ dice: true, diceProperty: 'hit_dice', diceCallback: HIT_DICE_CALLBACK });
    const { template } = fsLayoutToTemplate({ ...layout, blocks: [layout.blocks[0]!, { ...layout.blocks[1]!, properties: ['wounds'] }] } as FsLayout, { id: 'dice-abc123' });
    const [wounds] = stats(template);
    expect(wounds).toMatchObject({ field: 'wounds', rollFrom: 'hit_dice' });
    expect(wounds?.fsExtras).toEqual({ dice: true });
    expect(template.fields.find((field) => field.key === 'hit_dice')?.type).toBe('dice');
    expectParses(template);
  });

  it('takes the field from the callback where no diceProperty names it', () => {
    const layout = hitPointsLayout({ dice: true, diceCallback: HIT_DICE_CALLBACK });
    const { template } = fsLayoutToTemplate({ ...layout, blocks: [{ ...layout.blocks[1]!, properties: ['wounds'] }] } as FsLayout, { id: 'dice-abc123' });
    expect(stats(template)[0]).toMatchObject({ field: 'wounds', rollFrom: 'hit_dice', fsExtras: { dice: true } });
  });

  it('keeps a dice callback of any other shape for export, as code', () => {
    const other = 'return [{ text: `${monster.hit_dice} + ${monster.con}` }];';
    const layout = hitPointsLayout({ dice: true, diceProperty: 'hit_dice', diceCallback: other });
    const { template } = fsLayoutToTemplate({ ...layout, blocks: [{ ...layout.blocks[1]!, properties: ['wounds'] }] } as FsLayout, { id: 'dice-abc123' });
    expect(stats(template)[0]?.fsExtras).toEqual({ dice: true, diceCallback: other });
    expect(lostCode(layout, template)).toEqual([]);
  });
});

describe("Basic 5e's hit points line", () => {
  it('goes to the header, whose hit dice roll the hit points, and loses no code', () => {
    const layout = hitPointsLayout({ dice: true, diceProperty: 'hit_dice', diceCallback: HIT_DICE_CALLBACK, callback: HP_CALLBACK });
    const { template, report } = fsLayoutToTemplate(layout, { id: 'dice-abc123' });
    expect(stats(template).map((stat) => stat.field)).toEqual(['speed']);
    expect(template.header?.hidden ?? []).not.toContain('hp');
    expect(template.fields.find((field) => field.key === 'hit_dice')?.type).toBe('dice');
    expect(report.scripts).toEqual([]);
    expect(lostCode(layout, template)).toEqual([]);
    expectParses(template);
  });

  it('stays in the layout where it holds code Atlas keeps for export, and the header hides its hit points', () => {
    const other = 'return [{ text: `${monster.hit_dice} + ${monster.con}` }];';
    const layout = hitPointsLayout({ dice: true, diceProperty: 'hit_dice', diceCallback: other, callback: HP_CALLBACK });
    const { template } = fsLayoutToTemplate(layout, { id: 'dice-abc123' });
    expect(stats(template).map((stat) => stat.field)).toEqual(['hp', 'speed']);
    expect(template.header?.hidden).toContain('hp');
    expect(lostCode(layout, template)).toEqual([]);
  });
});
