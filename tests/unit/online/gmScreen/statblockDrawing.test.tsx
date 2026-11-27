// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawnTree } from '../../../../src/app/online/gmScreen/statblocks/drawnTree.ts';
import { StatblockDrawing } from '../../../../src/app/online/gmScreen/statblocks/StatblockDrawing.ts';
import { parseDrawnNodes, type DrawnNode } from '../../../../src/app/online/protocol/index.ts';
import type { StatblockLayout } from '../../../../src/app/react/components/statblock/statblockTypes';
import { HIT_POINTS, type StatblockScenario } from '../../../fixtures/gmScreenStatblockNotes';
import { scenarioApp, type ScenarioApp } from '../../../helpers/statblockScenarioApp';

/** A layout whose scripts build what a statblock must never carry to a device, and one that throws. */
const HOSTILE_LAYOUT: StatblockLayout = {
  name: 'Hostile', id: 'hostile',
  blocks: [
    { type: 'heading', id: 'name', properties: ['name'], size: 1 },
    {
      type: 'javascript', id: 'built',
      code: `const el = document.createElement('div');
        el.className = 'stat-block modal-container';
        el.innerHTML = '<script>window.ran = 1</script><img src="x" onerror="window.ran = 2"><a href="javascript:alert(1)">a link</a>'
          + '<div style="background: url(https://evil.example/beacon.png); position: fixed; inset: 0">cover</div>'
          + '<iframe src="https://evil.example"></iframe><input type="password" value="hunter2"><span onclick="alert(3)">kept</span>';
        return el;`,
    },
    { type: 'javascript', id: 'throws', code: 'throw new Error("a layout that fails");' },
    { type: 'property', id: 'notes', properties: ['notes'], display: 'Notes' },
  ],
};

const HOSTILE: StatblockScenario = {
  id: 'fs-5e',
  path: 'Bestiary/Mimic.md',
  note: '---\nstatblock: true\nname: Mimic\n---\n',
  fantasy: { layouts: [HOSTILE_LAYOUT], creature: { name: 'Mimic', path: 'Bestiary/Mimic.md', layout: 'Hostile', notes: '<script>alert(4)</script> [x](javascript:alert(5))' } },
  tokens: [{ id: 'mimic-1', name: 'Mimic', resources: { hp: { current: 5, max: 5 } } }],
};

const textOf = (nodes: readonly DrawnNode[]): string => nodes.map((node) => (typeof node === 'string' ? node : textOf(node.k ?? []))).join('');

let harness: ScenarioApp | null = null;
let drawing: StatblockDrawing | null = null;

/** Draws the statblock for a device and hands over each tree it is read as. */
function draw(scenario: StatblockScenario, parsing = false): DrawnNode[][] {
  harness = scenarioApp([scenario], undefined, parsing);
  const trees: DrawnNode[][] = [];
  drawing = new StatblockDrawing(harness.app, (element) => trees.push([...drawnTree(element, () => null).nodes]));
  drawing.draw({
    path: scenario.path, tokens: scenario.tokens, viewId: undefined, originContext: undefined,
    tokenActions: { definitions: [HIT_POINTS], onUpdateToken: vi.fn(), onLocateToken: vi.fn() },
  });
  return trees;
}

afterEach(() => {
  drawing?.dispose();
  harness?.dispose();
  drawing = null;
  harness = null;
  delete (window as Window & { ran?: unknown }).ran;
});

describe('a statblock drawn for a GM screen device', () => {
  it('carries none of what a layout\'s script or a note puts in to run, load or ask for, and draws on past a script that throws', async () => {
    const trees = draw(HOSTILE);
    await vi.waitFor(() => expect(trees.length).toBeGreaterThan(0), { timeout: 5000 });
    const [tree] = trees;
    const json = JSON.stringify(tree);

    expect(textOf(tree!)).toContain('Mimic');
    expect(textOf(tree!)).toContain('a link');
    expect(textOf(tree!)).toContain('kept');
    for (const word of ['window.ran', 'onerror', 'onclick', 'javascript:alert(1)', 'evil.example', 'url(', '"position', 'hunter2', 'password', 'modal-container', '"src"']) {
      expect(json).not.toContain(word);
    }
    expect(parseDrawnNodes(tree)).toEqual(tree);
  });

  it('is sent as the DM screen shows it while Fantasy Statblocks still parses the vault, and again once its creature is there', async () => {
    const layout: StatblockLayout = { ...HOSTILE_LAYOUT, blocks: [HOSTILE_LAYOUT.blocks[0]!, HOSTILE_LAYOUT.blocks[3]!] };
    const scenario: StatblockScenario = { ...HOSTILE, fantasy: { layouts: [layout], creature: { ...HOSTILE.fantasy!.creature, notes: 'Hides as a chest.' } } };
    const trees = draw(scenario, true);
    // Until the bestiary holds it, the note's own frontmatter names the creature, and nothing more.
    await vi.waitFor(() => expect(textOf(trees.at(-1) ?? [])).toContain('Mimic'), { timeout: 5000 });
    expect(textOf(trees.at(-1)!)).not.toContain('Hides as a chest.');

    harness!.resolveBestiary();
    await vi.waitFor(() => expect(textOf(trees.at(-1)!)).toContain('Hides as a chest.'), { timeout: 5000 });
  });
});
