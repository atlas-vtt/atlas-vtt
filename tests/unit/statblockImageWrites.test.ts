// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { TokenStatblockLinkService } from '../../src/app/services/TokenStatblockLinkService';
import { movedPathOf, type MovedPath } from '../../src/app/services/renamedPaths';
import { NoteFieldWriter } from '../../src/app/statblocks/notes/NoteFieldWriter';
import { noteHarness, type NoteHarness } from './statblocks/notes/noteHarness';

const OLD_ART = 'atlas-vtt/assets/goblin.webp';
const NEW_ART = 'atlas-vtt/collections/keep/tokens/goblin.webp';
const OPEN = 'Bestiary/Goblin.md';
const CLOSED = 'Bestiary/Goblin boss.md';
const statblock = (image: string, extra = ''): string => `---\nstatblock: true\nname: Goblin\nimage: ${image}\n${extra}---\nA goblin.\n`;

interface ImageWriters {
  updateStatblockFrontmatter(moved: MovedPath): Promise<void>;
}
interface LinkWriters {
  updateStatblockImage(statblockPath: string, tokenImagePath: string, linked?: boolean): Promise<void>;
}

let harness: NoteHarness;
afterEach(() => {
  NoteFieldWriter.release(harness.app);
  vi.restoreAllMocks();
});

function spyWriter(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(NoteFieldWriter.forApp(harness.app), 'patchNow');
}

describe('FileReferenceService writes moved artwork through the note writer', () => {
  it('points open and closed statblock notes at the moved art, keeping unsaved typing in the open one', async () => {
    harness = noteHarness({ [OPEN]: statblock(OLD_ART), [CLOSED]: statblock(OLD_ART, 'token: other.webp\n'), 'Other.md': statblock('art/other.webp') });
    const view = harness.open(OPEN);
    view.editor.type(`${statblock(OLD_ART)}Typed.\n`);
    const patchNow = spyWriter();
    const service = Object.create(FileReferenceService.prototype) as ImageWriters;
    Object.assign(service, { app: harness.app });

    await service.updateStatblockFrontmatter(movedPathOf([{ from: OLD_ART, to: NEW_ART }]));

    expect(view.editor.getValue()).toBe(`${statblock(NEW_ART)}Typed.\n`);
    expect(harness.files.get(CLOSED)).toBe(statblock(NEW_ART, 'token: other.webp\n'));
    expect(harness.files.get('Other.md')).toBe(statblock('art/other.webp'));
    expect(patchNow.mock.calls.map(([path]) => path)).toEqual([OPEN, CLOSED]);
    expect(harness.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
  });
});

describe('TokenStatblockLinkService writes the statblock image through the note writer', () => {
  const linkService = (): LinkWriters => {
    const service = Object.create(TokenStatblockLinkService.prototype) as LinkWriters;
    Object.assign(service, { app: harness.app });
    return service;
  };

  it('writes the token art on link, into the open editor', async () => {
    harness = noteHarness({ [OPEN]: statblock(OLD_ART) });
    const view = harness.open(OPEN);
    const patchNow = spyWriter();

    await linkService().updateStatblockImage(OPEN, NEW_ART);

    expect(patchNow).toHaveBeenCalledTimes(1);
    expect(view.editor.getValue()).toBe(statblock(NEW_ART));
    expect(harness.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
  });

  it('clears the image keys on unlink, and a token property only when it names the unlinked token', async () => {
    harness = noteHarness({
      [OPEN]: `---\nname: Goblin\nimage: ${OLD_ART}\ntoken-image: old.webp\ntoken: ${OLD_ART}\n---\nA goblin.\n`,
      [CLOSED]: `---\nname: Boss\nimage: ${OLD_ART}\ntoken: mine.webp\n---\n`,
    });

    await linkService().updateStatblockImage(OPEN, OLD_ART, false);
    await linkService().updateStatblockImage(CLOSED, OLD_ART, false);

    expect(harness.files.get(OPEN)).toBe('---\nname: Goblin\n---\nA goblin.\n');
    expect(harness.files.get(CLOSED)).toBe('---\nname: Boss\ntoken: mine.webp\n---\n');
    expect(harness.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
  });

  it('writes nothing when the image is already the token\'s', async () => {
    harness = noteHarness({ [CLOSED]: statblock(NEW_ART) });

    await linkService().updateStatblockImage(CLOSED, NEW_ART);

    expect(harness.app.vault.process).not.toHaveBeenCalled();
  });
});
