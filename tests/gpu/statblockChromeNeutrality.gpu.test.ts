import '../setup/obsidianDom';
import React, { useRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { allBuiltInTemplates } from '../../src/app/statblocks/library/builtInTemplates';
import { sampleRecord } from '../../src/app/statblocks/model/sampleValues';
import { Canvas } from '../../src/app/statblocks/editor/template-editor/Canvas';
import { EDITOR_VALUE_EDITING } from '../../src/app/statblocks/editor/template-editor/editorValueSlot';
import { PanelCard } from '../../src/app/statblocks/editor/panel-frame/PanelFrame';
import '../../src/app/statblocks/editor/template-editor/template-editor.scss';
import type { BlockSelection } from '../../src/app/statblocks/editor/template-editor/selection';
import type { BuiltInTemplate } from '../../src/app/statblocks/model/templateTypes';

// Dice links reach the map view (`atlas-view`), whose services need Node's `events`, which has no
// browser build. Both cards below draw through this same stand-in, so it changes nothing compared.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

/**
 * Chrome never touches layout (§7.6, spike S6, §17 A3): every block of every
 * built-in stands where it stands on the card as the template editor draws it
 * undressed (the note view's card, `statblockParity` holds that), at three
 * widths, whether the editor's chrome dresses it or not. Both draw the
 * editing mode with sample values, so the chrome is the only difference.
 */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-border-hover: #4a4a4a; --background-modifier-hover: rgba(255, 255, 255, 0.075);
    --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777; --text-accent: #a68af9; --interactive-accent: #7f6df2;
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px;
    --font-ui-medium: 15px; --font-ui-large: 20px; --line-height-normal: 1.5; --input-height: 30px; }
`;
const WIDTHS = [320, 540, 800];
const TOLERANCE = 0.5;
const h = React.createElement;
const noop = (): void => undefined;

interface Box { x: number; y: number; width: number; height: number }

/** Every block's box, relative to its card's corner. */
function blockBoxes(card: Element): Map<string, Box> {
  const origin = card.getBoundingClientRect();
  const boxes = new Map<string, Box>();
  for (const frame of card.querySelectorAll('[data-block-id]')) {
    const rect = frame.getBoundingClientRect();
    boxes.set(frame.getAttribute('data-block-id') ?? '', { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height });
  }
  return boxes;
}

function Pair({ builtIn, width, selection }: { builtIn: BuiltInTemplate; width: number; selection: BlockSelection }): React.ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const record = sampleRecord(builtIn.template);
  return h('div', { className: 'atlas-vtt-plugin' },
    h('div', { className: 'runtime', style: { width } },
      h(PanelCard, { template: builtIn.template, name: builtIn.name, record, app: undefined, sourcePath: undefined, valueEditing: EDITOR_VALUE_EDITING })),
    h('div', { className: 'editor', style: { width } },
      h(Canvas, {
        stageRef, template: builtIn.template, templateName: builtIn.name, record, selection, editable: true, label: null,
        washId: null, onWashed: noop, onSelect: noop, onEditLabel: noop, onInsertAt: noop, focusRequest: { id: null, count: 0 },
      })));
}

function compare(selection: BlockSelection, builtIn: BuiltInTemplate, width: number): void {
  render(h(Pair, { builtIn, width, selection }));
  const runtime = blockBoxes(document.querySelector('.runtime .atlas-statblock')!);
  const editor = blockBoxes(document.querySelector('.editor .atlas-statblock')!);
  expect(runtime.size).toBeGreaterThan(0);
  expect([...editor.keys()]).toEqual([...runtime.keys()]);
  for (const [id, box] of runtime) {
    const dressed = editor.get(id)!;
    for (const side of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(dressed[side] - box[side]), `${builtIn.id} ${id} ${side} at ${width}px`).toBeLessThanOrEqual(TOLERANCE);
    }
  }
}

describe('the template editor\'s chrome', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1200, 900);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  const cases = allBuiltInTemplates().flatMap((builtIn) => WIDTHS.map((width) => [builtIn.id, width, builtIn] as const));

  it.each(cases)('leaves every block of %s where the runtime card has it at %ipx', (_id, width, builtIn) => {
    compare([], builtIn, width);
  });

  it.each(cases)('leaves them there with a block selected and hovered too: %s at %ipx', (_id, width, builtIn) => {
    const first = builtIn.template.layout.blocks[0]?.id;
    compare(first ? [first] : [], builtIn, width);
    for (const frame of document.querySelectorAll('.editor [data-block-id]')) frame.setAttribute('data-sb-hover', '');
    const runtime = blockBoxes(document.querySelector('.runtime .atlas-statblock')!);
    const editor = blockBoxes(document.querySelector('.editor .atlas-statblock')!);
    for (const [id, box] of runtime) expect(Math.abs(editor.get(id)!.y - box.y)).toBeLessThanOrEqual(TOLERANCE);
  });
});
