import type { App, TFile } from 'obsidian';
import { withDecodedImage } from '../../../imageProcessing/imageElement';
import { imageMimeType } from '../assetServe.ts';
import { ATLAS_PLUGIN_ID, field } from '../atlasLighting.ts';
import { LOCAL_PLAYER_VIEW_TYPE } from '../atlasView.ts';
import type { VaultImage } from '../TokenShare.ts';

/** Images Atlas offers to display that players are not sent as they are: drawn once and sent as PNG. */
const DRAWN_TYPES: Readonly<Record<string, string>> = { svg: 'image/svg+xml', bmp: 'image/bmp' };
/** The longest side an image without pixels of its own (SVG) is drawn at. */
const VECTOR_SIDE = 2048;

/**
 * Draws an image in Obsidian's own window and encodes it as PNG: an SVG is loaded as an `<img>`,
 * where it runs no script and loads nothing, so players only ever get its picture.
 */
async function drawnAsPng(bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<VaultImage | null> {
  return withDecodedImage(new Blob([bytes], { type: mime }), async (image) => {
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!(width > 0) || !(height > 0)) return null;
    const fit = mime === 'image/svg+xml' ? VECTOR_SIDE / Math.max(width, height) : 1;
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * fit)), Math.max(1, Math.round(height * fit)));
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encoded = await canvas.convertToBlob({ type: 'image/png' });
    return { bytes: new Uint8Array(await encoded.arrayBuffer()), mime: 'image/png' };
  });
}

/** A vault file as players can be sent it: itself, an SVG or BMP as its picture, or null for anything that is no image. */
export async function readShownFile(app: App, file: TFile): Promise<VaultImage | null> {
  const read = async (): Promise<Uint8Array<ArrayBuffer>> => new Uint8Array(await app.vault.readBinary(file));
  const mime = imageMimeType(file.path);
  if (mime !== null) return { bytes: await read(), mime };
  const drawn = DRAWN_TYPES[file.extension.toLowerCase()];
  return drawn === undefined ? null : drawnAsPng(await read(), drawn);
}

/** Atlas's image display service as its plugin instance holds it (`imageDisplayService`), unchecked. */
export function atlasImageDisplay(app: App): unknown {
  // Obsidian keeps the loaded plugins by id in `app.plugins.plugins`.
  return field(field(field(field(app, 'plugins'), 'plugins'), ATLAS_PLUGIN_ID), 'imageDisplayService');
}

/** Whether Atlas's own player window is open. */
export function localPlayerWindowOpen(app: App): boolean {
  return app.workspace.getLeavesOfType(LOCAL_PLAYER_VIEW_TYPE).length > 0;
}
