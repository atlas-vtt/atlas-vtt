import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { TokenStatblockLinkService } from '../../src/app/services/TokenStatblockLinkService';
import { creatureVault, type CreatureVault } from '../mocks/creatureVault';
import { parseFrontmatter } from '../mocks/inMemoryVault';
import { installParsingBestiary } from '../mocks/parsingBestiary';

const image = 'atlas-vtt/assets/goblin.webp';
const mapPath = 'Maps/Cave.atlasmap';
/** A token as a map file holds it, with values of its own that only a link may replace. */
const placed = {
  id: 't1', kind: 'character', imagePath: image, x: 0, y: 0,
  name: 'Old name', difficulty: 'CR 9', hp: { current: 3, max: 9 }, maxHpOverridden: true,
};
const RESOLVED = 'fantasy-statblocks:bestiary:resolved';

interface Statblock {
  kind: string;
  note: string;
  text: string;
  /** The note's bestiary entry once Fantasy Statblocks has parsed it. */
  parsed?: { name: string; path: string; [field: string]: unknown };
  /** Whether the parse has reached the note when the link is made. */
  parsedEarly?: boolean;
  /** What a link after the parse writes onto the token. */
  linked: Record<string, unknown>;
}

/** A note that holds its whole statblock: nothing of it comes from another creature. */
const SELF_CONTAINED: Statblock = {
  kind: 'a note that holds its whole statblock',
  note: 'Bestiary/Warlord.md',
  text: '---\nstatblock: true\nname: Goblin Chief\nhp: 21\ncr: 2\n---\n',
  parsed: { name: 'Goblin Chief', path: 'Bestiary/Warlord.md', hp: 21, cr: 2 },
  linked: { name: 'Goblin Chief', difficulty: 'CR 2', hp: { current: 21, max: 21 } },
};

/** The statblocks whose creature needs the bestiary by name, which cannot be read during the parse. */
const NEEDS_BESTIARY: Statblock[] = [
  {
    kind: 'a fence that builds on a bestiary creature',
    note: 'Bestiary/Boss.md',
    text: '```statblock\ncreature: Goblin\nname: Goblin Boss\nhp: 21\n```',
    linked: { name: 'Goblin Boss', difficulty: 'CR 1/4', hp: { current: 21, max: 21 } },
  },
  {
    kind: 'a note that only shares its name with a bestiary creature',
    note: 'Notes/Goblin.md',
    text: 'Lore about goblins.',
    linked: { name: 'Goblin', difficulty: 'CR 1/4', hp: { current: 7, max: 7 } },
  },
  {
    kind: 'a parsed note that extends a bestiary creature',
    note: 'Bestiary/Chief.md',
    text: '---\nstatblock: true\nname: Goblin Chief\nextends: Goblin\nhp: 21\n---\n',
    parsed: { name: 'Goblin Chief', path: 'Bestiary/Chief.md', extends: 'Goblin', hp: 21 },
    parsedEarly: true,
    linked: { name: 'Goblin Chief', difficulty: 'CR 1/4', hp: { current: 21, max: 21 } },
  },
];

interface Linking {
  vault: CreatureVault;
  service: TokenStatblockLinkService;
  token: () => Record<string, unknown>;
  /** Ends the parse, and gives whatever waited for it time to run. */
  endParse: () => Promise<void>;
}

async function setup(statblock: Statblock): Promise<Linking> {
  const vault = creatureVault();
  vault.files.set(statblock.note, statblock.text);
  vault.files.set(mapPath, JSON.stringify({ version: 4, state: { version: 4, objects: { tokens: { t1: placed } } } }));
  // Frontmatter as the notes hold it, so the image a link writes is read back like any other field.
  vault.app.metadataCache.getFileCache = ((file: TFile) =>
    ({ frontmatter: parseFrontmatter(vault.files.get(file.path) ?? '') })) as never;
  const bestiary = installParsingBestiary([{ name: 'Goblin', cr: '1/4', hp: 7 }]);
  if (statblock.parsed && statblock.parsedEarly) bestiary.creatures.push(statblock.parsed);

  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.addTokenAsset({ name: 'Goblin', imagePath: image, tags: [], collection: 'Default' });
  return {
    vault,
    service: TokenStatblockLinkService.getInstance(vault.app),
    token: () => (JSON.parse(vault.files.get(mapPath)!) as { state: { objects: { tokens: { t1: Record<string, unknown> } } } }).state.objects.tokens.t1,
    endParse: async () => {
      if (statblock.parsed && !statblock.parsedEarly) bestiary.creatures.push(statblock.parsed);
      bestiary.finish();
      vault.workspace.trigger(RESOLVED);
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    },
  };
}

/** The token a link made after the parse leaves in the map file. */
async function linkedAfterParse(statblock: Statblock): Promise<Record<string, unknown>> {
  const { service, token, endParse } = await setup(statblock);
  await endParse();
  await service.linkTokenToStatblock(image, statblock.note, { showConfirmation: false });
  Reflect.set(AssetService, 'instance', null);
  Reflect.set(TokenStatblockLinkService, 'instance', null);
  return token();
}

beforeEach(() => {
  Reflect.set(AssetService, 'instance', null);
  Reflect.set(TokenStatblockLinkService, 'instance', null);
});
afterEach(() => { Reflect.deleteProperty(window, 'FantasyStatblocks'); });

describe('linking a token while Fantasy Statblocks parses the vault', () => {
  it('writes a statblock its note holds whole into a closed map, exactly as a link after the parse does', async () => {
    const afterParse = await linkedAfterParse(SELF_CONTAINED);
    expect(afterParse).toMatchObject({ statblockPath: SELF_CONTAINED.note, ...SELF_CONTAINED.linked });
    expect(afterParse).not.toHaveProperty('maxHpOverridden');

    const { service, token } = await setup(SELF_CONTAINED);
    await expect(service.linkTokenToStatblock(image, SELF_CONTAINED.note, { showConfirmation: false })).resolves.toBe(true);
    expect(token()).toEqual(afterParse);
  });

  it.each(NEEDS_BESTIARY)('writes the link alone for $kind, also when the parse ends', async (statblock) => {
    const { service, token, endParse } = await setup(statblock);
    await expect(service.linkTokenToStatblock(image, statblock.note, { showConfirmation: false })).resolves.toBe(true);
    expect(token()).toEqual({ ...placed, statblockPath: statblock.note });

    await endParse();
    expect(token()).toEqual({ ...placed, statblockPath: statblock.note });
  });

  it.each(NEEDS_BESTIARY)('takes the statblock of $kind when the link is made after the parse', async (statblock) => {
    expect(await linkedAfterParse(statblock)).toMatchObject({ statblockPath: statblock.note, ...statblock.linked });
  });

  it('leaves a map alone that was changed after the link, when the parse ends', async () => {
    const { vault, service, token, endParse } = await setup(SELF_CONTAINED);
    await service.linkTokenToStatblock(image, SELF_CONTAINED.note, { showConfirmation: false });

    // The map is played and saved: the token renamed, wounded, its maximum set by hand.
    const played = { ...token(), name: 'Grik the Bold', hp: { current: 5, max: 30 }, maxHpOverridden: true };
    const saved = JSON.stringify({ version: 4, state: { version: 4, objects: { tokens: { t1: played } } } });
    vault.files.set(mapPath, saved);

    await endParse();
    expect(vault.files.get(mapPath)).toBe(saved);
  });
});
