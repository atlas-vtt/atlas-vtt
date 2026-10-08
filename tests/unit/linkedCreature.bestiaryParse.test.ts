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
