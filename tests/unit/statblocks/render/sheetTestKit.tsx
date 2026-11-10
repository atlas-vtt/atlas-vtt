import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { StatblockSheet, type StatblockSheetProps } from '../../../../src/app/statblocks/render/StatblockSheet';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { TEMPLATE_FORMAT } from '../../../../src/app/statblocks/model/templateTypes';

type SheetOptions = Partial<Omit<StatblockSheetProps, 'template' | 'fields'>>;

/** Renders a template for a statblock's values; without an `app`, Markdown shows as plain text. */
export function renderSheet(template: StatblockTemplate, fields: Record<string, unknown>, options: SheetOptions = {}): RenderResult {
  return render(<StatblockSheet template={template} fields={fields} name="Test template" variant="full" {...options} />);
}

/** A template of these fields and blocks, one column. */
export function templateOf(fields: TemplateField[], blocks: TemplateBlock[], lookups?: StatblockTemplate['lookups']): StatblockTemplate {
  return {
    format: TEMPLATE_FORMAT,
    version: 1,
    id: 'test-template-abc123',
    fields,
    layout: { maxColumns: 2, columnWidth: 22, blocks },
    ...(lookups ? { lookups } : {}),
  };
}

export function blockEl(container: HTMLElement, id: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
}

/** A block's text with whitespace collapsed. */
export function blockText(container: HTMLElement, id: string): string {
  return (blockEl(container, id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The text of a block's value, its label left out. */
export function valueOf(container: HTMLElement, id: string): string {
  return (blockEl(container, id)?.querySelector('.atlas-sb-value')?.textContent ?? '').trim();
}

interface Roll {
  formula: string;
  source: unknown;
}

/** An Obsidian app whose open map rolls into `rolls`, and whose vault serves `app://` paths. */
export function fakeApp(rolls: Roll[] = []): never {
  const diceTool = {
    rollDice: (formula: string, source: unknown) => {
      rolls.push({ formula, source });
      return { formula, total: 7 };
    },
  };
  return {
    workspace: {
      getLeavesOfType: () => [
        { view: { serviceManager: { getToolController: () => ({ getDiceTool: () => diceTool }) } } },
      ],
    },
    metadataCache: { getFirstLinkpathDest: (path: string) => ({ path }) },
    vault: { getResourcePath: (file: { path: string }) => `app://local/${file.path}`, getFileByPath: () => null },
  } as never;
}
