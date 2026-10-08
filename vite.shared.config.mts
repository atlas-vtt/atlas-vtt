import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const slashes = (file: string): string => file.replace(/\\/g, '/');
const path = (file: string): string => slashes(fileURLToPath(new URL(file, import.meta.url)));
const I18N = path('./src/app/i18n/index.ts');
const ENGLISH = path('./src/shared/englishTexts.ts');

/**
 * Atlas's translation module reads Obsidian's language, which code outside Obsidian has none of: the packages resolve
 * it to `src/shared/englishTexts.ts`, so Atlas's modules there keep their `t()` calls and give English.
 */
const englishTexts: Plugin = {
  name: 'atlas-shared-english-texts',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer || !/i18n(\/index(\.ts)?)?$/.test(source)) return null;
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    return resolved && slashes(resolved.id) === I18N ? ENGLISH : null;
  },
};

/** `@atlas-vtt/shared`: plain ES modules for extensions to vendor (docs/extension-api.md). Copies nothing anywhere. */
export default defineConfig({
  plugins: [englishTexts],
  build: {
    outDir: 'dist-packages/shared',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: { grid: 'src/shared/grid.ts', draw: 'src/shared/draw.ts', rules: 'src/shared/rules.ts', dice3d: 'src/shared/dice3d.ts', diceDisplay: 'src/shared/diceDisplay.ts' },
      formats: ['es'],
      fileName: (_format, entry) => `${entry}.js`,
    },
    rollupOptions: { external: ['three', /^three\//], output: { chunkFileNames: '[name]-[hash].js' } },
  },
});
