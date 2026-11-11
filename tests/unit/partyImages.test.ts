import { describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';

vi.mock('../../src/app/imageProcessing/imageProcessing', () => ({
  IMAGE_PRESETS: { token: { maxWidth: 400, maxHeight: 400, quality: 0.85 } },
  // jsdom's Blob has no arrayBuffer()
  optimizeImage: vi.fn(async () => ({ image: { arrayBuffer: async () => new ArrayBuffer(4) } })),
}));

import { savePartyPicture, vaultImages } from '../../src/app/react/components/collection-settings/partyImages';
import { optimizeImage } from '../../src/app/imageProcessing/imageProcessing';

const file = (path: string, mtime: number): TFile => ({ path, extension: path.split('.').pop()!, stat: { mtime } }) as TFile;

describe('pictures for the party', () => {
  it('offers the vault\'s pictures newest first, without notes, hidden files or Atlas\' map images', () => {
    const files = [
      file('portraits/ara.png', 1), file('portraits/bor.WEBP', 3), file('Session.md', 9),
      file('.trash/old.png', 8), file('atlas-vtt/assets/cave.webp', 7), file('atlas-vtt/collections/c/tokens/ara.webp', 2),
    ];
    expect(vaultImages(files, '').map(({ path }) => path)).toEqual(['portraits/bor.WEBP', 'atlas-vtt/collections/c/tokens/ara.webp', 'portraits/ara.png']);
    expect(vaultImages(files, ' ARA ').map(({ path }) => path)).toEqual(['atlas-vtt/collections/c/tokens/ara.webp', 'portraits/ara.png']);
    expect(vaultImages(Array.from({ length: 60 }, (_, i) => file(`p/${i}.png`, i)), '')).toHaveLength(48);
  });

  it('saves an upload scaled like token art where the vault keeps attachments', async () => {
    const createBinary = vi.fn(async () => undefined);
    const getAvailablePathForAttachment = vi.fn(async (name: string) => `Attachments/${name}`);
    const app = { vault: { createBinary }, fileManager: { getAvailablePathForAttachment } } as unknown as App;
    const upload = new File(['png'], 'Ara Portrait.png', { type: 'image/png' });

    await expect(savePartyPicture(app, upload)).resolves.toBe('Attachments/Ara Portrait.webp');
    expect(optimizeImage).toHaveBeenCalledWith(upload, { maxWidth: 400, maxHeight: 400, quality: 0.85 });
    expect(createBinary).toHaveBeenCalledWith('Attachments/Ara Portrait.webp', expect.any(ArrayBuffer));
  });
});
