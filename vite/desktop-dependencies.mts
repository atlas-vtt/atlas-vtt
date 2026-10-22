import type { Plugin } from 'vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Source text spliced into React DOM. Kept as a literal so no runtime value is
// ever turned into code.
const throwScriptError = 'throw new Error("Atlas does not support script elements")';

/**
 * Atlas renders local UI and never loads executable scripts through React.
 * Remove that capability from the bundled React DOM runtime, and use modern
 * desktop APIs instead of JSZip's IE-era script/Function-based scheduling.
 * These are behavioral restrictions, applied before bundling, not scan filters.
 */
export function desktopDependencies(): Plugin {
  return {
    name: 'atlas-desktop-dependencies',
    enforce: 'pre',
    resolveId(source) {
      // The default browser export is prebundled with obsolete polyfills.
      if (source === 'jszip') return require.resolve('jszip/lib/index.js');
    },
    transform(code, id) {
      if (id.startsWith('\0')) return;
      const file = id.replaceAll('\\', '/').split('?')[0];
      if (file?.endsWith('/jszip/lib/external.js')) {
        // All supported Obsidian versions have native Promise support.
        return { code: 'module.exports = { Promise: Promise };', map: null };
      }
      if (file?.endsWith('/jszip/lib/utils.js')) {
        const importPattern = /require\("setimmediate"\);/g;
        const callPattern = /\bsetImmediate\(/g;
        if ([...code.matchAll(importPattern)].length !== 1 || [...code.matchAll(callPattern)].length !== 1) {
          throw new Error('JSZip scheduling changed; review the desktop dependency adapter');
        }
        // Obsidian's desktop runtime provides Node timers. Preserve setImmediate
        // scheduling for large archives without installing a global polyfill.
        return { code: code.replace(importPattern, 'var setImmediate = require("timers").setImmediate;'), map: null };
      }
      if (!/\/react-dom\/cjs\/react-dom-client\.(production|development)\.js$/.test(file ?? '')) return;

      const createScript = /\b\w+\.createElement\("script"\)/g;
      // React DOM's development build warns about the tag between the two statements.
      const scriptWarning = String.raw`(?:didWarnScriptTags \|\|\s+isScriptDataBlock\(\w+\) \|\|\s+\(console\.error\(\s+"Encountered a script tag[^"]*"\s+\),\s+\(didWarnScriptTags = !0\)\);\s+)?`;
      const inertScript = new RegExp(
        String.raw`case "script":\s+(\w+) = \w+\.createElement\("div"\);\s+` + scriptWarning +
          String.raw`\1\.innerHTML = "<script>\\x3c\/script>";\s+\1 = \1\.removeChild\(\s*\1\.firstChild\s*\);\s+break;`,
        'g',
      );
      if ([...code.matchAll(createScript)].length !== 3 || [...code.matchAll(inertScript)].length !== 1) {
        throw new Error('React DOM script handling changed; review the desktop dependency adapter');
      }
      const reject = `(() => { ${throwScriptError}; })()`;
      return {
        code: code.replace(createScript, reject).replace(inertScript, `case "script": ${throwScriptError};`),
        map: null,
      };
    },
  };
}
