// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { isStatblockNote, statblockNoteKnown, unparsedFrontmatterStatblock } from '../../../../src/app/statblocks/resolve/statblockNote';
import { addNote, creatureVault, forbidWrites, type CreatureVault } from '../../../mocks/creatureVault';

const NATIVE = 'Bestiary/Marsh Warden.md';

let current: CreatureVault;
beforeEach(() => {
  current = creatureVault();
  addNote(current, NATIVE, { statblock: true, 'atlas-template': 'builtin:draw-steel-monster', name: 'Marsh Warden' });
});
afterEach(() => { Reflect.deleteProperty(window, 'FantasyStatblocks'); });

const note = (path: string): TFile => new TFile(path);
const reads = (): number => (current.app.vault.cachedRead as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

describe('which notes show as a statblock', () => {
  it('knows native and Fantasy Statblocks frontmatter from the metadata cache, without reading the note', async () => {
    expect(statblockNoteKnown(current.app, note(NATIVE))).toBe(true);
    expect(statblockNoteKnown(current.app, note('Bestiary/Goblin.md'))).toBe(true);
    expect(await isStatblockNote(current.app, note(NATIVE))).toBe(true);
    expect(reads()).toBe(0);
  });

  it('reads a note only to find a statblock fence, also without Fantasy Statblocks', async () => {
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    expect(statblockNoteKnown(current.app, note('Bestiary/Orc.md'))).toBe(false);
    expect(await isStatblockNote(current.app, note('Bestiary/Orc.md'))).toBe(true);
    expect(await isStatblockNote(current.app, note('Notes/Plain.md'))).toBe(false);
  });

  it('counts a bestiary creature parsed from the note or named like it, as token links fall back to', async () => {
    current.bestiary.push({ name: 'Plain', path: 'Notes/Plain.md' });
    expect(statblockNoteKnown(current.app, note('Notes/Plain.md'))).toBe(true);

    Object.assign(window, { FantasyStatblocks: { getBestiaryCreatures: () => [], hasCreature: (name: string) => name === 'Wolf', getCreatureFromBestiary: () => ({ name: 'Wolf' }) } });
    current.files.set('Notes/Wolf.md', 'A wolf.');
    expect(await isStatblockNote(current.app, note('Notes/Wolf.md'))).toBe(true);
  });

  it('tells a frontmatter statblock Fantasy Statblocks has not parsed from one it has, and from native notes', () => {
    expect(unparsedFrontmatterStatblock(current.app, note('Bestiary/Goblin.md'))).toBe(true);
    expect(unparsedFrontmatterStatblock(current.app, note(NATIVE))).toBe(false);
    expect(unparsedFrontmatterStatblock(current.app, note('Bestiary/Orc.md'))).toBe(false);
    current.bestiary.push({ name: 'Goblin', path: 'Bestiary/Goblin.md' });
    expect(unparsedFrontmatterStatblock(current.app, note('Bestiary/Goblin.md'))).toBe(false);
    current.bestiary.length = 0;
    Reflect.deleteProperty(window, 'FantasyStatblocks');
    expect(unparsedFrontmatterStatblock(current.app, note('Bestiary/Goblin.md'))).toBe(false);
  });

  it('never takes a file that is no note for a statblock, and never writes', async () => {
    const refusals = forbidWrites(current.app);
    current.files.set('Bestiary/Orc.txt', '```statblock\nname: Orc\n```');
    expect(await isStatblockNote(current.app, note('Bestiary/Orc.txt'))).toBe(false);
    expect(refusals.every((refusal) => refusal.mock.calls.length === 0)).toBe(true);
  });
});
