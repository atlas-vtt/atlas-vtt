import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import module from 'module';
import path from 'path';
import fs from 'fs';
import { desktopDependencies } from './vite/desktop-dependencies.mts';
import { changelog } from './vite/changelog.mts';

const isProduction = process.env.NODE_ENV === 'production';
const copyToTestVault = process.env.COPY_ON_CHANGE === 'true';
const { getPluginTargetDirs, markForHotReload } = module.createRequire(import.meta.url)('./scripts/worktree-targets.js') as {
  getPluginTargetDirs: (projectRoot: string) => Array<{ label: string; dirPath: string }>;
  markForHotReload: (pluginDir: string) => void;
};

// Custom Vite plugin to copy files after build
function copyFilesPlugin(): Plugin {
  return {
    name: 'copy-files-to-test-vaults',
    // Use writeBundle hook which runs after bundle is written
    writeBundle(options, bundle) {
      if (!copyToTestVault) return;

      // Resolve to vaults inside the main worktree so all branches share the same test vaults.
      const targetDescriptors = getPluginTargetDirs(process.cwd());
      const targetDirs = targetDescriptors.map((target) => target.dirPath);
      const outDir = options.dir || path.dirname(options.file || ''); // Get Vite's output directory

      if (!outDir) {
        console.error('Could not determine output directory.');
        return;
      }

      // Ensure both target directories exist
      targetDirs.forEach(targetDir => {
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        markForHotReload(targetDir);
      });

      // Ensure the output CSS is named styles.css (Obsidian convention)
      try {
        const oldCss = path.join(outDir, 'style.css');
        const newCss = path.join(outDir, 'styles.css');
        if (fs.existsSync(oldCss)) {
          fs.renameSync(oldCss, newCss);
        }
      } catch (err) {
        console.warn('Failed to rename style.css to styles.css:', err);
      }
      // Copy files to both target directories
      const mainJsPath = path.join(outDir, 'main.js');
      const manifestPath = 'manifest.json'; // Assuming manifest is in root

      targetDescriptors.forEach(({ label: vaultName, dirPath: targetDir }) => {
        
        // Copy main.js
        if (fs.existsSync(mainJsPath)) {
          fs.copyFileSync(mainJsPath, path.join(targetDir, 'main.js'));
        } else {
          console.warn(`main.js not found in ${outDir}`);
        }

        // Copy styles.css, with fallback from the default generated style.css
        try {
          const cssFileName = 'styles.css';
          const cssSrcPath = path.join(outDir, cssFileName);
          if (fs.existsSync(cssSrcPath)) {
            // Copy named CSS file (e.g., styles.css)
            fs.copyFileSync(cssSrcPath, path.join(targetDir, cssFileName));
          } else {
            // Fallback: use default generated style.css and rename
            const defaultCss = 'style.css';
            const defaultSrcPath = path.join(outDir, defaultCss);
            if (fs.existsSync(defaultSrcPath)) {
              fs.copyFileSync(defaultSrcPath, path.join(targetDir, cssFileName));
            } else {
              console.warn(`${cssFileName} and ${defaultCss} not found in ${outDir}`);
            }
          }
        } catch (err) {
          console.warn('Error copying CSS file:', err);
        }

        // Copy manifest.json
        if (fs.existsSync(manifestPath)) {
           fs.copyFileSync(manifestPath, path.join(targetDir, 'manifest.json'));
        } else {
           console.warn('manifest.json not found in project root.');
        }
        
        console.log(`✅ Files copied to ${vaultName}`);
      });


    }
  };
}


export default defineConfig({
  plugins: [
    changelog(),
    desktopDependencies(),
    react(), // Enable React support
    copyFilesPlugin() // Add our custom plugin
  ],
  css: {
    preprocessorOptions: {
      scss: {
        // Suppress deprecation warnings
        quietDeps: true,
        silenceDeprecations: ['import', 'legacy-js-api'],
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: true,
    sourcemap: isProduction ? false : 'inline',
    minify: isProduction,
    lib: {
      entry: 'main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      // Externalize Obsidian & Node built‑ins
      external: [
        'obsidian',
        'electron',
        '@codemirror/autocomplete',
        '@codemirror/collab',
        '@codemirror/commands',
        '@codemirror/language',
        '@codemirror/lint',
        '@codemirror/search',
        '@codemirror/state',
        '@codemirror/view',
        '@lezer/common',
        '@lezer/highlight',
        '@lezer/lr',
        ...module.builtinModules,
      ],
      output: {
        banner: `/*! Atlas VTT — Copyright (C) 2025-2026 Fabian Urbanek
 * SPDX-License-Identifier: AGPL-3.0-only
 * Source code and licence: https://github.com/atlas-vtt/atlas-vtt
 * Third-party components retain their own licenses:
 * https://github.com/atlas-vtt/atlas-vtt/blob/main/THIRD_PARTY_NOTICES.md
 */`,
        dir: 'dist',
        format: 'cjs',
        exports: 'named',
        inlineDynamicImports: true,
        entryFileNames: 'main.js',
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith('.css') ? 'styles.css' : assetInfo.name ?? '[name][extname]',
      },
    },
  },
  // Define global constants if needed (e.g., for process.env)
  define: {
    '__ATLAS_RELEASE_BUILD__': JSON.stringify(isProduction && !copyToTestVault),
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
    // Maintainer-only dev tooling (e.g. the statblock template/layout editor).
    // `build`, so the literal resolves to `false` and the guarded code is
    // dead-code-eliminated from the shipped bundle.
  },
  // Resolve aliases if needed
  resolve: {
    alias: {
      'src': path.resolve(__dirname, 'src') // Define src alias
    },
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
  },
}); 
