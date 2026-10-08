import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** The three statblocks whose creature needs the bestiary by name, each with what a link after the parse writes. */
const CASES = [
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
    linked: { name: 'Goblin Chief', difficulty: 'CR 1/4', hp: { current: 21, max: 21 } },
  },
];

interface Linking {
  vault: CreatureVault;
  service: TokenStatblockLinkService;
  token: () => Record<string, unknown>;
  endParse: () => void;
}

async function setup(statblock: (typeof CASES)[number]): Promise<Linking> {
  const vault = creatureVault();
  vault.files.set(statblock.note, statblock.text);
  vault.files.set(mapPath, JSON.stringify({ version: 4, state: { version: 4, objects: { tokens: { t1: placed } } } }));
  // Frontmatter as the notes hold it, so the image a link writes is read back like any other field.
  vault.app.metadataCache.getFileCache = ((file: TFile) =>
    ({ frontmatter: parseFrontmatter(vault.files.get(file.path) ?? '') })) as never;
  const bestiary = installParsingBestiary([{ name: 'Goblin', cr: '1/4', hp: 7 }, ...(statblock.parsed ? [statblock.parsed] : [])]);

  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.addTokenAsset({ name: 'Goblin', imagePath: image, tags: [], collection: 'Default' });
  return {
    vault,
    service: TokenStatblockLinkService.getInstance(vault.app),
    token: () => (JSON.parse(vault.files.get(mapPath)!) as { state: { objects: { tokens: { t1: Record<string, unknown> } } } }).state.objects.tokens.t1,
    endParse: () => {
      bestiary.finish();
      vault.workspace.trigger(RESOLVED);
    },
  };
}

beforeEach(() => {
  Reflect.set(AssetService, 'instance', null);
  Reflect.set(TokenStatblockLinkService, 'instance', null);
});
afterEach(() => {
  TokenStatblockLinkService.release();
  Reflect.deleteProperty(window, 'FantasyStatblocks');
  vi.restoreAllMocks();
});

describe.each(CASES)('linking a token to $kind', (statblock) => {
  it('gives the maps the link at once and the statblock once the bestiary is parsed, as a link made after the parse does', async () => {
    const after = await setup(statblock);
    after.endParse();
    await after.service.linkTokenToStatblock(image, statblock.note, { showConfirmation: false });
    const linkedAfterParse = after.token();
    expect(linkedAfterParse).toMatchObject({ statblockPath: statblock.note, ...statblock.linked });
    expect(linkedAfterParse).not.toHaveProperty('maxHpOverridden');

    Reflect.set(AssetService, 'instance', null);
    Reflect.set(TokenStatblockLinkService, 'instance', null);
    const during = await setup(statblock);
    // The link itself does not wait for the parse, which may never end.
    await expect(during.service.linkTokenToStatblock(image, statblock.note, { showConfirmation: false })).resolves.toBe(true);
    await expect(during.service.getStatblockLinkedToToken(image)).resolves.toBe(statblock.note);
    // The map holds the link, and nothing read from the bestiary as it is half parsed.
    expect(during.token()).toEqual({ ...placed, statblockPath: statblock.note });

    during.endParse();
    await vi.waitFor(() => expect(during.token()).toEqual(linkedAfterParse));
  });
});

describe('a link made while Fantasy Statblocks parses the vault', () => {
  const [fence] = CASES;

  it('leaves the maps alone when the token is unlinked before the parse ends', async () => {
    const { service, token, endParse } = await setup(fence!);
    await service.linkTokenToStatblock(image, fence!.note, { showConfirmation: false });
    await service.unlinkToken(image);

    endParse();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(token()).not.toHaveProperty('statblockPath');
    expect(token()).not.toHaveProperty('name');
  });

  it('stops waiting when the service is released', async () => {
    const { vault, service } = await setup(fence!);
    const listeners = vault.workspace.count();
    await service.linkTokenToStatblock(image, fence!.note, { showConfirmation: false });
    expect(vault.workspace.count()).toBe(listeners + 1);

    TokenStatblockLinkService.release();
    expect(vault.workspace.count()).toBe(listeners);
  });
});
