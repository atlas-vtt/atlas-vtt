import { cdp } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import css from '../../src/app/packages/components/true-scale/true-scale.scss?inline';
import { mouse } from './realMouse';

/** Obsidian's own rules (app.css) for a native range, which reach the dial too. */
const OBSIDIAN_RULES = `
  body {
    --slider-thumb-background: white;
    --slider-thumb-background-hover: white;
    --slider-thumb-border-width: 0.5px;
    --slider-thumb-height: 18px;
    --slider-thumb-width: 18px;
    --slider-thumb-height-active: var(--slider-thumb-height);
    --slider-thumb-width-active: var(--slider-thumb-width);
    --slider-thumb-y: -6px;
    --slider-thumb-y-active: var(--slider-thumb-y);
    --slider-thumb-opacity-active: 0.7;
    --interactive-accent: rgb(200, 0, 0);
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: var(--slider-thumb-height);
    width: var(--slider-thumb-width);
    background: var(--slider-thumb-background);
    border: var(--slider-thumb-border-width) solid gray;
    position: relative;
    top: var(--slider-thumb-y);
  }
  input[type='range']:where(:not(:disabled))::-webkit-slider-thumb:hover,
  input[type='range']:where(:not(:disabled))::-webkit-slider-thumb:active {
    background: var(--slider-thumb-background-hover);
  }
  input[type='range']:where(:not(:disabled))::-webkit-slider-thumb:active {
    width: var(--slider-thumb-width-active);
    height: var(--slider-thumb-height-active);
    opacity: var(--slider-thumb-opacity-active);
    top: var(--slider-thumb-y-active);
  }
`;

interface DomNode {
  nodeId: number;
  attributes?: string[];
  children?: DomNode[];
  shadowRoots?: DomNode[];
  contentDocument?: DomNode;
}

/** A part of a native range goes by its id in the range's own shadow root. */
function findPart(node: DomNode, id: 'thumb' | 'track'): DomNode | null {
  const at = node.attributes?.indexOf('id') ?? -1;
  if (at >= 0 && node.attributes?.[at + 1] === id) return node;
  for (const child of [...(node.shadowRoots ?? []), ...(node.children ?? []), ...(node.contentDocument ? [node.contentDocument] : [])]) {
    const found = findPart(child, id);
    if (found) return found;
  }
  return null;
}

/** The box of a part of the native range, which no script in the page can reach, top and height in page pixels. */
async function partBox(id: 'thumb' | 'track'): Promise<{ top: number; height: number }> {
  const { root } = await cdp().send('DOM.getDocument', { depth: -1, pierce: true }) as { root: DomNode };
  const part = findPart(root, id);
  if (!part) throw new Error(`no ${id}`);
  const { model } = await cdp().send('DOM.getBoxModel', { nodeId: part.nodeId }) as { model: { border: number[]; height: number } };
  return { top: model.border[1]!, height: model.height };
}

const centre = (box: { top: number; height: number }): number => box.top + box.height / 2;

describe("the card fit's dial", () => {
  const obsidian = document.createElement('style');
  obsidian.textContent = OBSIDIAN_RULES;
  const plugin = document.createElement('style');
  plugin.textContent = css;
  const dial = document.createElement('input');
  dial.type = 'range';
  dial.className = 'atlas-true-scale__dial';
  dial.style.width = '200px';

  beforeEach(() => {
    document.head.append(obsidian, plugin);
    document.body.append(dial);
  });

  afterEach(() => {
    dial.remove();
    obsidian.remove();
    plugin.remove();
  });

  it('keeps the knob on the track at rest, under the pointer and while pressed', async () => {
    const { left, top, width, height } = dial.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const track = await partBox('track');
    expect(track.height).toBeGreaterThan(0);

    const expectOnTrack = async (): Promise<void> => {
      const knob = await partBox('thumb');
      expect(Math.abs(centre(knob) - centre(track))).toBeLessThan(1);
      expect(knob.height).toBeCloseTo(16, 0);
    };

    await expectOnTrack();
    await mouse.send('mouseMoved', x, y, false);
    await expectOnTrack();
    await mouse.down(x, y);
    await expectOnTrack();
    await mouse.send('mouseReleased', x, y, false);
  });
});
