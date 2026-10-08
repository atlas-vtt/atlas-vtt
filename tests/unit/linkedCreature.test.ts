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

describe('trait entries of a note that are not what a statblock holds', () => {
  const note = 'Bestiary/Goblin.md';
  /** A list that counts how often one of its items is read, and gives up where a walk has plainly run away. */
  let reads = 0;
  const counted = <T>(list: T[]): T[] => new Proxy(list, {
    get(target, key, receiver): unknown {
      if (typeof key === 'string' && /^\d+$/.test(key) && ++reads > 100_000) throw new Error('The walk did not stop.');
      return Reflect.get(target, key, receiver);
    },
  });
  const actionsOf = async (actions: unknown[]): Promise<Array<{ name: string; desc: string }>> => {
    current.frontmatter[note] = { statblock: true, name: 'Goblin', actions };
    reads = 0;
    const creature = await resolveLinkedCreature(current.app, note);
    return creature?.actions as Array<{ name: string; desc: string }>;
  };

  it('reads lists that hold each other many times over once, not once per way to reach them', async () => {
    // Nine levels of ten lists, each holding the ten lists below it: a billion ways down, ninety lists.
    let level: unknown[][] = Array.from({ length: 10 }, () => counted(Array<unknown>(10).fill('x')));
    for (let depth = 1; depth < 9; depth++) {
      const below = level;
      level = Array.from({ length: 10 }, () => counted([...below]));
    }

    const [action] = await actionsOf([counted(['Swarm', ...level])]);
    expect(action?.name).toBe('Swarm');
    expect(reads).toBeLessThan(1000);
  });

  it('stops reading a description at its length limit instead of reading all of it first', async () => {
    const [action] = await actionsOf([counted(['Monologue', ...Array<string>(5000).fill('word '.repeat(200))])]);
    expect(action?.desc.length).toBeGreaterThan(1000);
    expect(action?.desc.length).toBeLessThanOrEqual(10_100);
    expect(reads).toBeLessThan(100);
  });

  it('reads no deeper than a few levels, however deep an entry is nested', async () => {
    let deep: unknown = 'the bottom';
    for (let depth = 0; depth < 10_000; depth++) deep = [deep];

    await expect(actionsOf([['Abyss', 'Falls.', deep]])).resolves.toEqual([{ name: 'Abyss', desc: 'Falls. ' }]);
  });

  it('reads a list that holds itself once', async () => {
    const loop: unknown[] = ['Again and'];
    loop.push(loop, 'again.');
    const entry: unknown[] = ['Echo'];
    entry.push(entry);

    await expect(actionsOf([['Loop', loop], entry]))
      .resolves.toEqual([{ name: 'Loop', desc: 'Again and  again.' }, { name: 'Echo', desc: '' }]);
  });

  it('reads many entries that share one wide list within a fixed number of steps', async () => {
    const wide: unknown[] = [];
    for (let item = 0; item < 3000; item++) wide.push(wide);
    const shared = counted(wide);

    const actions = await actionsOf(Array.from({ length: 3000 }, () => counted(['Shared', shared])));
    expect(actions).toHaveLength(3000);
    expect(reads).toBeLessThan(50_000);
  });

  it('lists the keys of a map that many entries share once', async () => {
    let listings = 0;
    const wide: Record<string, unknown> = { ['long '.repeat(3000)]: 'first' };
    for (let key = 0; key < 1000; key++) wide[`key ${key}`] = key;
    const shared = new Proxy(wide, {
      ownKeys(target): Array<string | symbol> {
        listings += 1;
        return Reflect.ownKeys(target);
      },
    });

    const actions = await actionsOf(Array.from({ length: 500 }, () => ['Shared', shared, shared]));
    expect(actions).toHaveLength(500);
    expect(actions[0]?.desc.length).toBeLessThanOrEqual(10_100);
    expect(listings).toBe(1);
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
