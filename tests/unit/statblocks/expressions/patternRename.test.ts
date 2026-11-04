import { describe, expect, it } from 'vitest';
import {
  formulaCanName, formulaRefs, patternFormulas, renameFormulaRefs, renamePatternRefs,
} from '../../../../src/app/statblocks/expressions/patternRename';
import { patternRefs } from '../../../../src/app/statblocks/expressions/patternRefs';

describe('renamePatternRefs', () => {
  it('renames plain, indexed and listed references and keeps everything else as written', () => {
    expect(renamePatternRefs('{hp}[ ({hit_dice})]', 'hp', 'health')).toBe('{health}[ ({hit_dice})]');
    expect(renamePatternRefs('STR {stats.0} DEX {stats.1}', 'stats', 'scores')).toBe('STR {scores.0} DEX {scores.1}');
    expect(renamePatternRefs('{ a , hp|join:\\, }', 'hp', 'health')).toBe('{ a , health|join:\\, }');
    expect(renamePatternRefs('{hpmax} {hp}', 'hp', 'health')).toBe('{hpmax} {health}');
  });

  it('renames inside formulas, but never a function, the slot word or a filter', () => {
    expect(renamePatternRefs('{=floor((stats.1 - 10) / 2)|signed}', 'stats', 'scores')).toBe('{=floor((scores.1 - 10) / 2)|signed}');
    expect(renamePatternRefs('{=max(floor, value)}', 'floor', 'base')).toBe('{=max(base, value)}');
    expect(renamePatternRefs('{cr|lookup:cr}', 'cr', 'rating')).toBe('{rating|lookup:cr}');
  });

  it('leaves escapes, text and a pattern that does not parse alone', () => {
    expect(renamePatternRefs('AC \\{ac\\} {ac}', 'ac', 'armor')).toBe('AC \\{ac\\} {armor}');
    expect(renamePatternRefs('{ac', 'ac', 'armor')).toBe('{ac');
    expect(renamePatternRefs('{ac}', 'ac', 'ac')).toBe('{ac}');
  });

  it('agrees with patternRefs: afterwards the pattern reads the new key where it read the old', () => {
    const pattern = '{size} {type}[ ({subtype})][, {alignment}] {=hp + size.1}';
    const renamed = renamePatternRefs(pattern, 'size', 'bulk');
    expect(patternRefs(renamed)).toEqual(patternRefs(pattern).map((key) => (key === 'size' ? 'bulk' : key)));
  });
});

describe('formulas', () => {
  it('renames references in formula text and finds what a formula reads', () => {
    expect(renameFormulaRefs('floor((value - 10) / 2) + prof', 'prof', 'proficiency')).toBe('floor((value - 10) / 2) + proficiency');
    expect(renameFormulaRefs('not a formula ±', 'prof', 'proficiency')).toBe('not a formula ±');
    expect(formulaRefs('max(ac, stats.1) + value')).toEqual(['ac', 'stats']);
    expect(patternFormulas('{hp} [{=hp * 2}] {=ac}')).toEqual(['hp * 2', 'ac']);
  });

  it('knows which keys a formula can name', () => {
    expect(formulaCanName('hit_points')).toBe(true);
    expect(formulaCanName('hit-points')).toBe(false);
  });
});
