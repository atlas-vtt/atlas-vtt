import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/app/i18n';
import { describeSense, newSense, senseNameProblem, senseProblem } from '../../src/app/gameSystems/senseEditing';
import { granting } from '../../src/app/gameSystems/senses/senseHelpers';
import type { SenseDefinition } from '../../src/app/types/senseTypes';

const sense = (changes: Partial<SenseDefinition> = {}): SenseDefinition => ({ ...newSense('own'), name: 'Echo sight', ...changes });
const seeing = (dim: SenseDefinition['sees']['dim'], dark: SenseDefinition['sees']['dark']): Pick<SenseDefinition, 'sees'> =>
  ({ sees: { bright: 'normal', dim, dark, magicalDark: 'none' } });

describe('describeSense', () => {
  afterEach(() => setLocale('en'));

  it('says what a sense that shows the map sees, and how', () => {
    expect(describeSense(sense())).toBe('Sees in darkness as dim light, in grey, within its range.');
    expect(describeSense(sense({ ...seeing('as-bright', 'none'), range: 'unlimited' }))).toBe('Sees in dim light as bright light.');
    expect(describeSense(sense({ ...seeing('normal', 'none'), range: 'optional' }))).toBe('Sees what is lit, within its range.');
    expect(describeSense(sense({ ...seeing('as-bright', 'as-dim'), look: 'colour', range: 'unlimited' })))
      .toBe('Sees in dim light as bright light and in darkness as dim light.');
    expect(describeSense(sense({ ...seeing('as-bright', 'as-bright'), look: 'heat', lineOfSight: false, seesInvisible: true, worksWhileBlinded: true })))
      .toBe('Sees in dim light as bright light and in darkness as bright light, as heat tones, within its range, through walls, invisible creatures too. Works while blinded.');
    expect(describeSense(sense({ ...seeing('normal', 'as-bright'), look: 'black-and-white', range: 'unlimited' })))
      .toBe('Sees in darkness as bright light, in black and white.');
  });

  it('says what a sense that feels creatures does', () => {
    const creatures = sense({ reveals: 'creatures', lineOfSight: false });
    expect(describeSense(creatures)).toBe('Senses creatures within its range, through walls.');
    expect(describeSense({ ...creatures, range: 'unlimited', lineOfSight: true, seesInvisible: true, precise: false }))
      .toBe('Senses creatures, invisible ones too. They show as outlines.');
    expect(describeSense({ ...creatures, worksWhileBlinded: true, precise: false }))
      .toBe('Senses creatures within its range, through walls. Works while blinded. They show as outlines.');
  });

  it('words the line in the active language', () => {
    setLocale('ru');
    expect(describeSense(sense({ lineOfSight: false }))).toBe('Видит во тьме как в тусклом свете, в оттенках серого, в пределах своего радиуса, сквозь стены.');
    expect(describeSense(sense({ reveals: 'creatures', range: 'unlimited', precise: false }))).toBe('Чувствует существ. Они показываются очертаниями.');
  });

  it('says what a modifier grants', () => {
    expect(describeSense({ id: 'own', name: 'See invisibility', description: '', ...granting('see-invisible') }))
      .toBe("Lets the token's sight see invisible creatures.");
  });
});

describe('senseProblem', () => {
  it('names what keeps a sense from being saved', () => {
    expect(senseNameProblem(sense({ name: ' ' }), [])).toBe('Give the sense a name.');
    expect(senseNameProblem(sense(), [sense({ id: 'other', name: 'echo SIGHT' })])).toBe('Another sense has this name.');
    expect(senseProblem(sense({ sees: { bright: 'none', dim: 'none', dark: 'none', magicalDark: 'none' } }), [])).toBe('Choose a light the sense works in.');
    expect(senseProblem(sense(), [])).toBeNull();
  });
});
