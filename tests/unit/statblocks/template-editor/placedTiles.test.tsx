// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../../../src/app/packages/components/primitives/tooltip';
import { DragPreview } from '../../../../src/app/statblocks/editor/dnd/DragPreview';
import { ItemPreview } from '../../../../src/app/statblocks/editor/template-editor/ItemPreview';
import { commitLabel } from '../../../../src/app/statblocks/editor/template-editor/labelCommit';
import { insertItemFor } from '../../../../src/app/statblocks/editor/template-editor/insertItems';
import { TemplateEditor, type TemplateEditorHost } from '../../../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { createBlock, type AuthorableBlockType } from '../../../../src/app/statblocks/model/blockCatalogue';
import type { StatblockTemplate, TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { StatblockSheet } from '../../../../src/app/statblocks/render/StatblockSheet';
import { FakeSession, template } from './editorKit';

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  Element.prototype.scrollIntoView = vi.fn();
});
afterAll(() => { MotionGlobalConfig.skipAnimations = false; });
afterEach(cleanup);

const host: TemplateEditorHost = { save: vi.fn(async () => null), close: vi.fn() };
const KINDS: readonly AuthorableBlockType[] = ['stat', 'metric', 'entries', 'scores', 'text'];

/** Each kind twice, as placed: `u-<kind>` stays unnamed, `n-<kind>` is named "Morale". */
function placedAndNamed(): StatblockTemplate {
  const blocks: TemplateBlock[] = [{ id: 'title001', type: 'title', field: 'name', level: 1 }];
  for (const kind of KINDS) blocks.push(createBlock(kind, () => `u-${kind}`), createBlock(kind, () => `n-${kind}`));
  return KINDS.reduce((current, kind) => commitLabel(current, `n-${kind}`, `Morale ${kind}`).template, template(blocks, [{ key: 'name', label: 'Name', type: 'text' }]));
}

function renderEditor(session: FakeSession): HTMLElement {
  render(<TooltipProvider><TemplateEditor session={session} host={host} collectionId={null} /></TooltipProvider>);
  return document.querySelector<HTMLElement>('.atlas-te-stage')!;
}

const tile = (root: ParentNode, id: string): HTMLElement => root.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
const text = (root: Element, selector: string): string[] => [...root.querySelectorAll(selector)].map((element) => element.textContent ?? '');
/**
 * What a tile is made of, its words aside: its elements' tags and classes, in order. A named Table's row and column
 * controls are left out: a tile not named yet takes no edit, so it offers none.
 */
const shapeOf = (element: Element): string => [...element.querySelectorAll('*')]
  .filter((node) => !node.closest('button'))
  .map((node) => `${node.tagName}.${[...node.classList].filter((name) => !name.startsWith('atlas-sb-placeholder') && !name.startsWith('atlas-sb-prompt')).sort().join('.')}`)
  .join(' ');

describe('a tile just placed looks as it will once named', () => {
  it('draws each kind in its finished shape, a placeholder where its name will stand', () => {
    const session = new FakeSession(placedAndNamed());
    const stage = renderEditor(session);

    const value = tile(stage, 'u-stat');
    expect(text(value, '.atlas-sb-label.atlas-sb-placeholder')).toEqual(['Value']);
    expect(text(value, '.atlas-sb-prompt')).toEqual(['Add value']);
    expect(text(tile(stage, 'u-metric'), '.atlas-sb-metric__number > *')).toEqual(['Number', 'Add number']);
    expect(text(tile(stage, 'u-entries'), '.atlas-sb-section-heading.atlas-sb-placeholder')).toEqual(['Abilities']);
    expect(text(tile(stage, 'u-entries'), '.atlas-sb-prompt')).toEqual(['Add abilities']);
    expect(text(tile(stage, 'u-text'), '.atlas-sb-section-heading.atlas-sb-placeholder')).toEqual(['Text']);
    expect(text(tile(stage, 'u-text'), '.atlas-sb-prompt')).toEqual(['Add text']);
    const table = tile(stage, 'u-scores');
    expect(text(table, 'thead th')).toEqual(['Column 1', 'Column 2', 'Column 3']);
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2);

    for (const kind of KINDS) {
      // A Table compares its grid: the named one's controls hang beside it.
      const part = (id: string): Element => (kind === 'scores' ? tile(stage, id).querySelector('table')! : tile(stage, id));
      expect(shapeOf(part(`u-${kind}`)), kind).toBe(shapeOf(part(`n-${kind}`)));
      expect(tile(stage, `u-${kind}`).hasAttribute('data-prop'), kind).toBe(false);
    }
    // Drawing a tile as named writes nothing into the template.
    expect(session.steps).toBe(0);
    expect(session.template.fields.some((field) => field.key === '')).toBe(false);
  });

  it('keeps a statblock\'s pane drawing an unnamed block as its prompt alone', () => {
    const blocks: TemplateBlock[] = [createBlock('scores', () => 'u-scores'), createBlock('stat', () => 'u-stat')];
    const { container } = render(<StatblockSheet template={template(blocks)} name="T" fields={{}} variant="full" mode="editing" />);
    expect(tile(container, 'u-scores').querySelector('table')).toBeNull();
    expect(text(tile(container, 'u-stat'), '.atlas-sb-prompt')).toEqual(['Value']);
  });
});

describe('what the dock and the insert menu show of a kind', () => {
  it('previews the tile as it is placed, without the card\'s header', () => {
    const { container } = render(<ItemPreview item={insertItemFor('scores')} />);
    expect(text(container, 'thead th')).toEqual(['Column 1', 'Column 2', 'Column 3']);
    expect(container.querySelector('.atlas-sb-header, [data-block="title"]')).toBeNull();
    expect(container.querySelector('[data-block-id]')).toBeNull();
    cleanup();
    const metric = render(<ItemPreview item={insertItemFor('metric')} />).container;
    expect(text(metric, '.atlas-sb-metric__number > *')).toEqual(['Number', 'Add number']);
  });

  it('carries a kind from the dock as the tile it places, at the width of a tile of the card', () => {
    const { container } = render(
      <DragPreview source={{ kind: 'item', item: insertItemFor('entries') }} template={template([])} record={{}} app={undefined} sourcePath={undefined} tileWidth={320} />,
    );
    const face = container.querySelector<HTMLElement>('.atlas-te-drag-face--item')!;
    expect(face.style.getPropertyValue('--atlas-te-tile-width')).toBe('320px');
    expect(text(face, '.atlas-te-drag-sheet .atlas-sb-section-heading')).toEqual(['Abilities']);
    expect(text(face, '.atlas-sb-prompt')).toEqual(['Add abilities']);
  });
});
