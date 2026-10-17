import type { App } from 'obsidian';
import { GLOBAL_ASSETS_DIR } from './assetPaths';
import { ensureFolder } from '../plugin/vaultFolders';
import type { TokenImageSource } from '../types/tokenImageSource';

/** Default framing of an original upload (or a legacy rendered image at 0.8). */
export function defaultImageSource(path: string, ringedDefaultScale = 1): TokenImageSource {
  return {
    path, ringedDefaultScale,
    framed: { imageScale: ringedDefaultScale, imagePosition: { x: 0, y: 0 } },
    unframed: { imageScale: 1, imagePosition: { x: 0, y: 0 } },
  };
}

/** Keeps the upload's original bytes and format outside folders that adopt loose token art. */
export async function writeTokenImageSource(app: App, file: File): Promise<string> {
  const folder = `${GLOBAL_ASSETS_DIR}/token-sources`;
  await ensureFolder(app, folder);
  const extension = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase()
    ?? ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'image/avif': 'avif' } as Record<string, string>)[file.type];
  if (!extension) throw new Error('The source image needs a file extension.');
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  await app.vault.createBinary(path, await file.arrayBuffer());
  return path;
}
