// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import {
  frontmatterOfText,
  frontmatterSource,
  statblockSourceFromText,
  statblockSourceOf,
} from '../../../../src/app/statblocks/notes/statblockSource';
import { addNote, creatureVault, type CreatureVault } from '../../../mocks/creatureVault';
import { MARSH_ID } from '../library/templateTexts';

const WARDEN = 'Bestiary/Marsh Warden.md';
const NATIVE = { statblock: true, 'atlas-template': MARSH_ID, name: 'Marsh Warden', hp: 30 };

let current: CreatureVault;
beforeEach(() => { current = creatureVault(); });
afterEach(() => { Reflect.deleteProperty(window, 'FantasyStatblocks'); });

const sourceOf = (path: string) => statblockSourceOf(current.app, new TFile(path));

describe('statblockSourceOf: vault notes', () => {
  it('tells native, Fantasy Statblocks frontmatter and fence statblocks apart', async () => {
    addNote(current, WARDEN, NATIVE);
    addNote(current, 'Bestiary/Quoted.md', { ...NATIVE, statblock: 'true' });
    addNote(current, 'Bestiary/Imp.md', { statblock: 'inline' }, '```statblock\nname: Imp\nhp: 3\n```');

    expect(await sourceOf(WARDEN)).toEqual({ kind: 'atlas', templateId: MARSH_ID });
    expect(await sourceOf('Bestiary/Quoted.md')).toEqual({ kind: 'atlas', templateId: MARSH_ID });
    expect(await sourceOf('Bestiary/Goblin.md')).toEqual({ kind: 'fs-frontmatter' });
    expect(await sourceOf('Bestiary/Orc.md')).toEqual({ kind: 'fs-fence', params: { name: 'Orc', cr: '1/2' } });
    expect(await sourceOf('Bestiary/Imp.md')).toEqual({ kind: 'fs-fence', params: { name: 'Imp', hp: 3 } });
  });

  it('reads the file only when the frontmatter does not decide', async () => {
    addNote(current, WARDEN, NATIVE);
    const read = vi.spyOn(current.app.vault, 'cachedRead');
    await sourceOf(WARDEN);
    await sourceOf('Bestiary/Goblin.md');
    expect(read).not.toHaveBeenCalled();
    await sourceOf('Bestiary/Orc.md');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('knows notes that are no statblock', async () => {
    addNote(current, 'Notes/Layout only.md', { statblock: 'Basic 5e Layout' });
    addNote(current, 'Notes/Template only.md', { 'atlas-template': MARSH_ID });
    addNote(current, 'Notes/Empty template.md', { statblock: true, 'atlas-template': ' ' });
    current.files.set('Templates/Marsh.atlastemplate', '{}');

    expect(await sourceOf('Notes/Plain.md')).toBeNull();
    expect(await sourceOf('Notes/Layout only.md')).toBeNull();
    expect(await sourceOf('Notes/Template only.md')).toBeNull();
    expect(await sourceOf('Notes/Empty template.md')).toEqual({ kind: 'fs-frontmatter' });
    expect(await sourceOf('Templates/Marsh.atlastemplate')).toBeNull();
  });

  it('counts statblock: inline without a fence, as Fantasy Statblocks does', async () => {
    addNote(current, 'Bestiary/Lost.md', { statblock: 'inline' });
    expect(await sourceOf('Bestiary/Lost.md')).toEqual({ kind: 'fs-fence', params: {} });
  });
});

describe('statblockSourceFromText: notes outside the vault', () => {
  it('gives the same answers from text', () => {
    expect(statblockSourceFromText(`---\nstatblock: true\natlas-template: ${MARSH_ID}\nname: Warden\n---\nBody`)).toEqual({ kind: 'atlas', templateId: MARSH_ID });
    expect(statblockSourceFromText('---\nstatblock: true\nname: Goblin\n---\n')).toEqual({ kind: 'fs-frontmatter' });
    expect(statblockSourceFromText('---\ntags: [lore]\n---\n```statblock\ncreature: Goblin\n```')).toEqual({ kind: 'fs-fence', params: { creature: 'Goblin' } });
    expect(statblockSourceFromText('---\nstatblock: inline\n---\nNo fence')).toEqual({ kind: 'fs-fence', params: {} });
    expect(statblockSourceFromText('# Just a note')).toBeNull();
    expect(statblockSourceFromText('---\nstatblock: Basic 5e Layout\n---\n')).toBeNull();
  });

  it('reads frontmatter as the metadata cache does', () => {
    expect(statblockSourceFromText(`﻿---\r\nstatblock: true\r\natlas-template: ${MARSH_ID}\r\n---\r\n`)).toEqual({ kind: 'atlas', templateId: MARSH_ID });
    expect(frontmatterOfText('---\n- a list\n---\n')).toBeNull();
    expect(frontmatterOfText('No frontmatter')).toBeNull();
    expect(frontmatterOfText('---\nname: Imp\n---\n')).toEqual({ name: 'Imp' });
  });

  it('looks for a fence when the frontmatter cannot be read', () => {
    expect(statblockSourceFromText('---\nname: [unclosed\n---\n```statblock\nname: Orc\n```')).toEqual({ kind: 'fs-fence', params: { name: 'Orc' } });
    expect(statblockSourceFromText('```statblock\ncreature: [unclosed\n```')).toEqual({ kind: 'fs-fence', params: {} });
  });

  it('decides from frontmatter alone only for statblock: true', () => {
    expect(frontmatterSource(undefined)).toBeNull();
    expect(frontmatterSource({ statblock: 'inline' })).toBeNull();
    expect(frontmatterSource({ statblock: true, 'atlas-template': 7 })).toEqual({ kind: 'fs-frontmatter' });
  });
});
