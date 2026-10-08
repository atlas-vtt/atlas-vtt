import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveLinkedCreature } from '../../src/app/creatures/linkedCreature';
import { hasCreatureForNotePath } from '../../src/app/services/FantasyStatblocksService';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';
import { installParsingBestiary, type ParsingBestiary } from '../mocks/parsingBestiary';

const SRD_GOBLIN = { name: 'Goblin', cr: '1/4', hp: 7, source: 'SRD' };

let current: CreatureVault;
let bestiary: ParsingBestiary;
beforeEach(() => {
  current = creatureVault();
  bestiary = installParsingBestiary([SRD_GOBLIN]);
});
afterEach(() => { Reflect.deleteProperty(window, 'FantasyStatblocks'); });

describe('a creature read from a note\'s frontmatter', () => {
  it('reads list entries written as [name, description] as Fantasy Statblocks parses them', async () => {
    current.frontmatter['Bestiary/Goblin.md'] = {
      statblock: true,
      name: 'Goblin',
      traits: [{ name: 'Nimble Escape', desc: 'Disengage or Hide as a bonus action.' }, ['Pack Tactics', 'Advantage', 'near an ally.']],
      actions: [['Scimitar', 'Melee Weapon Attack: +4 to hit.']],
      bonus_actions: [['Hide', 3]],
      reactions: [['Parry']],
      legendary_actions: [['Move', ['Up to', 'half speed.']]],
      languages: ['Common', 'Goblin'],
    };

    await expect(resolveLinkedCreature(current.app, 'Bestiary/Goblin.md')).resolves.toMatchObject({
      traits: [{ name: 'Nimble Escape', desc: 'Disengage or Hide as a bonus action.' }, { name: 'Pack Tactics', desc: 'Advantage near an ally.' }],
      actions: [{ name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit.' }],
      bonus_actions: [{ name: 'Hide', desc: '3' }],
      reactions: [{ name: 'Parry', desc: '' }],
      legendary_actions: [{ name: 'Move', desc: 'Up to half speed.' }],
      languages: ['Common', 'Goblin'],
    });
  });

  it('leaves a list of plain words alone, which the Traits filter reads', async () => {
    current.frontmatter['Bestiary/Goblin.md'] = { statblock: true, name: 'Goblin', traits: ['goblin', 'humanoid'] };

    await expect(resolveLinkedCreature(current.app, 'Bestiary/Goblin.md'))
      .resolves.toMatchObject({ traits: ['goblin', 'humanoid'] });
  });

  it('is the note\'s own, with the file\'s name, where the note names no creature', async () => {
    // Fantasy Statblocks stores no creature without a name, so such a note never gets a bestiary entry.
    current.frontmatter['Bestiary/Goblin.md'] = { statblock: true, hp: 12 };
    bestiary.finish();

    const creature = await resolveLinkedCreature(current.app, 'Bestiary/Goblin.md');
    expect(creature).toEqual({ statblock: true, hp: 12, name: 'Goblin', path: 'Bestiary/Goblin.md' });
  });
});

describe('linked creatures while Fantasy Statblocks parses the vault', () => {
  it('reads a note from its own frontmatter, though a creature of its name is in the bestiary', async () => {
    current.frontmatter['Bestiary/Goblin.md'] = { statblock: true, name: 'Goblin', hp: 12 };

    await expect(resolveLinkedCreature(current.app, 'Bestiary/Goblin.md'))
      .resolves.toMatchObject({ name: 'Goblin', hp: 12, path: 'Bestiary/Goblin.md' });
  });

  it('knows no creature yet for a note that only shares a name with one, and finds it after the parse', async () => {
    current.files.set('Notes/Goblin.md', 'Lore about goblins.');

    // That the bestiary has a creature for the note is known at once, so its place can be held.
    expect(hasCreatureForNotePath('Notes/Goblin.md')).toBe(true);
    expect(hasCreatureForNotePath('Notes/Plain.md')).toBe(false);
    await expect(resolveLinkedCreature(current.app, 'Notes/Goblin.md')).resolves.toBeNull();

    bestiary.finish();
    await expect(resolveLinkedCreature(current.app, 'Notes/Goblin.md')).resolves.toMatchObject(SRD_GOBLIN);
  });

  it('waits with a fence that builds on a bestiary creature instead of showing half of it', async () => {
    current.files.set('Bestiary/Boss.md', '```statblock\ncreature: Goblin\nname: Goblin Boss\nhp: 21\n```');

    await expect(resolveLinkedCreature(current.app, 'Bestiary/Boss.md')).resolves.toBeNull();

    bestiary.finish();
    await expect(resolveLinkedCreature(current.app, 'Bestiary/Boss.md'))
      .resolves.toMatchObject({ name: 'Goblin Boss', hp: 21, cr: '1/4', path: 'Bestiary/Boss.md' });
  });

  it('gives a parsed creature that extends another as it was parsed, and extended after the parse', async () => {
    bestiary.creatures.push({ name: 'Goblin Boss', path: 'Bestiary/Boss.md', extends: 'Goblin', hp: 21 });

    const parsing = await resolveLinkedCreature(current.app, 'Bestiary/Boss.md');
    expect(parsing).toMatchObject({ name: 'Goblin Boss', hp: 21 });
    expect(parsing).not.toHaveProperty('cr');

    bestiary.finish();
    await expect(resolveLinkedCreature(current.app, 'Bestiary/Boss.md'))
      .resolves.toMatchObject({ name: 'Goblin Boss', hp: 21, cr: '1/4' });
  });
});
