// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { TokenStatblockLinkService } from '../../src/app/services/TokenStatblockLinkService';
import { createInMemoryApp, parseFrontmatter } from '../mocks/inMemoryVault';

const notices = vi.hoisted(() => ({ shown: [] as string[] }));
vi.mock('../../src/app/ui/notice', () => ({ showNotice: (message: string) => { notices.shown.push(message); } }));

const note = 'Bestiary/Goblin.md';
const red = 'atlas-vtt/assets/goblin-red.webp';
const green = 'atlas-vtt/assets/goblin-green.webp';
const portrait = 'Artwork/goblin.webp';
const otherNote = 'Bestiary/Hobgoblin.md';

async function setup(noteText = '---\nstatblock: true\nname: Goblin\n---\nA goblin.') {
  const state = createInMemoryApp({ files: { [note]: noteText, [otherNote]: '---\nstatblock: true\nname: Hobgoblin\n---\n', [red]: 'RED', [green]: 'GREEN', [portrait]: 'ART' } });
  state.app.workspace = { ...state.app.workspace, trigger: vi.fn() };
  // The cache follows the note's text, as Obsidian's does once it has parsed a write.
  state.app.metadataCache.getFileCache = (file: TFile) => {
    const text = state.files.get(file.path);
    return text === undefined ? null : { frontmatter: parseFrontmatter(text) };
  };
  const assets = AssetService.getInstance(state.app);
  await assets.initialize();
  for (const imagePath of [red, green]) {
    await assets.addTokenAsset({ name: 'Goblin', imagePath, tags: [], collection: 'Default' });
  }
  return {
    assets,
    links: TokenStatblockLinkService.getInstance(state.app),
    image: (): unknown => parseFrontmatter(state.files.get(note)!)?.image,
  };
}

beforeEach(() => {
  notices.shown = [];
  Reflect.set(AssetService, 'instance', null);
  Reflect.set(TokenStatblockLinkService, 'instance', null);
});

describe('several tokens linking one statblock', () => {
  it('keeps every token linked and gives the statblock the first one\'s art only while it has no picture', async () => {
    const { assets, links, image } = await setup();

    await links.linkTokenToStatblock(red, note);
    await links.linkTokenToStatblock(green, note);

    expect(await links.getTokensLinkedToStatblock(note)).toEqual([red, green]);
    expect((await assets.getTokenAssets()).map((token) => token.statblockPath)).toEqual([note, note]);
    expect(image()).toBe(red);
  });

  it('leaves a statblock\'s own picture alone', async () => {
    const { links, image } = await setup(`---\nstatblock: true\nimage: ${portrait}\n---\nA goblin.`);

    await links.linkTokenToStatblock(red, note);
    await links.unlinkToken(red);

    expect(image()).toBe(portrait);
  });

  it('shows a token still linked once the token whose art was the picture leaves', async () => {
    const { links, image } = await setup();
    await links.linkTokenToStatblock(red, note);
    await links.linkTokenToStatblock(green, note);

    await links.unlinkToken(red);
    expect(await links.getTokensLinkedToStatblock(note)).toEqual([green]);
    expect(image()).toBe(green);

    await links.unlinkToken(green);
    expect(image()).toBeUndefined();
  });

  it('leaves the picture when a token whose art it is not leaves', async () => {
    const { links, image } = await setup();
    await links.linkTokenToStatblock(red, note);
    await links.linkTokenToStatblock(green, note);

    await links.unlinkToken(green);

    expect(await links.getTokensLinkedToStatblock(note)).toEqual([red]);
    expect(image()).toBe(red);
  });

  it('gives a statblock whose picture the vault no longer holds the linked token\'s art', async () => {
    const { links, image } = await setup('---\nstatblock: true\nname: Goblin\nimage: Artwork/gone.webp\n---\nA goblin.');

    await links.linkTokenToStatblock(red, note);

    expect(image()).toBe(red);
  });

  it('shows one notice for a link, and none where the caller shows the link itself', async () => {
    const { links } = await setup();

    await links.linkTokenToStatblock(red, note);
    expect(notices.shown).toEqual(['Token linked to statblock']);

    await links.linkTokenToStatblock(green, note, { notice: false });
    expect(notices.shown).toHaveLength(1);
  });

  it('says once that a token linked elsewhere moved, never that it was unlinked', async () => {
    const { links } = await setup();
    await links.linkTokenToStatblock(red, otherNote);
    await links.linkTokenToStatblock(green, note);
    notices.shown = [];

    await links.linkTokenToStatblock(red, note, { notice: false });

    expect(notices.shown).toEqual(['Goblin now links this statblock instead of Hobgoblin']);
    expect(await links.getTokensLinkedToStatblock(note)).toEqual([red, green]);
    expect(await links.getTokensLinkedToStatblock(otherNote)).toEqual([]);
  });
});
