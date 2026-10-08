import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Document, parseDocument, visit } from 'yaml';

/** Counts what reaches the parser, so a test tells a refused text from a parsed one without timing either. */
const parser = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  return { ...actual, parseYaml: (text: string): unknown => { parser.calls.push(text); return actual.parseYaml(text); } };
});

import { TFile, parseYaml, type App } from 'obsidian';
import { NOTE_YAML_LIMITS, aliasesOfAnchors, parseNoteYaml } from '../../src/app/services/noteYaml';
import { parseStatblockFence, statblockSourceFromText } from '../../src/app/services/statblockNoteSource';
import { statblockTokenAppearance } from '../../src/app/plugin/statblockTokenAppearance';
import { readBase } from '../../src/app/loot/LootBaseReader';
import type { TokenEntity } from '../../src/app/types';

beforeEach(() => { parser.calls.length = 0; });

/** `count` aliases of one anchor, each written by `alias`, after the anchor written by `anchor`. */
function aliased(count: number, anchor = 'shared: &shared [1, 2]\n', alias = (index: number): string => `k${index}: *shared\n`): string {
  return anchor + Array.from({ length: count }, (_, index) => alias(index)).join('');
}

function refused(text: string): boolean {
  parser.calls.length = 0;
  try {
    parseNoteYaml(text);
  } catch {
    return parser.calls.length === 0;
  }
  return false;
}

describe('the limits on a note\'s YAML', () => {
  it('parses a text up to the length limit and refuses a longer one', () => {
    const upTo = (length: number): string => `lore: "${'x'.repeat(length - 'lore: ""'.length)}"`;
    expect(parseNoteYaml(upTo(NOTE_YAML_LIMITS.characters))).toEqual({ lore: 'x'.repeat(NOTE_YAML_LIMITS.characters - 8) });
    expect(parser.calls).toHaveLength(1);
    expect(refused(upTo(NOTE_YAML_LIMITS.characters + 1))).toBe(true);
  });

  it('parses a text with an anchor up to the alias limit and refuses one alias more', () => {
    const within = parseNoteYaml(aliased(NOTE_YAML_LIMITS.aliases)) as Record<string, unknown>;
    expect(within.k0).toEqual([1, 2]);
    expect(within[`k${NOTE_YAML_LIMITS.aliases - 1}`]).toBe(within.shared);
    expect(refused(aliased(NOTE_YAML_LIMITS.aliases + 1))).toBe(true);
  });

  it('refuses a text of many aliases without handing it to the parser', () => {
    // A list that holds itself, held again by every entry of a second list.
    const selfHeld = (count: number): string => `a: &a [${Array<string>(count).fill('*a').join(', ')}]\nb: [${Array<string>(count).fill('*a').join(', ')}]\n`;
    for (const count of [9, 100, 5000]) expect(refused(selfHeld(count))).toBe(true);
    expect(parser.calls).toHaveLength(0);
  });

  it('leaves a text without an anchor to the parser, whatever it holds', () => {
    const text = `lore: |\n${Array.from({ length: 60 }, (_, line) => `  *Line ${line}* of the lore`).join('\n')}\n`;
    expect(parseNoteYaml(text)).toEqual(parseYaml(text));
    // Aliases of an anchor that is not there are the parser's to refuse.
    expect(() => parseNoteYaml(Array.from({ length: 40 }, (_, index) => `k${index}: *missing`).join('\n'))).toThrow();
    expect(parser.calls.length).toBeGreaterThan(0);
  });
});

/** A text with the anchor `&shared` and `count` aliases of it, each written the same way. */
type Spelling = (count: number) => string;
const repeated = (count: number, alias: (index: number) => string): string => Array.from({ length: count }, (_, index) => alias(index)).join('');
const inMap = (alias: (index: number) => string): Spelling => (count) => `shared: &shared {x: 1}\n${repeated(count, alias)}`;
const inList = (alias: (index: number) => string): Spelling => (count) => `- &shared {x: 1}\n${repeated(count, alias)}`;

/** Every way YAML lets an alias be written. */
const ALIAS_SPELLINGS: Record<string, Spelling> = {
  'a value of a map': inMap((index) => `k${index}: *shared\n`),
  'a value after a tab': inMap((index) => `k${index}:\t*shared\n`),
  'a value on the next line': inMap((index) => `k${index}:\n  *shared\n`),
  'a value followed by a comment': inMap((index) => `k${index}: *shared # as before\n`),
  'a value with Windows line ends': inMap((index) => `k${index}: *shared\r\n`),
  'a key': inMap((index) => `? *shared\n: ${index}\n`),
  'a merged map': inMap((index) => `m${index}:\n  <<: *shared\n`),
  'an item of a flow list': inMap((index) => `f${index}: [*shared]\n`),
  'an item after a comma': inMap((index) => `f${index}: [1,*shared]\n`),
  'an item on its own line of a flow list': inMap((index) => `f${index}: [\n  1,\n  *shared\n]\n`),
  'a value of a flow map': inMap((index) => `f${index}: {k: *shared}\n`),
  'a value after a quoted key': inMap((index) => `f${index}: {"k": *shared}\n`),
  'an entry of a list': inList(() => '- *shared\n'),
  'an entry of a list in a list': inList(() => '- - *shared\n'),
  'an entry of a list after a tab': inList(() => '-\t*shared\n'),
  'a value in an entry of a list': inList((index) => `- k${index}: *shared\n`),
  'the items of one flow list': (count) => `shared: &shared {x: 1}\nall: [${Array<string>(count).fill('*shared').join(', ')}]\n`,
  'the items of one flow list, close together': (count) => `shared: &shared {x: 1}\nall: [${Array<string>(count).fill('*shared').join(',')}]\n`,
};

/** Every way YAML lets an anchor be written, each with one alias of it. */
const ANCHOR_SPELLINGS: Record<string, string> = {
  'a value': 'shared: &shared [1]\nagain: *shared\n',
  'a value after a tag': 'shared: !!seq &shared [1]\nagain: *shared\n',
  'a value before a tag': 'shared: &shared !!seq [1]\nagain: *shared\n',
  'a value after a tag written out in full': 'shared: !<tag:yaml.org,2002:seq> &shared [1]\nagain: *shared\n',
  'a value after a tag that holds brackets': 'shared: !<t[u]{v}> &shared one\nagain: *shared\n',
  'a value on the next line': 'shared:\n  &shared\n  - 1\nagain: *shared\n',
  'an entry of a list': '- &shared [1]\n- *shared\n',
  'an item of a flow list': 'list: [&shared [1], *shared]\n',
  'a value of a flow map': 'map: {"k": &shared [1], again: *shared}\n',
  'a key': '? &shared k\n: 1\nagain: *shared\n',
  'a name with marks in it': 'shared: &a*b:c&d [1]\nagain: *a*b:c&d\n',
};

/** The aliases the parser finds in a text that it can follow to an anchor; null where it takes the text for no YAML. */
function aliasesTheParserFollows(text: string): number | null {
  const document = parseDocument(text);
  if (document.errors.length > 0) return null;
  let followed = 0;
  visit(document, { Alias(_key, alias) { if (alias.resolve(document)) followed += 1; } });
  return followed;
}

/** Numbers from 0 to 1 that follow from the seed, so the texts made with them are the same in every run. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How many texts put together at random are compared with the YAML library; a tenth as many are
 * texts the library writes itself. `VITE_NOTE_YAML_TRIALS=600000` runs a large sweep, which takes
 * minutes.
 */
const DEFAULT_TRIALS = 2000;
const TRIALS = Number(import.meta.env.VITE_NOTE_YAML_TRIALS ?? DEFAULT_TRIALS);
const SWEEP_TIMEOUT = TRIALS > DEFAULT_TRIALS ? 30 * 60_000 : undefined;

describe('anchors and aliases however they are written', () => {
  it.each(Object.keys(ALIAS_SPELLINGS))('counts an alias written as %s', (spelling) => {
    const text = ALIAS_SPELLINGS[spelling]!(NOTE_YAML_LIMITS.aliases + 1);
    // The text is YAML the parser takes, with that many aliases in it.
    expect(aliasesTheParserFollows(text)).toBe(NOTE_YAML_LIMITS.aliases + 1);

    expect(aliasesOfAnchors(text)).toBe(NOTE_YAML_LIMITS.aliases + 1);
    expect(refused(text)).toBe(true);
    expect(refused(ALIAS_SPELLINGS[spelling]!(NOTE_YAML_LIMITS.aliases))).toBe(false);
  });

  it.each(Object.keys(ANCHOR_SPELLINGS))('knows an anchor written as %s', (spelling) => {
    const text = ANCHOR_SPELLINGS[spelling]!;
    expect(aliasesTheParserFollows(text)).toBe(1);
    expect(aliasesOfAnchors(text)).toBe(1);
  });

  it('never counts fewer aliases than the parser can follow, in texts put together at random', () => {
    const pieces = ['*a', '*a', '*a', '&a', '&b', '*b', 'x', '"q"', ': ', ':', '- ', '? ', ',', ', ', '[', ']', '{', '}', ' ', '\n', '\n  ',
      '!t ', '!!str ', '!<a,b> ', '!<t[u> ', '!<t>', ' #c', '|', '1', '\t', '<<: ', 'k: ', 'j: ', '\n- ', '\nk: ', '\nj: ', '\r\n', '*a:', '&a:', '*', '&', '\uFEFF'];
    const random = seededRandom(20261008);
    let parsed = 0;
    let withAliases = 0;

    for (let sample = 0; sample < TRIALS; sample++) {
      let text = 'r: &a 1\n';
      for (let piece = 1 + Math.floor(random() * 8); piece > 0; piece--) text += pieces[Math.floor(random() * pieces.length)];
      const followed = aliasesTheParserFollows(text);
      if (followed === null) continue;
      parsed += 1;
      if (followed > 0) withAliases += 1;
      if (aliasesOfAnchors(text) < followed) throw new Error(`Counted too few in ${JSON.stringify(text)}`);
    }
    // The sample is one that means something: a share of the texts parse, some of them with aliases.
    expect(parsed).toBeGreaterThan(TRIALS / 20);
    expect(withAliases).toBeGreaterThan(TRIALS / 1000);
  }, SWEEP_TIMEOUT);

  it('never counts fewer aliases than the parser can follow, in texts the YAML library writes itself', () => {
    const random = seededRandom(8);
    const pick = <T>(choices: readonly T[]): T => choices[Math.floor(random() * choices.length)]!;
    let followed = 0;

    for (let sample = 0; sample < TRIALS / 10; sample++) {
      // Lists and maps that hold a few shared ones: the library writes each shared one once, with an anchor, and an alias wherever it stands again.
      const shared = [[1, 2], { x: 'y' }, ['deep', { z: [3] }]];
      const build = (depth: number): unknown => {
        const choice = random();
        if (depth > 3 || choice < 0.25) return pick(shared);
        if (choice < 0.4) return pick(['plain', '*not an alias', '&not an anchor', 'a: b', '- c']);
        if (choice < 0.7) return Array.from({ length: 1 + Math.floor(random() * 4) }, () => build(depth + 1));
        return Object.fromEntries(Array.from({ length: 1 + Math.floor(random() * 4) }, (_, key) => [`k${key}`, build(depth + 1)]));
      };
      const text = new Document(build(0), { aliasDuplicateObjects: true }).toString({
        collectionStyle: pick(['any', 'block', 'flow']),
        indent: 1 + Math.floor(random() * 4),
        indentSeq: random() < 0.5,
        lineWidth: pick([0, 20, 80]),
        flowCollectionPadding: random() < 0.5,
        defaultStringType: pick(['PLAIN', 'QUOTE_DOUBLE', 'QUOTE_SINGLE', 'BLOCK_LITERAL']),
      });
      const inText = aliasesTheParserFollows(text);
      if (inText === null) throw new Error(`The library does not read what it wrote: ${JSON.stringify(text)}`);
      followed += inText;
      if (aliasesOfAnchors(text) < inText) throw new Error(`Counted too few in ${JSON.stringify(text)}`);
    }
    expect(followed).toBeGreaterThan(TRIALS / 10);
  }, SWEEP_TIMEOUT);

  it('reads a text in one pass', () => {
    // Every character is looked at once: a text of nothing but openers, marks and names counts as many as it holds.
    expect(aliasesOfAnchors(`${'- *a, &b ! : [ { '.repeat(3000)}&a`)).toBe(3000);
  });
});

/** Statblocks as notes write them, full of what looks like an anchor or an alias and is neither. */
const STATBLOCK_TEXTS: Record<string, string> = {
  'a 5e fence with emphasis and dice': [
    'name: Goblin Boss',
    'size: Small',
    'type: humanoid (goblinoid)',
    'alignment: neutral evil',
    'ac: 17 (chain shirt, shield)',
    'hp: 21 (6d6)',
    'speed: 30 ft.',
    'stats: [10, 14, 10, 10, 8, 10]',
    'senses: darkvision 60 ft., passive Perception 9',
    'languages: Common, Goblin',
    'cr: 1',
    'traits:',
    '  - name: Nimble Escape',
    '    desc: "The goblin can take the *Disengage* or *Hide* action as a bonus action. See also **Cunning** & *Sly*."',
    'actions:',
    '  - name: Multiattack',
    '    desc: "The goblin makes two attacks with its scimitar. The second attack has *disadvantage*."',
    '  - name: Scimitar',
    '    desc: "*Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 5 (1d6 + 2) slashing damage & 2 (1d4) fire damage."',
    '  - name: Javelin',
    '    desc: "*Melee or Ranged Weapon Attack:* +2 to hit, reach 5 ft. or range 30/120 ft. *Hit:* 3 (1d6) piercing damage."',
    'reactions:',
    '  - name: Redirect Attack',
    '    desc: "When a creature the goblin can see targets it with an attack, the goblin chooses another goblin within 5 feet of it. The two goblins swap places, & the chosen goblin becomes the target instead."',
  ].join('\n'),
  'a fence with markdown in block texts': [
    'name: Lair of the Wyrm',
    'source: D&D 5e, Tome of Beasts & Co., &c.',
    'lore: |',
    ...Array.from({ length: 30 }, (_, line) => `  *Chapter ${line}.* The wyrm sleeps, &c. **Beware** its breath: 2 * 3 = 6 squares, 10 × 10 ft.`),
    'treasure: >',
    '  *Coins*, *gems* & *art*: roll 3d6 * 100 gp.',
    '  * a list item',
    '  * another, with *.md and **/*.ts in it',
    'actions:',
    ...Array.from({ length: 20 }, (_, action) => `  - [Bite ${action}, "*Melee Weapon Attack:* +${action} to hit, *Hit:* ${action} (1d10 + ${action}) & more."]`),
  ].join('\n'),
  'frontmatter of a Daggerheart adversary': [
    'statblock: true',
    'layout: Daggerheart Adversary',
    'name: "Acid Burrower"',
    'tier: 1',
    'type: Solo',
    'description: A horse-sized insect with digging claws & acidic blood.',
    'motives_and_tactics: Burrow, drag away, feed, reposition',
    'difficulty: 14',
    'thresholds: 8/15',
    'hp: 8',
    'stress: 3',
    'atk: "+3"',
    'attack: Claws',
    'range: Very Close',
    'damage: 1d12+2 phy',
    'experience: Tremor Sense +2',
    'feats:',
    '  - name: Relentless (3) - Passive',
    '    desc: The Burrower can be spotlighted up to three times per GM turn. Spend Fear as usual to spotlight them.',
    '  - name: "Earth Eruption - Action"',
    '    desc: "*Mark a Stress* to have the Burrower burst out of the ground. All creatures within Very Close range must succeed on an Agility Reaction Roll or be knocked over, making them **Vulnerable** until they next act."',
  ].join('\n'),
  'a Pathfinder creature with a long lore field': [
    'name: "Goblin Warrior"',
    'level: "Creature -1"',
    'rare_03: "Common"',
    'alignment: "CE"',
    'size: "Small"',
    'trait_03: "Goblin"',
    'trait_04: "Humanoid"',
    'modifier: 2',
    'perception:',
    '  - name: "Perception"',
    '    desc: "Perception +2; darkvision"',
    'languages: "Goblin"',
    'skills:',
    '  - name: "Skills"',
    '    desc: "Acrobatics: +5, Athletics: +2, Nature: +1, Stealth: +5"',
    'abilityMods: [0, 3, 1, 0, -1, 1]',
    `lore: "${'Goblins *love* fire & song. '.repeat(250)}"`,
    'sourcebook: "_Pathfinder Bestiary (Second Edition)_ & *Monster Core*"',
  ].join('\n'),
};

describe('statblocks that only look as if they held anchors or aliases', () => {
  it.each(Object.keys(STATBLOCK_TEXTS))('reads %s as the parser does', (kind) => {
    const text = STATBLOCK_TEXTS[kind]!;
    const asParsed = parseYaml(text);
    parser.calls.length = 0;

    expect(parseNoteYaml(text)).toEqual(asParsed);
    expect(parser.calls).toEqual([text]);
  });

  it('takes emphasis and ampersands for no alias of an anchor', () => {
    expect(aliasesOfAnchors(Object.values(STATBLOCK_TEXTS).join('\n'))).toBe(0);
    // Not even where each opens a line or follows a comma, as an anchor and an alias would
    expect(aliasesOfAnchors(`&c. and so on\n${'*Hit:* 5, *Hit:* 5\n'.repeat(40)}`)).toBe(0);
  });
});

describe('every reader of a note\'s YAML', () => {
  /** YAML the parser reads without trouble, and Atlas does not hand to it. */
  const beyond = aliased(NOTE_YAML_LIMITS.aliases + 1);
  beforeEach(() => { expect(parseYaml(beyond)).toBeTruthy(); parser.calls.length = 0; });

  it('takes a statblock fence beyond the limits for a fence it cannot read', () => {
    expect(parseStatblockFence(`\`\`\`statblock\n${beyond}\`\`\``)).toEqual({});
    expect(parser.calls).toEqual([]);
    expect(parseStatblockFence('```statblock\nname: Goblin\n```')).toEqual({ name: 'Goblin' });
  });

  it('takes frontmatter beyond the limits, in a note outside the vault, for frontmatter it cannot read', () => {
    expect(statblockSourceFromText(`---\nstatblock: true\n${beyond}---\n`)).toBeNull();
    expect(parser.calls).toEqual([]);
    expect(statblockSourceFromText('---\nstatblock: true\nname: Goblin\n---\n')).toEqual({ kind: 'frontmatter', frontmatter: { statblock: true, name: 'Goblin' } });
  });

  it('gives a token no name from a statblock whose frontmatter is beyond the limits', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const noteOf = (frontmatter: string): App => ({
      vault: { getAbstractFileByPath: (path: string) => new TFile(path), read: async () => `---\n${frontmatter}---\nBody\n` },
    }) as unknown as App;
    const token = { id: 't1', kind: 'character', statblockPath: 'Bestiary/Goblin.md', x: 0, y: 0 } as TokenEntity;
    const links = { getStatblockLinkedToToken: async () => null };

    await expect(statblockTokenAppearance(noteOf(`name: Goblin\n${beyond}`), token, links, () => [])).resolves.toEqual(token);
    expect(parser.calls).toEqual([]);
    await expect(statblockTokenAppearance(noteOf('name: Goblin\n'), token, links, () => [])).resolves.toMatchObject({ statblockName: 'Goblin' });
    errors.mockRestore();
  });

  it('takes a base beyond the limits for one it cannot read', () => {
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(readBase(`views:\n  - type: table\n${beyond}`, 'Loot.base')).toBeNull();
    expect(parser.calls).toEqual([]);
    expect(readBase('views:\n  - type: table\n', 'Loot.base')).toEqual({ views: [{ type: 'table' }] });
    warnings.mockRestore();
  });
});
