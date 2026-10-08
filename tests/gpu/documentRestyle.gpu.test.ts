import '../setup/obsidianDom';
import css from '../../styles/main.scss?inline';
import { cdp } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ASSET_MANAGER_OPEN_CLASS } from '../../src/app/packages/components/asset-manager/hooks/useOverlayBodyClass';
import { getObsidianAccentColor } from '../../src/app/pixi/utils/colorUtils';
import { isRecord } from '../../src/app/utils/guards';

/** A rule Fantasy Statblocks 4.10 ships: a `:has()` any element may match, styling anything below it. */
const FOREIGN_HAS = '.statblock.basic-13th-age-monster-layout :has(+ .rule-container) * { margin-bottom: 0 !important; }';
/** Obsidian's menus stand at 80 by its own stylesheet. */
const OBSIDIAN = 'body { --interactive-accent: rgb(138, 92, 245); } .menu { position: fixed; z-index: 80; }';
const ELEMENTS = 3000;
/** Far below the document's size, far above what one element coming or going restyles. */
const A_FEW = 50;

interface Trace {
  restyled: number;
  complete: () => void;
}

interface FrameTree {
  frame: { id: string; url: string };
  childFrames?: FrameTree[];
}

let trace: Trace | null = null;
let listening = false;

/** The id Chromium's trace names this test's frame by: tests of other files run beside it in the same browser. */
function ownFrame(tree: FrameTree): string | null {
  if (tree.frame.url === location.href) return tree.frame.id;
  for (const child of tree.childFrames ?? []) {
    const found = ownFrame(child);
    if (found) return found;
  }
  return null;
}

/**
 * Listens to the trace, once. The session is made by its first command, and listeners added
 * before it exists are lost, so a command goes first.
 */
async function listen(): Promise<void> {
  if (listening) return;
  listening = true;
  const frame = ownFrame((await cdp().send('Page.getFrameTree')).frameTree);
  expect(frame).not.toBeNull();
  cdp().on('Tracing.dataCollected', (payload: { value: unknown[] }): void => {
    for (const event of payload.value) {
      if (!trace || !isRecord(event) || event.name !== 'UpdateLayoutTree' || !isRecord(event.args)) continue;
      const { beginData, elementCount } = event.args;
      if (isRecord(beginData) && beginData.frame === frame && typeof elementCount === 'number') trace.restyled += elementCount;
    }
  });
  cdp().on('Tracing.tracingComplete', (): void => trace?.complete());
}

/**
 * How many elements Chromium worked out the style of while `run` ran, as its own trace reports it
 * ("Recalculate style, elements affected" in the developer tools).
 */
async function restyledDuring(run: () => void): Promise<number> {
  await listen();
  const completed = new Promise<number>((resolve) => {
    const current: Trace = { restyled: 0, complete: () => resolve(current.restyled) };
    trace = current;
  });
  await cdp().send('Tracing.start', { transferMode: 'ReportEvents', traceConfig: { includedCategories: ['devtools.timeline'] } });
  run();
  await cdp().send('Tracing.end');
  return completed;
}

/** Makes the style and layout of the document current, as the next frame would. */
const settle = (): void => { void document.body.offsetHeight; };

function comeAndGo(parent: HTMLElement, className: string): void {
  const element = parent.appendChild(document.createElement('div'));
  element.className = className;
  settle();
  element.remove();
  settle();
}

/**
 * Obsidian with Atlas and Fantasy Statblocks, after the first context menu of a session.
 * Atlas' stylesheet once matched `body:has(.atlas-asset-manager-modal) > .menu` against every
 * menu. From then on Chromium took every element of the document for one that `:has()` on the
 * body depends on, and with a rule like `FOREIGN_HAS` loaded it restyled the whole document
 * for every element that came or went anywhere in it: tooltips, a line typed in a note, the
 * ghost of a dragged file, and the element Atlas itself put into the body on every pointer
 * move of a token drag or a measurement.
 */
describe('what an element coming or going in Obsidian restyles while Atlas is loaded', { timeout: 30_000 }, () => {
  let styles: HTMLStyleElement[];
  let host: HTMLElement;
  let editor: HTMLElement;

  beforeEach(() => {
    styles = [css, OBSIDIAN, FOREIGN_HAS].map((text) => {
      const style = document.head.appendChild(document.createElement('style'));
      style.textContent = text;
      return style;
    });
    host = document.body.appendChild(document.createElement('div'));
    host.className = 'workspace';
    editor = host.appendChild(document.createElement('div'));
    for (let index = 1; index < ELEMENTS; index++) {
      const line = (index % 50 === 0 ? host : editor).appendChild(document.createElement('div'));
      line.className = 'cm-line';
    }
    settle();
  });

  afterEach(() => {
    host.remove();
    for (const style of styles) style.remove();
    document.body.classList.remove(ASSET_MANAGER_OPEN_CLASS);
    document.querySelectorAll('body > .menu').forEach((menu) => menu.remove());
  });

  function openAndCloseMenu(): void {
    comeAndGo(document.body, 'menu');
  }

  it('is a few elements before any menu was opened', async () => {
    expect(await restyledDuring(() => comeAndGo(document.body, 'tooltip'))).toBeLessThan(A_FEW);
  });

  it('is still a few elements once a menu was opened: a tooltip', async () => {
    openAndCloseMenu();
    expect(await restyledDuring(() => comeAndGo(document.body, 'tooltip'))).toBeLessThan(A_FEW);
  });

  it('is still a few elements once a menu was opened: a line in a note', async () => {
    openAndCloseMenu();
    expect(await restyledDuring(() => comeAndGo(editor, 'cm-line'))).toBeLessThan(A_FEW);
  });

  it('is nothing for the accent colour a drag asks for on every pointer move', async () => {
    openAndCloseMenu();
    expect(getObsidianAccentColor()).toBe('rgb(138, 92, 245)');

    const restyled = await restyledDuring(() => {
      for (let move = 0; move < 20; move++) {
        getObsidianAccentColor();
        settle();
      }
    });

    expect(restyled).toBe(0);
  });

  it('lifts Obsidian menus above the asset manager only while its overlay is open', () => {
    const menu = document.body.appendChild(document.createElement('div'));
    menu.className = 'menu';
    expect(getComputedStyle(menu).zIndex).toBe('80');

    document.body.classList.add(ASSET_MANAGER_OPEN_CLASS);
    expect(getComputedStyle(menu).zIndex).toBe('9999');

    document.body.classList.remove(ASSET_MANAGER_OPEN_CLASS);
    expect(getComputedStyle(menu).zIndex).toBe('80');
  });
});
