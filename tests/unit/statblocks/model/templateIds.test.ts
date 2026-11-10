import { describe, expect, it } from 'vitest';
import {
  blockIdSource, isValidTemplateId, newBlockId, newTemplateId, slugify,
} from '../../../../src/app/statblocks/model/templateIds';
import { mulberry32 } from './treeFixtures';

describe('slugify', () => {
  it.each([
    ['Marsh creature', 'marsh-creature'],
    ['  Marsh   Créature! ', 'marsh-creature'],
    ['Größe & Æther', 'grosse-aether'],
    ['5E (2024) Monster', '5e-2024-monster'],
    ['--a--b--', 'a-b'],
    ['', ''],
    ['!!!', ''],
    ['体力', ''],
  ])('%j → %j', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('keeps slugs to 40 characters, cut between words', () => {
    expect(slugify('The very long name of a template for the marsh campaign')).toBe('the-very-long-name-of-a-template-for-the');
    expect(slugify('a'.repeat(60))).toBe('a'.repeat(40));
  });
});

describe('newTemplateId', () => {
  it('is the slug and six base36 characters', () => {
    const id = newTemplateId('Marsh creature', mulberry32(1));
    expect(id).toMatch(/^marsh-creature-[0-9a-z]{6}$/);
    expect(newTemplateId('Marsh creature', mulberry32(1))).toBe(id);
    expect(isValidTemplateId(id)).toBe(true);
  });

  it('falls back to "template" for a name without letters', () => {
    expect(newTemplateId('!!!', () => 0)).toBe('template-000000');
  });

  it('is valid for any name', () => {
    const random = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const name = String.fromCharCode(...Array.from({ length: 12 }, () => 32 + Math.floor(random() * 400)));
      expect(isValidTemplateId(newTemplateId(name, random)), name).toBe(true);
    }
  });
});

describe('newBlockId', () => {
  it('is eight base36 characters', () => {
    expect(newBlockId(new Set(), mulberry32(5))).toMatch(/^[0-9a-z]{8}$/);
    expect(newBlockId(new Set(), () => 0)).toBe('00000000');
    expect(newBlockId(new Set(), () => 0.999999999)).toBe('zzzzzzzz');
  });

  it('stays in range for a random source that returns 1 or less than 0', () => {
    expect(newBlockId(new Set(), () => 1)).toBe('zzzzzzzz');
    expect(newBlockId(new Set(), () => -1)).toBe('00000000');
  });

  it('steps past taken ids instead of looping', () => {
    expect(newBlockId(new Set(['00000000', '00000001']), () => 0)).toBe('00000002');
    expect(newBlockId(new Set(['zzzzzzzz']), () => 0.999999999)).toBe('00000000');
  });

  it('gives a source thousands of different ids, none taken', () => {
    const taken = new Set(['a', 'b']);
    const nextId = blockIdSource(taken, mulberry32(11));
    const ids = Array.from({ length: 5000 }, nextId);
    expect(new Set(ids).size).toBe(5000);
    expect(ids.some((id) => taken.has(id))).toBe(false);
    const stuck = blockIdSource([], () => 0);
    expect([stuck(), stuck(), stuck()]).toEqual(['00000000', '00000001', '00000002']);
  });
});

describe('isValidTemplateId', () => {
  it.each([
    ['builtin:generic-creature', true],
    ['builtin:5e-2024-monster', true],
    ['marsh-creature-k7m2qa', true],
    ['template-000000', true],
    ['builtin:', false],
    ['builtin:Generic', false],
    ['marsh-creature', false],
    ['marsh-creature-K7M2QA', false],
    ['-k7m2qa', false],
    ['', false],
    ['marsh creature-k7m2qa', false],
  ])('%j is %s', (id, valid) => {
    expect(isValidTemplateId(id)).toBe(valid);
  });
});
