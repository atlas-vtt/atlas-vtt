import '../setup/obsidianDom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { templateCardPictures } from '../../src/app/armarium/upload/cardPictures/templateCardPictures';
import { allBuiltInTemplates } from '../../src/app/statblocks/library/builtInTemplates';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { THEME } from './sidePanesHarness';

vi.mock('../../src/app/services/statblockDiceLinks', () => ({ attachDiceRolling: () => () => undefined, diceLinkProps: () => ({}), linkDiceIn: () => undefined }));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({}) } }));

/**
 * A template's card for its Armarium listing is drawn by the real renderer and copied into a picture in Obsidian's
 * light and dark look: the picture holds the card, sharp at two device pixels per CSS pixel, on the look's own
 * background, without what the vault's theme sets. The pictures go to `tests/gpu/out/card-pictures/` to be looked at.
 */
const LIGHT = '.theme-light { --background-primary: #fafafa; --text-normal: #222222; --text-muted: #555555; }';
const VAULT_THEME = 'body .atlas-card-picture { background: #ff00ff; }';

interface Picture {
  width: number;
  height: number;
  pixel: (x: number, y: number) => [number, number, number];
  inked: number;
}

async function read(bytes: ArrayBuffer, name: string): Promise<Picture> {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  await commands.writeFile(`out/card-pictures/${name}.png`, btoa(binary), 'base64');
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  const pixel = (x: number, y: number): [number, number, number] => {
    const at = (y * bitmap.width + x) * 4;
    return [data[at]!, data[at + 1]!, data[at + 2]!];
  };
  const [r, g, b] = pixel(2, 2);
  let inked = 0;
  for (let at = 0; at < data.length; at += 4) if (Math.abs(data[at]! - r) + Math.abs(data[at + 1]! - g) + Math.abs(data[at + 2]! - b) > 60) inked++;
  return { width: bitmap.width, height: bitmap.height, pixel, inked };
}

describe('a template\'s card picture', () => {
  const style = document.createElement('style');
  const vaultTheme = document.createElement('style');
  style.textContent = THEME + LIGHT + css;
  vaultTheme.textContent = VAULT_THEME;

  beforeEach(async () => {
    await page.viewport(1280, 900);
    document.head.append(style, vaultTheme);
    document.body.classList.add('theme-dark');
  });
  afterEach(() => {
    style.remove();
    vaultTheme.remove();
  });

  it.each(allBuiltInTemplates().filter((template) => ['builtin:5e-2014-monster', 'builtin:cairn-creature', 'builtin:draw-steel-monster'].includes(template.id)).map((template) => [template.id, template] as const))(
    'draws %s in both looks, on their own backgrounds, without the vault\'s theme',
    async (id, template) => {
      const { app } = createInMemoryApp({ files: {} });
      app.customCss = { styleEl: vaultTheme, extraStyleEls: [] };
      const pictures = await templateCardPictures(app, template.template, 'Marsh Warden');
      const slug = id.replace('builtin:', '');
      const light = await read(pictures.light, `${slug}-light`);
      const dark = await read(pictures.dark, `${slug}-dark`);
      for (const picture of [light, dark]) {
        expect(picture.width % 2).toBe(0);
        expect(picture.width).toBeGreaterThanOrEqual(960);
        expect(picture.height).toBeGreaterThan(200);
        // Text and rules stand on the card: a good share of it differs from the background.
        expect(picture.inked / (picture.width * picture.height)).toBeGreaterThan(0.01);
      }
      expect(light.pixel(2, 2)).toEqual([250, 250, 250]);
      expect(dark.pixel(2, 2)).toEqual([30, 30, 30]);
    },
    30_000,
  );
});
