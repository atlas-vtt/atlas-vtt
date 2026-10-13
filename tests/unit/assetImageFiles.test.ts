import { describe, expect, it } from 'vitest';
import { imageExtension, writeAssetImage } from '../../src/app/services/assetImageFiles';
import { overwriteStoredImage } from '../../src/app/packages/components/asset-manager/token-creator/storedTokenImage';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const image = (...parts: number[][]): ArrayBuffer => new Uint8Array(parts.flat()).buffer;
const text = (value: string): number[] => [...value].map(c => c.charCodeAt(0));
const u16le = (n: number): number[] => [n & 0xff, n >> 8];
const u32be = (n: number): number[] => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const u32le = (n: number): number[] => u32be(n).reverse();

const png = image([0x89], text('PNG\r\n\x1a\n'), u32be(13), text('IHDR'), u32be(4000), u32be(3000));
const jpeg = image([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0x0b, 0xb8, 0x0f, 0xa0, 3], new Array(12).fill(0));
const webp = image(text('RIFF'), u32le(100), text('WEBP'), text('VP8 '), u32le(10), [0, 0, 0, 0x9d, 0x01, 0x2a, ...u16le(2048), ...u16le(1024)]);

describe('stored image files', () => {
  it('name an image by the format of its bytes', () => {
    expect(imageExtension(png)).toBe('png');
    expect(imageExtension(jpeg)).toBe('jpg');
    expect(imageExtension(webp)).toBe('webp');
    expect(imageExtension(image(text('GIF89a'), [64, 1, 200, 0]))).toBe('webp');
  });

  it('keep an imported map in its own format', async () => {
    const { app } = createInMemoryApp();
    expect(await writeAssetImage(app, 'Region map', png)).toMatch(/^atlas-vtt\/assets\/Region_map_\d+_[a-z0-9]+\.png$/);
    expect(await writeAssetImage(app, 'Battle map', jpeg)).toMatch(/\.jpg$/);
    expect(await writeAssetImage(app, 'Goblin', webp)).toMatch(/\.webp$/);
  });

  it('rename a stored image to the format of the image written over it', async () => {
    const { app, files } = createInMemoryApp({ files: { 'atlas-vtt/assets/map.webp': 'old', 'atlas-vtt/assets/scan.jpeg': 'old' } });

    expect(await overwriteStoredImage(app, 'atlas-vtt/assets/map.webp', png)).toBe('atlas-vtt/assets/map.png');
    expect(files.has('atlas-vtt/assets/map.webp')).toBe(false);
    expect(await overwriteStoredImage(app, 'atlas-vtt/assets/scan.jpeg', jpeg)).toBe('atlas-vtt/assets/scan.jpeg');
    expect(await overwriteStoredImage(app, 'atlas-vtt/assets/gone.webp', webp)).toBeNull();
  });
});
