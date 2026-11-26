import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { commands, page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { messageParts } from '../../src/app/online/gm/assetServe';
import { DRAWN_CLASSES } from '../../src/app/online/gmScreen/statblocks/drawnClasses';
import { drawnTree } from '../../src/app/online/gmScreen/statblocks/drawnTree';
import { PortraitShelf } from '../../src/app/online/gmScreen/statblocks/PortraitShelf';
import { StatblockDrawing, type DrawnStatblockProps } from '../../src/app/online/gmScreen/statblocks/StatblockDrawing';
import { parseGmScreenMessage, sealedLength, type DrawnNode, type GmScreenMessage } from '../../src/app/online/protocol/index';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { LinkedStatblock } from '../../src/app/statblocks/render/LinkedStatblock';
import { HIT_POINTS, STATBLOCK_SCENARIOS, STRESS, type StatblockScenario } from '../fixtures/gmScreenStatblockNotes';
import { buildDrawnTree } from '../helpers/drawnTreeElements';
import { renderObsidianMarkdown } from '../helpers/obsidianMarkdown';
import { scenarioApp } from '../helpers/statblockScenarioApp';
import { THEME } from './sidePanesHarness';

// The roll's way to a map reaches the map view, whose Node `events` has no browser build; nothing here rolls.
vi.mock('../../src/app/services/statblockRolls', () => ({ rollStatblockDice: () => null, statblockRollingDice: () => null }));
vi.mock('../../src/app/services/statblockHitPoints', () => ({ rollHitPoints: () => undefined }));

/** Where the DM screen's drawings are kept, for the device's page to be held against. */
const SHOTS = 'out/gm-screen-statblocks';
const FIXTURE = 'tests/fixtures/gmScreenStatblockTrees.json';
const FEED_WIDTH = 340;
const h = React.createElement;

interface Measured {
  id: string;
  path: string;
  message: GmScreenMessage;
  classes: string[];
  nodes: number;
  bytes: number;
  sealedBytes: number;
  frames: number;
  drawMs: number;
}

const results: Measured[] = [];

function propsOf(scenario: StatblockScenario): DrawnStatblockProps {
  return {
    path: scenario.path, tokens: scenario.tokens, viewId: undefined, originContext: undefined,
    tokenActions: { definitions: [HIT_POINTS, STRESS], onUpdateToken: vi.fn(), onLocateToken: vi.fn() },
  };
}

const textOf = (nodes: readonly DrawnNode[]): string => nodes.map((node) => (typeof node === 'string' ? node : textOf(node.k ?? []))).join('');
const countOf = (nodes: readonly DrawnNode[]): number => nodes.reduce((sum, node) => sum + 1 + (typeof node === 'string' ? 0 : countOf(node.k ?? [])), 0);
const classesOf = (nodes: readonly DrawnNode[]): string[] => nodes.flatMap((node) => (typeof node === 'string' ? [] : [...(node.c ?? []), ...classesOf(node.k ?? [])]));
// The stylesheet sets some labels in capitals, which the browser's `innerText` reports.
const plain = (text: string): string => text.replace(/\s+/g, '').toLowerCase();

/** Until the element shows a statblock (no skeleton) and nothing in it changed for a while. */
async function settled(element: HTMLElement): Promise<void> {
  let changed = performance.now();
  const observer = new MutationObserver(() => { changed = performance.now(); });
  observer.observe(element, { subtree: true, childList: true, attributes: true, characterData: true });
  await vi.waitFor(() => {
    expect(element.querySelector('.atlas-statblock-skeleton')).toBeNull();
    expect(element.querySelector('.atlas-statblock')).not.toBeNull();
    expect(performance.now() - changed).toBeGreaterThan(400);
  }, { timeout: 10_000, interval: 50 });
  observer.disconnect();
}

/** The DM screen's feed the statblocks stand in, as wide as the drawing for a device. */
function feedFrame(): HTMLElement {
  const frame = document.body.createDiv({ cls: 'atlas-vtt-plugin' }).createDiv({ cls: 'atlas-dm-statblock-feed-item' });
  frame.style.cssText = `position: static; width: ${FEED_WIDTH}px; background: var(--background-primary)`;
  return frame;
}

/** Where every block and token row lies in a statblock, from its top left corner. */
function blockBoxes(frame: HTMLElement): string[] {
  const origin = frame.getBoundingClientRect();
  return [...frame.querySelectorAll('.atlas-sb-item, .atlas-sb-token-entry, .atlas-sb-token-pips, .atlas-sb-token-gauge')].map((element) => {
    const box = element.getBoundingClientRect();
    // A block that is not drawn has no box, wherever its statblock lies.
    if (box.width === 0 && box.height === 0) return 'none';
    return [box.left - origin.left, box.top - origin.top, box.width, box.height].map((value) => Math.round(value)).join(',');
  });
}

/** A picture the browser can show in place of an address only Obsidian serves. */
async function showArt(element: HTMLElement, art: string): Promise<void> {
  for (const image of element.querySelectorAll('img')) image.src = `data:image/png;base64,${art}`;
  await Promise.all([...element.querySelectorAll('img')].map((image) => image.decode().catch(() => undefined)));
}

describe('statblocks as the DM screen draws them, sent to a GM screen device', { timeout: 60_000 }, () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  afterAll(async () => {
    const fixture = {
      about: 'Statblocks as Atlas sends them to a GM screen device (tests/gpu/gmScreenStatblocks.gpu.test.ts writes this file): '
        + 'the DM screen\'s drawing of each statblock of tests/fixtures/gmScreenStatblockNotes.ts, as a tree of allowed elements, '
        + 'and the classes it relies on. The device\'s page draws them with Atlas\'s stylesheet.',
      statblocks: results.map(({ id, path, message, classes }) => ({ id, path, classes, message })),
    };
    // One statblock a line: the trees are long, and a line each keeps a change to one of them one line of a diff.
    const lines = fixture.statblocks.map((statblock) => `    ${JSON.stringify(statblock)}`);
    await commands.writeFile(FIXTURE, `{\n  "about": ${JSON.stringify(fixture.about)},\n  "statblocks": [\n${lines.join(',\n')}\n  ]\n}\n`);
    const table = results.map(({ id, nodes, bytes, sealedBytes, frames, drawMs }) => ({ id, nodes, bytes, sealedBytes, frames, drawMs }));
    await commands.writeFile('out/gm-screen-statblocks/measures.json', `${JSON.stringify(table, null, 2)}\n`);
  });

  for (const scenario of STATBLOCK_SCENARIOS) {
    it(`draws the ${scenario.id} statblock, and sends what the DM screen shows of it`, async () => {
      document.head.append(style);
      await page.viewport(1000, 2400);
      renderObsidianMarkdown();
      const art = await commands.readFile('tests/fixtures/images/rgb8.png', 'base64');
      const bytes = Uint8Array.from(atob(art), (char) => char.charCodeAt(0));
      const harness = scenarioApp([scenario], bytes.buffer);
      try {
        // The DM screen's drawing, where the GM sees it.
        const frame = feedFrame();
        const props = propsOf(scenario);
        await act(async () => {
          render(h(LinkedStatblock, { app: harness.app, path: props.path, variant: 'feed', tokens: [...props.tokens], pressableCounters: true, tokenActions: props.tokenActions }), { container: frame });
        });
        await settled(frame);

        // The same statblock drawn for the device, read as it is sent.
        const shelf = new PortraitShelf(harness.app, () => Promise.reject(new Error('no image workers here')));
        const start = performance.now();
        let drawing: StatblockDrawing | null = null;
        const element = await new Promise<HTMLElement>((resolve) => {
          drawing = new StatblockDrawing(harness.app, (drawn) => resolve(drawn));
          drawing.draw(props);
        });
        const images = [...element.querySelectorAll('img')].flatMap((image) => {
          const file = shelf.fileOfSource(image.getAttribute('src') ?? '');
          return file ? [shelf.hashOf(file)] : [];
        });
        await Promise.all(images);
        const tree = drawnTree(element, (image) => {
          const file = shelf.fileOfSource(image.getAttribute('src') ?? '');
          return file ? shelf.knownHash(file) ?? null : null;
        });
        const drawMs = Math.round(performance.now() - start);
        drawing!.dispose();
        const message: GmScreenMessage = { t: 'statblock', id: `s${STATBLOCK_SCENARIOS.indexOf(scenario) + 1}`, nodes: tree.nodes, cut: tree.cut };
        const json = JSON.stringify(message);

        // The page reads it as it was sent, and it shows every text the GM sees, in the same order.
        expect(parseGmScreenMessage(JSON.parse(json))).toEqual(message);
        expect(tree.cut).toBe(false);
        expect(plain(textOf(tree.nodes))).toBe(plain(frame.innerText));
        // No vault path and no address of a file leaves Atlas; a picture goes by its hash.
        expect(json).not.toMatch(/Bestiary\/|Art\/|app:\/\/|Marsh Campaign|"href"/);
        expect(classesOf(tree.nodes).filter((name) => !DRAWN_CLASSES.has(name))).toEqual([]);

        const length = new TextEncoder().encode(json).length;
        const sealed = sealedLength(length);
        results.push({
          id: scenario.id, path: scenario.path, message, classes: [...new Set(classesOf(tree.nodes))].sort(), nodes: countOf(tree.nodes),
          bytes: length, sealedBytes: sealed, frames: messageParts({ t: 'sealed', n: Number.MAX_SAFE_INTEGER, d: 'A'.repeat(sealed) }, () => 'p').length, drawMs,
        });

        await showArt(frame, art);
        await page.screenshot({ path: `${SHOTS}/${scenario.id}.png`, element: frame });

        // Built as the page builds it, with Atlas's stylesheet, every block and token row lies where the DM screen has it.
        const rebuilt = feedFrame();
        buildDrawnTree(tree.nodes, rebuilt, () => `data:image/png;base64,${art}`);
        await showArt(rebuilt, art);
        expect(blockBoxes(rebuilt)).toEqual(blockBoxes(frame));
        expect(rebuilt.getBoundingClientRect().height).toBeCloseTo(frame.getBoundingClientRect().height, 0);
        await page.screenshot({ path: `${SHOTS}/${scenario.id}-rebuilt.png`, element: rebuilt });
      } finally {
        TemplateLibrary.release(harness.app);
        harness.dispose();
        style.remove();
      }
    });
  }
});
