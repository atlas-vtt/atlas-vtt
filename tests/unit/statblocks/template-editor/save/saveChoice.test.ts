import { describe, expect, it } from 'vitest';
import { freeName, nameTakenIn, saveChoice, type SaveSubject } from '../../../../../src/app/statblocks/editor/template-editor/save/saveChoice';
import { MARSH_CREATURE } from '../../../../fixtures/statblockTemplateFixtures';
import { libraryEntry } from '../../library/templateTexts';

const OWN: SaveSubject = { id: 'marsh-creature-k7m2qa', name: 'Marsh creature', builtIn: false, unsaved: false };
const BUILT_IN: SaveSubject = { id: 'builtin:generic-creature', name: 'Creature', builtIn: true, unsaved: false };
const NEW: SaveSubject = { id: 'new-template-abc123', name: 'New template', builtIn: false, unsaved: true };
const free = (): boolean => false;
const takenSwamp = (name: string): boolean => name.toLowerCase() === 'swamp';

describe('what Save does with the name typed', () => {
  it('updates a template under its own name, in any letter case, and saves another name as a new template', () => {
    expect(saveChoice(OWN, 'Marsh creature', free)).toMatchObject({ kind: 'update', label: 'Update', problem: null });
    expect(saveChoice(OWN, '  marsh CREATURE ', free)).toMatchObject({ kind: 'update', label: 'Update' });
    expect(saveChoice(OWN, 'Fen creature', free)).toMatchObject({ kind: 'new', label: 'Save as new', problem: null, hint: 'Marsh creature stays as it is.' });
  });

  it('never updates a built-in, and refuses its own name', () => {
    expect(saveChoice(BUILT_IN, 'Creature', free)).toMatchObject({
      kind: 'new', label: 'Save as new', problem: 'Built-in templates can\'t be changed. Give yours a name of its own.',
    });
    expect(saveChoice(BUILT_IN, 'My creature', free)).toMatchObject({ kind: 'new', label: 'Save as new', problem: null });
  });

  it('names a template never saved with its first Save', () => {
    expect(saveChoice(NEW, 'New template', free)).toMatchObject({ kind: 'new', label: 'Save', problem: null, hint: null });
  });

  it('refuses a name another template goes by, an empty one and one a file cannot carry, each with a sentence', () => {
    for (const subject of [OWN, BUILT_IN, NEW]) {
      expect(saveChoice(subject, 'Swamp', takenSwamp).problem).toBe('There is already a template named “Swamp”.');
      expect(saveChoice(subject, '   ', free).problem).toBe('Give the template a name.');
      expect(saveChoice(subject, 'Bog/creature', free).problem).toMatch(/^A name can't hold/);
    }
  });
});

describe('the names templates go by', () => {
  const templates = [libraryEntry(MARSH_CREATURE, 'Marsh creature'), { ...libraryEntry({ ...MARSH_CREATURE, id: 'builtin:x' }, 'Creature'), builtIn: true, path: null }];

  it('counts every template but the one being saved, built-ins included, in any letter case', () => {
    const taken = nameTakenIn(templates, MARSH_CREATURE.id);
    expect(taken('marsh creature')).toBe(false);
    expect(taken('CREATURE')).toBe(true);
    expect(nameTakenIn(templates, '')('Marsh creature')).toBe(true);
  });

  it('offers the first free name, numbered after the name asked for', () => {
    const taken = nameTakenIn(templates, '');
    expect(freeName('Fen creature', taken)).toBe('Fen creature');
    expect(freeName('Creature', taken)).toBe('Creature 2');
  });
});
