/**
 * Fantasy Statblocks' bundled layouts, read from a local FS checkout at test
 * time (`ATLAS_FS_CHECKOUT`). They are never committed: the Bunkers &
 * Badasses layouts are CC BY-NC-SA, and Atlas ships nothing derived from the
 * Daggerheart layouts. The layouts are TypeScript modules of plain data, so
 * esbuild bundles them (with FS's id helper stubbed) and Node loads the
 * bundle from a temporary folder.
 */

import { build } from 'esbuild';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isFsLayout } from '../../../../src/app/statblocks/fs/fsLayoutToTemplate';
import type { FsLayout } from '../../../../src/app/statblocks/fs/fsLayoutTypes';

export const FS_CHECKOUT = process.env.ATLAS_FS_CHECKOUT;

const STUB_NAMESPACE = 'fs-checkout-stub';

export async function loadBundledLayouts(checkout: string): Promise<FsLayout[]> {
  const entry = join(checkout, 'src', 'layouts', 'index.ts');
  const result = await build({
    stdin: { contents: `export { DefaultLayouts } from ${JSON.stringify(entry)};`, resolveDir: checkout, loader: 'ts' },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    logLevel: 'silent',
    plugins: [{
      name: 'fs-checkout-stubs',
      setup(builder): void {
        builder.onResolve({ filter: /^src\/util\/util$/ }, () => ({ path: 'util', namespace: STUB_NAMESPACE }));
        builder.onLoad({ filter: /.*/, namespace: STUB_NAMESPACE }, () => ({
          contents: 'let next = 0; export const nanoid = () => `id${next++}`;',
          loader: 'ts',
        }));
      },
    }],
  });
  const bundle = result.outputFiles[0]?.text;
  if (!bundle) throw new Error('esbuild produced no bundle of the FS layouts');
  const folder = mkdtempSync(join(tmpdir(), 'atlas-fs-layouts-'));
  try {
    const file = join(folder, 'layouts.cjs');
    writeFileSync(file, bundle);
    const loaded: unknown = createRequire(import.meta.url)(file);
    const layouts = typeof loaded === 'object' && loaded !== null && 'DefaultLayouts' in loaded ? loaded.DefaultLayouts : [];
    return Array.isArray(layouts) ? layouts.filter(isFsLayout) : [];
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
