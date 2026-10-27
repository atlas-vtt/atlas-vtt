// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readVaultImage } from '../../../../src/app/online/gm/vaultImage';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

const poster = vi.hoisted(() => vi.fn(async (_bytes: BlobPart, mime: string): Promise<Blob> => new Blob([`POSTER of ${mime}`], { type: 'image/png' })));
vi.mock('../../../../src/app/pixi/mapImage/video/videoPoster', () => ({ videoPosterBlob: poster }));

function vault(files: Record<string, string>) {
  const memory = createInMemoryApp({ files });
  memory.app.vault.getFileByPath = memory.app.vault.getAbstractFileByPath as never;
  (memory.app.vault as { readBinary: unknown }).readBinary = async (): Promise<ArrayBuffer> => new ArrayBuffer(4);
  return memory.app;
}

describe('a map image players are sent', () => {
  it('is the still of an animated map, never the video', async () => {
    const image = await readVaultImage(vault({ 'maps/river.webm': 'WEBM' }), 'maps/river.webm');

    expect(image?.mime).toBe('image/png');
    expect(new TextDecoder().decode(image?.bytes)).toBe('POSTER of video/webm');
  });

  it('is nothing for a file that is no image, and a still that cannot be taken', async () => {
    expect(await readVaultImage(vault({ 'notes/a.md': '#' }), 'notes/a.md')).toBeNull();
    poster.mockRejectedValueOnce(new Error('unplayable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await readVaultImage(vault({ 'maps/river.mp4': 'MP4' }), 'maps/river.mp4')).toBeNull();
  });
});
