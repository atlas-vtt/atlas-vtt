import { TFile, type App } from 'obsidian';
import { gridProblem } from '../app/grid/gridLimits';
import { imageDimensions } from '../app/imageProcessing/imageDimensions';
import type { SavedMapInput } from './types/scenes';

type Size = { width: number; height: number };

/** The pixel size of the image `data` holds, read from its header; null for a format or file that has none. */
async function sizeOf(data: () => Promise<ArrayBuffer>): Promise<Size | null> {
  try {
    return await imageDimensions(new Blob([await data()]));
  } catch {
    return null;
  }
}

/** The natural size of the background image at vault path `path`; null without a readable one. */
export function vaultImageSize(app: App, path: string | null): Promise<Size | null> {
  const file = path ? app.vault.getAbstractFileByPath(path) : null;
  return file instanceof TFile ? sizeOf(() => app.vault.readBinary(file)) : Promise.resolve(null);
}

/**
 * Throws (`fail`) when `map.grid` is malformed or too fine to draw on its background. The background is one of
 * `images` when it names one (by its path relative to the folder), else a vault image; when neither can be read the
 * cells per side are left to the grid system, which draws no grid past the limit.
 */
export async function checkMapGrid(
  app: App, map: SavedMapInput, images: ReadonlyArray<{ path: string; data: ArrayBuffer }>, fail: (message: string) => never,
): Promise<void> {
  if (map.grid === null) return;
  const background = typeof map.background === 'string' ? map.background : null;
  const uploaded = background === null ? undefined : images.find((image) => image?.path === background);
  const size = uploaded ? await sizeOf(async () => uploaded.data) : await vaultImageSize(app, background);
  const problem = gridProblem(map.grid, size);
  if (problem) fail(`the map's ${problem}.`);
}
