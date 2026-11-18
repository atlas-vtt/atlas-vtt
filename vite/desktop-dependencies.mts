import type { Plugin } from 'vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Source text spliced into the dependencies. Kept as literals so no runtime
// value is ever turned into code.
const throwScriptError = 'throw new Error("Atlas does not support script elements")';
// JSZip hands every chunk of an archive to a task of its own, so a large one
// leaves the window responsive. A message is such a task in every browser and,
// unlike a timer, is not slowed to 4 ms once tasks follow each other.
const zipScheduling = `var setImmediate = (function () {
    var tasks = [];
    var port = null;
    return function (task) {
        if (!port) {
            var channel = new MessageChannel();
            channel.port1.onmessage = function () { tasks.shift()(); };
            port = channel.port2;
        }
        tasks.push(task);
        port.postMessage(0);
    };
})();`;
// JSZip asks for Node's streams only to offer `generateNodeStream`, which Atlas never calls.
const NO_NODE_STREAMS = '\0atlas-no-node-streams';
const optionalPropFilter = 'loadExternalIsValidProp(require("@emotion/is-prop-valid").default);';

/**
 * Atlas renders local UI and never loads executable scripts through React.
 * Remove that capability from the bundled React DOM runtime, and use the
 * browser's own APIs instead of JSZip's IE-era script/Function-based scheduling.
 * The bundle also has to load where there is no Node (Obsidian's mobile apps):
 * JSZip's Node streams and framer-motion's optional `require` are left out.
 * These are behavioral restrictions, applied before bundling, not scan filters.
 */
export function desktopDependencies(): Plugin {
  return {
    name: 'atlas-desktop-dependencies',
    enforce: 'pre',
    resolveId(source, importer) {
      // The default browser export is prebundled with obsolete polyfills.
      if (source === 'jszip') return require.resolve('jszip/lib/index.js');
      if (source === 'readable-stream' && /\/jszip\/lib\//.test(importer?.replaceAll('\\', '/') ?? '')) return NO_NODE_STREAMS;
    },
    load(id) {
      if (id === NO_NODE_STREAMS) return 'export const Readable = undefined;';
    },
    transform(code, id) {
      if (id.startsWith('\0')) return;
      const file = id.replaceAll('\\', '/').split('?')[0];
      if (file?.endsWith('/framer-motion/dist/es/render/dom/utils/filter-props.mjs')) {
        if (code.split(optionalPropFilter).length !== 2) {
          throw new Error('framer-motion loads its optional prop filter another way now; review the desktop dependency adapter');
        }
        // The package is not part of Atlas, so the lookup only ever failed; where Obsidian
        // emulates its mobile app, each such lookup shows the user a notice.
        return { code: code.replace(optionalPropFilter, ''), map: null };
      }
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
        // Preserve setImmediate scheduling for large archives without installing a global polyfill.
        return { code: code.replace(importPattern, zipScheduling), map: null };
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
