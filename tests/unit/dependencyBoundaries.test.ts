import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkBoundaries } from '../../scripts/boundaries/graph.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-boundary-'));
  roots.push(root);
  const files: Record<string, string> = {
    'src/shared/entry.ts': source,
    'src/shared/value.ts': 'export interface Value { x: number }\nexport const value = 1;',
    'src/plugin/service.ts': 'export interface Secret { private: true }',
    'src/assets/icon.svg': '<svg/>',
    'private/icon.svg': '<svg/>',
    'tsconfig.json': JSON.stringify({ compilerOptions: { moduleResolution: 'Node', baseUrl: '.', paths: { 'src/*': ['src/*'] } } }),
    'tsconfig.shared.json': JSON.stringify({ include: ['src/shared/**/*.ts'], exclude: [] }),
  };
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'add', '.']);
  const manifest = {
    BOUNDARIES: { shared: { include: ['src/shared/**/*.ts'], exclude: [], mayImport: ['shared'], packages: [] } },
    ASSET_ROOTS: ['src/assets/'],
    TYPE_PROJECTS: { 'tsconfig.shared.json': { include: ['src/shared/**/*.ts'], exclude: [] } },
  };
  return { root, manifest };
}

// Each case builds a real Git fixture and resolves modules from disk.
describe('dependency boundaries', { timeout: 30_000 }, () => {
  it('accepts local values, types, re-exports and allowed assets with query suffixes', () => {
    const { root, manifest } = fixture("import type { Value } from './value'; export { value } from './value'; import icon from '../assets/icon.svg?inline';");
    expect(checkBoundaries(root, manifest).violations).toEqual([]);
  });

  it.each([
    ["import 'obsidian';", 'package'],
    ["const file = './value'; import(file);", 'computed'],
    ["import fs = require('fs');", 'package'],
    ['/// <reference types="obsidian" />', 'package'],
    ["import type { App } from 'obsidian';", 'package'],
    ["import { readFile } from 'node:fs';", 'package'],
    ["import type { Secret } from '../plugin/service';", 'class'],
    ["export * from '../plugin/service';", 'class'],
    ["const service = import('../plugin/service');", 'class'],
    ["const service = require('../plugin/service');", 'class'],
    ["type Secret = import('../plugin/service').Secret;", 'class'],
    ["import { value } from 'src/shared/value';", 'alias'],
    ["import image from '../../private/icon.svg?raw';", 'asset'],
    ["import { missing } from './missing';", 'unresolved'],
  ])('rejects %s', (source, rule) => {
    const { root, manifest } = fixture(source);
    expect(checkBoundaries(root, manifest).violations.some(message => message.includes(rule))).toBe(true);
  });

  it('rejects a forbidden edge between two explicit classes', () => {
    const { root, manifest } = fixture("import type { Secret } from '../plugin/service';");
    const classes = { ...manifest.BOUNDARIES, isolated: { include: ['src/plugin/**/*.ts'], exclude: [], mayImport: ['isolated'], packages: [] } };
    expect(checkBoundaries(root, { ...manifest, BOUNDARIES: classes }).violations.some(message => message.includes('class'))).toBe(true);
  });

  it('rejects a typecheck project that has dropped a source folder', () => {
    const { root, manifest } = fixture('export const value = 1;');
    writeFileSync(join(root, 'tsconfig.shared.json'), JSON.stringify({ include: [], exclude: [] }));
    expect(checkBoundaries(root, manifest).violations.some(message => message.includes('project'))).toBe(true);
  });
  it('allows deleting an unused shared file before staging the deletion', () => {
    const { root, manifest } = fixture('export const value = 1;');
    rmSync(join(root, 'src/shared/value.ts'));
    expect(checkBoundaries(root, manifest).violations).toEqual([]);
  });

  it('rejects overlapping source classes', () => {
    const { root, manifest } = fixture('export const value = 1;');
    const classes = { ...manifest.BOUNDARIES, isolated: manifest.BOUNDARIES.shared };
    expect(checkBoundaries(root, { ...manifest, BOUNDARIES: classes }).violations.some(message => message.includes('overlap'))).toBe(true);
  });

});
