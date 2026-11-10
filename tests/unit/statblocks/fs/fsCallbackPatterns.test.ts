import { describe, expect, it } from 'vitest';
import { isExpressionError } from '../../../../src/app/statblocks/expressions/errors';
import { parseFormula } from '../../../../src/app/statblocks/expressions/parse';
import { parsePattern } from '../../../../src/app/statblocks/expressions/patternParse';
import { callbackPattern, entryTextKey, modifierFormula, returnsItemUnchanged } from '../../../../src/app/statblocks/fs/fsCallbackPatterns';
import { parseCallbackBody } from '../../../../src/app/statblocks/fs/fsCallbackSyntax';
import { trackKeys } from '../../../../src/app/statblocks/fs/fsScripts';
import { codeFieldRefs } from '../../../../src/app/statblocks/model/scriptReads';
import { mulberry32, pick } from '../model/treeFixtures';

describe('callbackPattern', () => {
  it.each([
    ['concatenated text', 'return monster.tier + " " + monster.type;', '{tier} {type}'],
    ['a template literal', 'return `${monster.ac} (${monster.ac_class})`;', '{ac} ({ac_class})'],
    ['bracket keys and single quotes', "return monster['hp'] + ' / ' + monster.hp_max", '{hp} / {hp_max}'],
    ['a sign written before the absolute value', 'return (monster.modifier < 0 ? "-" : "+") + Math.abs(monster.modifier);', '{modifier|signed}'],
    ['a plus written before positive values', 'return (monster.bonus >= 0 ? "+" : "") + monster.bonus;', '{bonus|signed}'],
    ['a sign inside a template', 'return `${monster.bonus >= 0 ? "+" : ""}${monster.bonus}`;', '{bonus|signed}'],
    ['a sign and text in a template', 'return `${monster.bonus < 0 ? "-" : "+"}${Math.abs(monster.bonus)} to hit`;', '{bonus|signed} to hit'],
    ['a list joined after an optional push',
      'const parts = [monster.armor];\nif (monster.armor_note?.length) {\n  parts.push(`(${monster.armor_note})`);\n}\nreturn parts.join(" ");',
      '{armor}[ ({armor_note})]'],
    ['an `in` test without braces', 'let s = [monster.hp]; if ("hd" in monster) s.push(`(${monster.hd})`); return s.join(" ");', '{hp}[ ({hd})]'],
    ['a test against null', 'var s = [monster.hp]; if (monster.hd != null) { s.push(monster.hd) } return s.join(" ")', '{hp}[ {hd}]'],
    ['a push without a test', 'const p = [monster.a]; p.push(monster.b); return p.join(" / ");', '{a} / {b}'],
    ['a join without a separator', 'const p = [monster.a, monster.b]; return p.join();', '{a}\\,{b}'],
    ['prose around values', 'return `Kill one _${monster.name}_ for every ${monster.hp} damage`;', 'Kill one _{name}_ for every {hp} damage'],
    ['String()', 'return String(monster.cr);', '{cr}'],
    ['a single field', 'return monster.cr', '{cr}'],
    ['comments', '// formats\nreturn monster.a + " " + monster.b; /* done */', '{a} {b}'],
    ['characters a pattern escapes', 'return monster.a + " {b} [c] | d, e \\\\";', '{a} \\{b\\} \\[c\\] \\| d\\, e \\\\'],
    ['keys a pattern escapes', 'return monster["x,y"] + "";', '{x\\,y}'],
    ['escapes in strings', 'return monster.a + "\\n\\"q\\"";', '{a}\n"q"'],
  ])('reads %s', (_, code, pattern) => {
    const read = callbackPattern(code);
    expect(read?.pattern).toBe(pattern);
    expect(read && isExpressionError(parsePattern(read.pattern))).toBe(false);
  });

  it('names the fields a pattern reads, in order', () => {
    expect(callbackPattern('return monster.b + " " + monster.a + monster.b;')?.refs).toEqual(['b', 'a']);
  });

  it.each([
    ['numbers added', 'return monster.a + monster.b;'],
    ['numbers added before text joins in', 'return monster.a + monster.b + " ft.";'],
    ['a method call', 'return monster.a.toUpperCase();'],
    ['a loop', 'let s = ""; for (const x of monster.list) { s += x; } return s;'],
    ['an arrow function', 'return monster.list.map(x => x.name).join(", ");'],
    ['a regular expression', 'return monster.a.replace(/x/g, "y");'],
    ['an else branch', 'if (monster.a) { return monster.a; } else { return "-"; }'],
    ['any other conditional', 'return monster.a ? monster.a : "-";'],
    ['an assignment', 'monster.a = 1; return monster.a;'],
    ['a global', 'return window.app + "";'],
    ['the item instead of the creature', 'return property.x + "";'],
    ['an optional push testing another field', 'const p = [monster.a]; if (monster.z) p.push(monster.b); return p.join(" ");'],
    ['a join of something else', 'const p = [monster.a]; return q.join(" ");'],
    ['nothing', ''],
    ['an empty return', 'return;'],
    ['an unterminated string', 'return monster.a + "'],
    ['an unterminated comment', 'return monster.a; /*'],
    ['a numeric escape', 'return monster.a + "\\u0041";'],
    ['code that is too long', `return ${'monster.p + '.repeat(500)}"";`],
  ])('leaves %s as JavaScript', (_, code) => {
    expect(callbackPattern(code)).toBeNull();
  });
});

describe('the other recognisers', () => {
  it('finds the key an entry’s text is under', () => {
    expect(entryTextKey('return property.text;')).toBe('text');
    expect(entryTextKey('return property["desc"]')).toBe('desc');
    expect(entryTextKey('return property.text + "!";')).toBeNull();
    expect(entryTextKey('return monster.text;')).toBeNull();
  });

  it('knows a callback that hands its item back', () => {
    expect(returnsItemUnchanged('return property;')).toBe(true);
    expect(returnsItemUnchanged('return property.name;')).toBe(false);
  });

  it.each([
    ['Math.floor((stat - 10) / 2)', 'floor((value - 10) / 2)'],
    ['return Math.floor(stat / 2);', 'floor(value / 2)'],
    ['stat', 'value'],
    ['Math.max(0, stat - monster.level)', 'max(0, value - level)'],
    ['-stat + 1', '(-value) + 1'],
    ['stat > 10 ? 1 : 0', null],
    ['Math.random()', null],
    ['stat * monster["hit-dice"]', null],
    ['monster.value', null],
    ['stat % 2', null],
  ])('reads the modifier %s as %s', (code, formula) => {
    expect(modifierFormula(code)).toBe(formula);
    if (formula) expect(isExpressionError(parseFormula(formula))).toBe(false);
  });

  it('finds the keys a script counts checkboxes up to', () => {
    const code = 'const el = createDiv();\nfor (let i = 0; i < monster.hp; i++) el.createEl("input", { type: "checkbox" });\n'
      + 'for (let s = 0; s <= monster["stress"]; s++) el.createEl("input", { type: "checkbox" });\nreturn el;';
    expect(trackKeys(code)).toEqual(['hp', 'stress']);
    expect(trackKeys(code.replace(/checkbox/g, 'radio'))).toEqual([]);
    expect(trackKeys('const box = "checkbox"; return monster.hp < 3;')).toEqual([]);
  });

  it('lists the keys code reads', () => {
    expect(codeFieldRefs('monster.a + monster?.b + monster["c d"] + monster.a.length')).toEqual(['a', 'b', 'c d']);
  });
});

describe('reading untrusted code', () => {
  const PIECES = [
    'return', ' ', 'monster', '.', 'a', '"x"', "'y'", '`', '${', '}', '(', ')', '[', ']', '{', '+', '-', '?', ':', '<', '0',
    ';', '\n', 'if', 'const', '=', 'p', '.push', '.join', '//', '/*', '*/', '\\', 'Math.abs', ',', '!', 'in', 'property',
  ];

  it('never throws, and what it reads is valid', () => {
    const random = mulberry32(20261004);
    for (let run = 0; run < 3000; run++) {
      const code = Array.from({ length: 1 + Math.floor(random() * 30) }, () => pick(random, PIECES)).join('');
      const pattern = callbackPattern(code);
      if (pattern) expect(isExpressionError(parsePattern(pattern.pattern))).toBe(false);
      const formula = modifierFormula(code);
      if (formula) expect(isExpressionError(parseFormula(formula))).toBe(false);
      expect(() => [entryTextKey(code), returnsItemUnchanged(code), trackKeys(code), codeFieldRefs(code)]).not.toThrow();
    }
  });

  it('gives up on nesting too deep instead of overflowing', () => {
    expect(parseCallbackBody(`return ${'('.repeat(1500)}monster.a${')'.repeat(1500)};`)).toBeNull();
    expect(parseCallbackBody(`return ${'!'.repeat(3000)}monster.a;`)).toBeNull();
    expect(parseCallbackBody(`return ${'['.repeat(1500)}${']'.repeat(1500)};`)).toBeNull();
    expect(parseCallbackBody(`return ${'`${'.repeat(600)}x${'}`'.repeat(600)};`)).toBeNull();
    expect(callbackPattern('return `${`${monster.a}`}`;')?.pattern).toBe('{a}');
  });
});
