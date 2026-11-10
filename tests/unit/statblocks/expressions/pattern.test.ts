import { isExpressionError, type ExpressionError } from '../../../../src/app/statblocks/expressions/errors';
import { renderPattern, type PatternContext, type PatternRender } from '../../../../src/app/statblocks/expressions/pattern';
import {
  escapePatternText, parsePattern, parsePatternCached, singleFieldPattern,
} from '../../../../src/app/statblocks/expressions/patternParse';
import type { PatternAst } from '../../../../src/app/statblocks/expressions/patternTypes';
import type { FieldValue, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { fieldLabels, readerFor } from '../../../../src/app/statblocks/values/fieldValues';
import { randomString, seededRandom } from './seededRandom';

const FIELDS: TemplateField[] = [
  { key: 'size', label: 'Size', type: 'choice' },
  { key: 'type', label: 'Type', type: 'text' },
  { key: 'subtype', label: 'Subtype', type: 'text' },
  { key: 'alignment', label: 'Alignment', type: 'text' },
  { key: 'initiative', label: 'Initiative', type: 'number' },
  { key: 'hp', label: 'HP', type: 'number', formerKeys: ['hit_points'] },
  { key: 'hit_dice', label: 'Hit Dice', type: 'dice' },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'] },
  { key: 'damage_immunities', label: 'Damage Immunities', type: 'text' },
  { key: 'condition_immunities', label: 'Condition Immunities', type: 'text' },
  { key: 'cr', label: 'CR', type: 'rating' },
];

const LOOKUPS = {
  xp: { 0: '10', '1/8': '25', '1/4': '50', '1/2': '100', 1: '200', 2: '450', 3: '700' },
  pb: { 0: '+2', '1/8': '+2', '1/4': '+2', '1/2': '+2', 1: '+2', 2: '+2', 3: '+2' },
};

function ast(source: string): PatternAst {
  const result = parsePattern(source);
  if (isExpressionError(result)) throw new Error(`${source}: ${result.message}`);
  return result;
}

function render(source: string, values: Record<string, FieldValue>, context: PatternContext = {}): PatternRender {
  return renderPattern(ast(source), readerFor(values, FIELDS), { lookups: LOOKUPS, ...context });
}

function text(source: string, values: Record<string, FieldValue>, context?: PatternContext): string {
  return render(source, values, context).text;
}

function syntaxOf(source: string): ExpressionError {
  const result = parsePattern(source);
  if (!isExpressionError(result)) throw new Error(`${source} parsed`);
  return result;
}

describe('the 5E 2024 template patterns', () => {
  it('writes the size, type, subtype and alignment line', () => {
    const line = '{size} {type}[ ({subtype})][, {alignment}]';
    expect(text(line, { size: 'Large', type: 'plant', alignment: 'unaligned' })).toBe('Large plant, unaligned');
    expect(text(line, { size: 'Medium', type: 'humanoid', subtype: 'goblinoid', alignment: 'neutral evil' }))
      .toBe('Medium humanoid (goblinoid), neutral evil');
    expect(text(line, { size: 'Tiny', type: 'beast' })).toBe('Tiny beast');
    expect(text(line, { type: 'beast' })).toBe('beast');
    expect(render(line, {})).toEqual({ text: '', empty: true, problems: [] });
  });

  it('writes the initiative with its score', () => {
    const initiative = '{initiative|signed} ({=initiative + 10})';
    expect(text(initiative, { initiative: 2 })).toBe('+2 (12)');
    expect(text(initiative, { initiative: '+3' })).toBe('+3 (13)');
    expect(text(initiative, { initiative: -1 })).toBe('-1 (9)');
    expect(text(initiative, { initiative: 0 })).toBe('+0 (10)');
    const missing = render(initiative, {}, { labelOf: fieldLabels(FIELDS) });
    expect(missing).toMatchObject({ text: '', empty: true });
    expect(missing.problems).toEqual([{ kind: 'unbound', ref: 'initiative', message: 'Initiative is empty.' }]);
  });

  it('derives the initiative from Dexterity as a fallback', () => {
    const fallback = '{=floor((stats.1 - 10) / 2)|signed} ({=floor((stats.1 - 10) / 2) + 10})';
    expect(text(fallback, { stats: [21, 14, 20, 16, 13, 18] })).toBe('+2 (12)');
    expect(text(fallback, { stats: [10, 8, 10, 10, 10, 10] })).toBe('-1 (9)');
    expect(text(fallback, { stats: [10, 10] })).toBe('+0 (10)');
    expect(render(fallback, {}).empty).toBe(true);
    expect(render(fallback, { stats: [10, 'n/a'] }, { labelOf: fieldLabels(FIELDS) }).problems[0])
      .toEqual({ kind: 'not-a-number', ref: 'stats.1', message: "Dex isn't a number." });
  });

  it('writes hit points with their dice', () => {
    expect(text('{hp}[ ({hit_dice})]', { hp: 52, hit_dice: '7d10 + 14' })).toBe('52 (7d10 + 14)');
    expect(text('{hp}[ ({hit_dice})]', { hp: 52 })).toBe('52');
    expect(text('{hp}[ ({hit_dice})]', { hit_points: 7 })).toBe('7');
  });

  it('writes both immunities on one line', () => {
    const immunities = '{damage_immunities, condition_immunities|join:; }';
    expect(text(immunities, { damage_immunities: 'Poison', condition_immunities: 'Poisoned' })).toBe('Poison; Poisoned');
    expect(text(immunities, { condition_immunities: 'Charmed, Frightened' })).toBe('Charmed, Frightened');
    expect(text(immunities, { damage_immunities: ['Fire', 'Cold'], condition_immunities: 'Poisoned' })).toBe('Fire, Cold; Poisoned');
    expect(render(immunities, { damage_immunities: '', condition_immunities: [] }).empty).toBe(true);
  });

  it('writes the challenge rating with XP and proficiency bonus', () => {
    const challenge = '{cr}[ (XP {cr|lookup:xp}; PB {cr|lookup:pb})]';
    expect(text(challenge, { cr: '1/4' })).toBe('1/4 (XP 50; PB +2)');
    expect(text(challenge, { cr: 3 })).toBe('3 (XP 700; PB +2)');
    expect(text(challenge, { cr: '\u00bd' })).toBe('\u00bd (XP 100; PB +2)');
    expect(text(challenge, { cr: 31 })).toBe('31');
    expect(render(challenge, {}).empty).toBe(true);
  });
});

describe('pattern values', () => {
  it('joins several refs with a comma when no join filter is given', () => {
    expect(text('{size, type, subtype}', { size: 'Large', type: 'plant' })).toBe('Large, plant');
  });

  it('writes a list field item by item', () => {
    expect(text('{languages}', { languages: ['Common', '', 'Elvish'] })).toBe('Common, Elvish');
    expect(text('{languages|join: · }', { languages: ['Common', 'Elvish'] })).toBe('Common · Elvish');
    expect(text('{languages|count}', { languages: ['Common', 'Elvish', null] })).toBe('2');
    expect(text('{saves|count}', { saves: { dex: 5, con: 3 } })).toBe('2');
    expect(text('{saves}', { saves: [{ dex: 5 }, { con: 3 }] })).toBe('dex 5, con 3');
  });

  it('runs filters in order', () => {
    expect(text('{type|upper}', { type: 'plant' })).toBe('PLANT');
    expect(text('{type|upper|lower}', { type: 'Plant' })).toBe('plant');
    expect(text('{hit_dice|avg}', { hit_dice: '7d10 + 14' })).toBe('52');
    expect(text('{hit_dice|avg|signed}', { hit_dice: '1d4 - 5' })).toBe('-3');
    expect(text('{bonus|signed}', { bonus: ['2', 'x', -1] })).toBe('+2, x, -1');
    expect(text('{=hp / 3}', { hp: 10 })).toBe('3.33');
  });

  it('skips the filters of an empty value', () => {
    expect(render('{languages|count}', { languages: [] }).empty).toBe(true);
    expect(render('{missing|lookup:nowhere}', {}).problems).toEqual([]);
  });

  it('says when a lookup table does not exist', () => {
    const result = render('{cr}[ ({cr|lookup:gold})]', { cr: 2 });
    expect(result.text).toBe('2');
    expect(result.problems).toEqual([{ kind: 'unbound', ref: 'gold', message: 'There is no lookup table called \u201cgold\u201d.' }]);
  });

  it('reads the Scores slot and other refs in formulas', () => {
    expect(text('{=floor((value - 10) / 2)|signed}', {}, { value: 15 })).toBe('+2');
    expect(text('{=hp * 2}', { hit_points: 4 })).toBe('8');
  });
});

describe('optional parts and emptiness', () => {
  it('drops an optional part when a value directly in it is empty', () => {
    expect(text('{a}[ ({b} and {c})]', { a: 'A', b: 'B' })).toBe('A');
    expect(text('{a}[ ({b} and {c})]', { a: 'A', b: 'B', c: 'C' })).toBe('A (B and C)');
  });

  it('keeps an outer part whose nested part dropped', () => {
    expect(text('{a}[ ({b}[, {c}])]', { a: 'A', b: 'B' })).toBe('A (B)');
    expect(text('{a}[ ({b}[, {c}])]', { a: 'A', b: 'B', c: 'C' })).toBe('A (B, C)');
    expect(text('{a}[ ([{b}][{c}])]', { a: 'A' })).toBe('A');
  });

  it('keeps an optional part of text alone', () => {
    expect(text('{a}[ ft.]', { a: 30 })).toBe('30 ft.');
  });

  it('is empty only when it holds values and none showed', () => {
    expect(render('None', {})).toEqual({ text: 'None', empty: false, problems: [] });
    expect(render('AC {ac}', {})).toEqual({ text: '', empty: true, problems: [] });
    expect(render('{a} {b}', { b: 'B' })).toMatchObject({ text: 'B', empty: false });
    expect(render('', {})).toEqual({ text: '', empty: false, problems: [] });
  });

  it('counts 0 and false as values', () => {
    expect(text('{a}/{b}', { a: 0, b: false })).toBe('0/No');
  });
});

describe('pattern syntax', () => {
  it('reads escapes as the characters themselves', () => {
    expect(text('AC {ac} \\[{aac}\\]', { ac: 12, aac: 7 })).toBe('AC 12 [7]');
    expect(text('\\{\\}\\\\\\,\\|', {})).toBe('{}\\,|');
    expect(text('C:\\path', {})).toBe('C:\\path');
    expect(text('{odd\\,key}', { 'odd,key': 'yes' })).toBe('yes');
    expect(text('{a, b|join:\\|}', { a: 1, b: 2 })).toBe('1|2');
  });

  it('builds a tree of text, values, formulas and optional parts', () => {
    expect(ast('HP {hp|signed}[ ({=hp + 1})]')).toEqual({
      kind: 'pattern',
      nodes: [
        { kind: 'text', text: 'HP ' },
        { kind: 'refs', refs: ['hp'], filters: [{ name: 'signed' }] },
        { kind: 'optional', nodes: [
          { kind: 'text', text: ' (' },
          { kind: 'formula', source: 'hp + 1', filters: [],
            formula: { kind: 'binary', op: '+', left: { kind: 'ref', ref: 'hp' }, right: { kind: 'number', value: 1 } } },
          { kind: 'text', text: ')' },
        ] },
      ],
    });
    expect(ast('{ a , b |join:, |lookup: xp }').nodes).toEqual([
      { kind: 'refs', refs: ['a', 'b'], filters: [{ name: 'join', text: ', ' }, { name: 'lookup', table: 'xp' }] },
    ]);
  });

  it.each([
    ['{hp', 'A \u201c{\u201d is never closed.', 0],
    ['x {=hp + 1', 'A \u201c{\u201d is never closed.', 2],
    ['{hp|signed', 'A \u201c{\u201d is never closed.', 0],
    ['[{hp}', 'A \u201c[\u201d is never closed.', 0],
    ['{hp}]', 'There is a \u201c]\u201d without a \u201c[\u201d. Write \\] for the character itself.', 4],
    ['a}', 'There is a \u201c}\u201d without a \u201c{\u201d. Write \\} for the character itself.', 1],
    ['{}', 'A value needs the name of a field, like {hp}.', 1],
    ['{a,}', 'A value needs the name of a field, like {hp}.', 3],
    ['{a[b]}', '\u201c[\u201d can\'t be used inside { }. Write \\[ for the character itself.', 2],
    ['{a|sgined}', 'There is no filter called \u201csgined\u201d. There are signed, upper, lower, count, avg, lookup and join.', 3],
    ['{a|}', 'A filter is missing after \u201c|\u201d.', 3],
    ['{a|lookup}', 'lookup needs the name of a table, like {cr|lookup:xp}.', 3],
    ['{a|lookup: }', 'lookup needs the name of a table, like {cr|lookup:xp}.', 3],
    ['{a|join}', 'join needs the text to join with, like {a, b|join:; }.', 3],
    ['{a|signed:2}', 'signed takes nothing after \u201c:\u201d.', 3],
    ['{=}', 'The formula is empty.', 2],
    ['AC {=ac + }', 'The formula ends too early.', 10],
    ['{=floor(hp}', 'A \u201c(\u201d is never closed.', 7],
  ])('%j: %s', (source, message, at) => {
    expect(syntaxOf(source)).toEqual({ kind: 'syntax', message, at });
  });

  it('refuses optional parts nested deeper than any template needs', () => {
    expect(syntaxOf(`${'['.repeat(40)}x${']'.repeat(40)}`).message).toBe('Optional parts are nested too deeply.');
    expect(syntaxOf('x'.repeat(10_001)).message).toBe('The pattern is too long.');
  });

  it('accepts filter names in any case', () => {
    expect(text('{a|UPPER}', { a: 'x' })).toBe('X');
  });
});

describe('pattern helpers', () => {
  it('makes the pattern of a block without one', () => {
    const values = { name: 'Marsh Warden', 'odd}key': ['a', 'b'] };
    expect(renderPattern(singleFieldPattern('name'), readerFor(values, FIELDS)).text).toBe('Marsh Warden');
    expect(renderPattern(singleFieldPattern('odd}key'), readerFor(values, FIELDS)).text).toBe('a, b');
  });

  it('remembers parsed patterns', () => {
    expect(parsePatternCached('{hp}[ ({hit_dice})]')).toBe(parsePatternCached('{hp}[ ({hit_dice})]'));
    expect(parsePatternCached('{hp')).toEqual(parsePattern('{hp'));
  });

  it('escapes text so that it shows exactly as written', () => {
    const alphabet = 'ab {}[]|,\\=:.';
    for (let seed = 1; seed <= 500; seed++) {
      const written = randomString(seededRandom(seed), alphabet, 30).trim();
      expect(text(escapePatternText(written), {}), `seed ${seed}: ${written}`).toBe(written);
    }
  });
});

describe('pattern fuzz', () => {
  it('never throws on random text and renders whatever parses', () => {
    const alphabet = '{}[]|,\\=:. abhp0123+-*/()signedupperlookupjoincount;';
    const reader = readerFor({ a: 'A', b: [1, 2], hp: 7, xp: '1/4' }, FIELDS);
    for (let seed = 1; seed <= 3000; seed++) {
      const source = randomString(seededRandom(seed), alphabet, 40);
      const result = parsePattern(source);
      expect(parsePattern(source), `seed ${seed}`).toEqual(result);
      if (isExpressionError(result)) {
        expect(result.kind).toBe('syntax');
        expect(result.at).toBeGreaterThanOrEqual(0);
        expect(result.at).toBeLessThanOrEqual(source.length);
        continue;
      }
      const rendered = renderPattern(result, reader, { lookups: LOOKUPS, value: 12 });
      expect(typeof rendered.text, `seed ${seed}: ${source}`).toBe('string');
      if (rendered.empty) expect(rendered.text).toBe('');
    }
  });
});
