// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { localImage, statblockImportCandidate, statblockLookup } from '../../src/app/services/statblockImportCandidates';
import { statblockImageFile } from '../../src/app/statblocks/render/shared/statblockImage';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { addNote, creatureVault, type CreatureVault } from '../mocks/creatureVault';

const TOKEN = '2. Mechanics/bestiary/aberration/token/a-mi-kuk-tob2.png';
/** How TTRPG Convert CLI names it: from the vault's root, with its spaces percent-encoded. */
const CLI_TOKEN = '/2.%20Mechanics/bestiary/aberration/token/a-mi-kuk-tob2.png';
const NOTE = '2. Mechanics/bestiary/aberration/A-mi-kuk.md';

describe('statblockImageFile', () => {
  const { app } = createInMemoryApp({
    files: { [TOKEN]: 'image', 'Art/100%20club.png': 'image', 'Art/100 club.png': 'image', 'Art/wolf.png': 'image', 'Art/C#.png': 'image', 'Art/C.md': 'a note' },
  });
  const pathOf = (raw: string): string | null => statblockImageFile(app, raw, NOTE)?.path ?? null;

  it('finds a path written from the vault\'s root with percent-encoded spaces, as TTRPG Convert CLI writes it', () => {
    expect(pathOf(CLI_TOKEN)).toBe(TOKEN);
    expect(pathOf(TOKEN)).toBe(TOKEN);
    expect(pathOf(`/${TOKEN}`)).toBe(TOKEN);
  });

  it('reads embeds and links without their alias or heading, and a file named with a percent sign or a hash as written', () => {
    expect(pathOf('![[wolf.png|Wolf]]')).toBe('Art/wolf.png');
    expect(pathOf('[[wolf.png#top]]')).toBe('Art/wolf.png');
    expect(pathOf('Art/100%20club.png')).toBe('Art/100%20club.png');
    expect(pathOf('Art/C#.png')).toBe('Art/C#.png');
  });

  it('finds a vault path the link resolver does not', () => {
    const links = vi.spyOn(app.metadataCache, 'getFirstLinkpathDest').mockReturnValue(null);
    expect(pathOf(CLI_TOKEN)).toBe(TOKEN);
    links.mockRestore();
  });

  it('gives the importer images only', () => {
    expect(localImage(app, '[[C]]', NOTE)).toBeNull();
    expect(localImage(app, CLI_TOKEN, NOTE)?.path).toBe(TOKEN);
  });

  it('finds nothing for a web address, a missing file or no value', () => {
    expect(pathOf('https://example.org/2.%20Mechanics/wolf.png')).toBeNull();
    expect(pathOf('/2.%20Mechanics/missing.png')).toBeNull();
    expect(pathOf('')).toBeNull();
  });
});

describe('importing a statblock whose image TTRPG Convert CLI wrote', () => {
  let current: CreatureVault;
  beforeEach(() => {
    current = creatureVault();
    current.files.set(TOKEN, 'image');
    current.files.set(NOTE, '---\nstatblock: inline\n---\n```statblock\nname: A-mi-kuk\n```');
  });
  afterEach(() => {
    TemplateLibrary.release(current.app);
    Reflect.deleteProperty(window, 'FantasyStatblocks');
  });

  it('is ready, with the image the inline statblock names', async () => {
    current.bestiary.push({ name: 'A-mi-kuk (ToB2)', path: NOTE, layout: 'Basic 5e Layout', image: CLI_TOKEN });
    const lookup = statblockLookup([], current.bestiary);
    expect(await statblockImportCandidate(current.app, new TFile(NOTE), lookup)).toMatchObject({ status: 'ready', imagePath: TOKEN });
  });

  it('is ready, with the image a frontmatter statblock names', async () => {
    const note = '2. Mechanics/bestiary/aberration/Frontmatter.md';
    addNote(current, note, { statblock: true, name: 'A-mi-kuk', image: CLI_TOKEN });
    const lookup = statblockLookup([], current.bestiary);
    expect(await statblockImportCandidate(current.app, new TFile(note), lookup)).toMatchObject({ status: 'ready', imagePath: TOKEN });
  });
});
