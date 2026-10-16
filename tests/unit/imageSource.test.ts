import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { imageSrc, isImageUrl, isWebImage } from '../../src/app/utils/imageSource';

function appWithFiles(paths: string[]): any {
  const files = new Set(paths);
  return {
    vault: {
      getAbstractFileByPath: (path: string) => (files.has(path) ? new TFile(path) : null),
      getResourcePath: (file: TFile) => `app://vault/${file.path}`,
    },
  };
}

describe('image sources', () => {
  it('tells web art from vault paths', () => {
    expect(isWebImage('https://example.com/orc.webp')).toBe(true);
    expect(isWebImage('HTTP://example.com/orc.webp')).toBe(true);
    expect(isWebImage('atlas-vtt/assets/orc.webp')).toBe(false);
    expect(isWebImage('data:image/png;base64,AAAA')).toBe(false);
    expect(isWebImage('https-tokens/orc.webp')).toBe(false);
    expect(isWebImage(undefined)).toBe(false);
    expect(isWebImage(null)).toBe(false);
  });

  it('treats the URLs Atlas makes itself as URLs too', () => {
    expect(isImageUrl('https://example.com/orc.webp')).toBe(true);
    expect(isImageUrl('data:image/png;base64,AAAA')).toBe(true);
    expect(isImageUrl('blob:app://obsidian.md/1234')).toBe(true);
    expect(isImageUrl('app://vault/atlas-vtt/assets/orc.webp')).toBe(true);
    expect(isImageUrl('atlas-vtt/assets/orc.webp')).toBe(false);
    expect(isImageUrl('')).toBe(false);
  });

  it('shows a URL as it is, a vault file through the vault, and nothing for a missing file', () => {
    const app = appWithFiles(['atlas-vtt/assets/orc.webp']);
    expect(imageSrc(app, 'https://example.com/orc.webp')).toBe('https://example.com/orc.webp');
    expect(imageSrc(app, 'atlas-vtt/assets/orc.webp')).toBe('app://vault/atlas-vtt/assets/orc.webp');
    expect(imageSrc(app, 'atlas-vtt/assets/gone.webp')).toBe('');
    expect(imageSrc(app, undefined)).toBe('');
    expect(imageSrc(app, '')).toBe('');
  });
});
