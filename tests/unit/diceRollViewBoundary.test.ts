import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { checkBoundaries } from '../../scripts/boundaries/graph.mjs';
import * as manifest from '../../scripts/boundaries.mjs';

const ROLL_VIEWS = [
  'src/app/react/components/dice3d/DiceRollStack.tsx',
  'src/app/react/components/dice/DiceToast.tsx',
];

/** The roll views show the roll they are given; finding a portrait in the vault stays with `DiceRollDisplay`. */
describe('roll views', { timeout: 30_000 }, () => {
  it('belong to the shared sources, which may not import obsidian or plugin services', () => {
    const { include, exclude } = manifest.BOUNDARIES.shared;
    const shared = ts.sys.readDirectory('.', ['.ts', '.tsx'], exclude, include).map((file) => file.replace(/^\.\//, ''));
    expect(shared).toEqual(expect.arrayContaining(ROLL_VIEWS));
  });

  it('import nothing outside the shared sources', () => {
    const { violations } = checkBoundaries('.', manifest);
    expect(violations.filter((line) => /react\/components\/dice(3d)?\//.test(line))).toEqual([]);
  });
});
