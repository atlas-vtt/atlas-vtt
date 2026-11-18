/**
 * What the built plugin may ask of the program that loads it. Obsidian's mobile apps have no Node
 * and no Electron: the `require` they hand a plugin knows Obsidian's own modules and answers
 * nothing for any other (the desktop app's mobile emulation also shows the user a notice for each),
 * so a bundle that names `events` or `fs` at its top throws there before any of Atlas runs.
 * Code that needs Node asks the window for `require` when it runs and takes "none" for an answer.
 */

const vm = require('vm');

/** The modules Obsidian 1.15 hands a plugin on every platform, read from its `app.js`. */
const HOST_MODULES = [
  'obsidian',
  '@codemirror/autocomplete', '@codemirror/collab', '@codemirror/commands', '@codemirror/language', '@codemirror/lint',
  '@codemirror/search', '@codemirror/state', '@codemirror/view',
  '@lezer/common', '@lezer/highlight', '@lezer/lr',
];

/** A call of the free `require` with a module's name, minified or not; a method of that name is none. */
const REQUIRED_MODULE = /(?<![.\w$])require\(\s*(["'`])([^"'`]+)\1\s*\)/g;

/** Every module the bundle names for its host to load. */
function requiredModules(bundle) {
  return [...new Set([...bundle.matchAll(REQUIRED_MODULE)].map((match) => match[2]))].sort();
}

/** One sentence per module the bundle requires that Obsidian does not provide on mobile. */
function hostModuleProblems(bundle) {
  return requiredModules(bundle)
    .filter((name) => !HOST_MODULES.includes(name))
    .map((name) => `requires "${name}", which Obsidian's mobile apps do not have; only ${HOST_MODULES[0]}, @codemirror/* and @lezer/* may be required`);
}

/** What every WebView has and jsdom leaves out. */
const WEB_GLOBALS = ['TextEncoder', 'TextDecoder'];

/**
 * A module of the host: whatever is asked of it is a function that can be extended as a class and
 * called for a text, which is all the top of a plugin does with Obsidian's API.
 */
function hostModule() {
  const members = new Map();
  return new Proxy({}, {
    get(_, key) {
      if (typeof key !== 'string') return undefined;
      if (!members.has(key)) members.set(key, function hostMember() { return ''; });
      return members.get(key);
    },
  });
}

/**
 * Evaluates the bundle's top level the way Obsidian does on a tablet: in a document, without Node's
 * globals, with a `require` that knows the host's modules alone. The plugin's `onload` is not run.
 * Returns what kept it from loading.
 */
function loadProblems(bundle) {
  const { JSDOM, VirtualConsole } = require('jsdom');
  // A silent console: jsdom reports the canvas contexts it does not implement, which the plugin probes for.
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
  });
  try {
    const context = dom.getInternalVMContext();
    for (const name of WEB_GLOBALS) if (!(name in context)) context[name] = globalThis[name];
    const exports = {};
    context.atlasHost = {
      module: { exports },
      exports,
      require(name) {
        if (!HOST_MODULES.includes(name)) throw new Error(`Cannot find module '${name}'`);
        return hostModule();
      },
    };
    vm.runInContext(`(function (require, module, exports) {${bundle}\n})(atlasHost.require, atlasHost.module, atlasHost.exports);`, context, { filename: 'main.js' });
    const plugin = context.atlasHost.module.exports.default ?? context.atlasHost.module.exports;
    return typeof plugin === 'function' ? [] : ['exports no plugin class'];
  } catch (error) {
    // An error of the bundle's own is one of the document's realm, so no `instanceof` tells it.
    return [`does not load where there is no Node: ${typeof error?.message === 'string' ? error.message : String(error)}`];
  } finally {
    dom.window.close();
  }
}

module.exports = { HOST_MODULES, requiredModules, hostModuleProblems, loadProblems };
