import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import ts from 'typescript';

it('allows DOM types but not Obsidian DOM extensions, even with library declarations', () => {
  const project = ts.readConfigFile(resolve('tsconfig.shared.json'), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(project.config, ts.sys, process.cwd());
  const file = resolve('src/app/host/typecheck-fixture.ts');
  const source = `
    import type { Point } from 'pixi.js';
    import 'obsidian';
    export const point: Point | null = null;
    export const canvas: HTMLCanvasElement = document.createElement('canvas');
    createEl('div');
    document.body.createDiv();
  `;
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language, onError, fresh) => name === file
    ? ts.createSourceFile(name, source, language, true)
    : original(name, language, onError, fresh);
  const program = ts.createProgram([file], options, host);
  const errors = ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  expect(errors).toHaveLength(2);
  expect(errors).toContain("Cannot find name 'createEl'.");
  expect(errors.some(message => message.includes("Property 'createDiv' does not exist"))).toBe(true);
});
