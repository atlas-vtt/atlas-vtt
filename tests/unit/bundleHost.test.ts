import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

interface BundleHost {
  HOST_MODULES: readonly string[];
  requiredModules: (bundle: string) => string[];
  hostModuleProblems: (bundle: string) => string[];
  loadProblems: (bundle: string) => string[];
}

const { HOST_MODULES, requiredModules, hostModuleProblems, loadProblems } =
  createRequire(import.meta.url)('../../scripts/bundle-host.js') as BundleHost;

const PLUGIN = 'const o=require("obsidian");class P extends o.Plugin{}exports.default=P;';

describe('the modules a bundle requires', () => {
  it('lists each module once, however the call is written', () => {
    const bundle = `const a=require("obsidian"),b=require('events');var c = require( \`stream\` );require("events")`;
    expect(requiredModules(bundle)).toEqual(['events', 'obsidian', 'stream']);
  });

  it('takes a method named require for none', () => {
    expect(requiredModules('grid.require(owner,[c]);class G{require(e,n){}}const myrequire=1;$require("fs")')).toEqual([]);
  });

  it('accepts what Obsidian hands a plugin on every platform', () => {
    const bundle = HOST_MODULES.map((name) => `require("${name}")`).join(';');
    expect(hostModuleProblems(bundle)).toEqual([]);
  });

  it.each(['events', 'stream', 'timers', 'fs', 'electron', '@emotion/is-prop-valid', '@codemirror/text'])('names %s as a module mobile lacks', (name) => {
    const problems = hostModuleProblems(`${PLUGIN}const x=require("${name}");`);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`requires "${name}"`);
  });
});

describe('loading a bundle where there is no Node', () => {
  it('loads a plugin that asks only for Obsidian', () => {
    expect(loadProblems(`${PLUGIN}const lang=o.getLanguage().toLowerCase();document.createElement("canvas");new TextEncoder();`)).toEqual([]);
  });

  it('names the module the host does not have', () => {
    expect(loadProblems(`const e=require("events");${PLUGIN}`)).toEqual([expect.stringContaining("Cannot find module 'events'")]);
  });

  it.each(['process.platform', 'Buffer.from("a")', 'setImmediate(() => {})', '__dirname'])('reports a top level that reads %s', (expression) => {
    expect(loadProblems(`${PLUGIN}const x=${expression};`)).toEqual([expect.stringContaining('does not load where there is no Node')]);
  });

  it('lets guarded Node access and optional requires pass', () => {
    const guarded = 'const p=typeof process>"u"?void 0:process;const b=typeof Buffer<"u";try{require("@emotion/is-prop-valid")}catch{}';
    expect(loadProblems(`${PLUGIN}${guarded}`)).toEqual([]);
  });

  it('reports a bundle without a plugin class', () => {
    expect(loadProblems('const o=require("obsidian");')).toEqual(['exports no plugin class']);
  });
});
