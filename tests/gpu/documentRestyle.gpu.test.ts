import '../setup/obsidianDom';
import css from '../../styles/main.scss?inline';
import { cdp } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ASSET_MANAGER_OPEN_CLASS } from '../../src/app/packages/components/asset-manager/hooks/useOverlayBodyClass';
import { getObsidianAccentColor } from '../../src/app/pixi/utils/colorUtils';
import { isRecord } from '../../src/app/utils/guards';

/** A rule Fantasy Statblocks 4.10 ships: a `:has()` any element may match, styling anything below it. */
const FOREIGN_HAS = '.statblock.basic-13th-age-monster-layout :has(+ .rule-container) * { margin-bottom: 0 !important; }';
/**
 * What Obsidian's own stylesheet adds to the picture: its menus stand at 80, and one of its
 * rules has a `:has()` argument that any `div` put into the document may match.
 */
const OBSIDIAN = `
  body { --interactive-accent: rgb(138, 92, 245); }
  .menu { position: fixed; z-index: 80; }
  .annotationLayer section:has(div.annotationContent) canvas.annotationContent { display: none; }
`;
/** The rule Atlas' stylesheet held. */
const FORMER_RULE = 'body:has(.atlas-asset-manager-modal) > .menu { z-index: 9999; }';
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

function addDiv(parent: HTMLElement, className: string): HTMLDivElement {
  const element = parent.appendChild(document.createElement('div'));
  element.className = className;
  return element;
}

function comeAndGo(parent: HTMLElement, className: string): void {
  const element = addDiv(parent, className);
  settle();
  element.remove();
  settle();
}

/**
 * Obsidian with Atlas and Fantasy Statblocks, after the first context menu of a session.
 * Three rules met. Atlas' stylesheet matched `body:has(.atlas-asset-manager-modal) > .menu`
 * against every menu, after which Chromium took every element of the document for one that
 * `:has()` on the body depends on. Obsidian's own stylesheet has a `:has()` whose argument an
 * element put into the document may match, so every such element had the body looked at again.
 * And a rule like `FOREIGN_HAS` makes that a restyle of everything below the body. So the whole
 * document was restyled for every element that came or went anywhere in it: tooltips, a line
 * typed in a note, the ghost of a dragged file, and the element Atlas itself put into the body
 * on every pointer move of a token drag or a measurement.
 */
describe('what an element coming or going in Obsidian restyles while Atlas is loaded', { timeout: 30_000 }, () => {
  let styles: HTMLStyleElement[] = [];
  let editor: HTMLElement;

  /** Obsidian's workspace in a body of its own: what Chromium remembers of `:has()` it remembers on the body. */
  function open(atlas: string): void {
    for (const style of styles) style.remove();
    document.documentElement.replaceChild(document.createElement('body'), document.body);
    styles = [atlas, OBSIDIAN, FOREIGN_HAS].map((text) => {
      const style = document.head.appendChild(document.createElement('style'));
      style.textContent = text;
      return style;
    });
    const workspace = addDiv(document.body, 'workspace');
    const tabs = addDiv(workspace, 'workspace-tabs');
    addDiv(addDiv(tabs, 'workspace-tab-header-container'), 'workspace-tab-header');
    editor = addDiv(tabs, 'workspace-tab-container').appendChild(document.createElement('div'));
    for (let index = document.body.querySelectorAll('*').length; index < ELEMENTS; index++) {
      addDiv(index % 50 === 0 ? workspace : editor, 'cm-line');
    }
    settle();
  }

  beforeEach(() => open(css));

  afterEach(() => {
    for (const style of styles.splice(0)) style.remove();
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

  it('was the whole document, twice, with the rule Atlas held: these fixtures alone show it', async () => {
    open(FORMER_RULE);
    expect(await restyledDuring(() => comeAndGo(editor, 'cm-line'))).toBeLessThan(A_FEW);

    openAndCloseMenu();
    expect(await restyledDuring(() => comeAndGo(editor, 'cm-line'))).toBeGreaterThan(ELEMENTS);
    expect(await restyledDuring(() => comeAndGo(document.body, 'tooltip'))).toBeGreaterThan(ELEMENTS);
  });

  it('lifts Obsidian menus above the asset manager only while its overlay is open', () => {
    const menu = addDiv(document.body, 'menu');
    expect(getComputedStyle(menu).zIndex).toBe('80');

    document.body.classList.add(ASSET_MANAGER_OPEN_CLASS);
    expect(getComputedStyle(menu).zIndex).toBe('9999');

    document.body.classList.remove(ASSET_MANAGER_OPEN_CLASS);
    expect(getComputedStyle(menu).zIndex).toBe('80');
  });
});
