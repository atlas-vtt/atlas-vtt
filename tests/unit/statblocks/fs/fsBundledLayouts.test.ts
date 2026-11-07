/**
 * The converter on Fantasy Statblocks' bundled layouts, read from a local FS
 * checkout (`ATLAS_FS_CHECKOUT=/path/to/fantasy-statblocks`); skipped without
 * one. Nothing about these layouts is committed: the assertions are the
 * converter's general promises, and the numbers are printed, not stored.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { fsLayoutToTemplate } from '../../../../src/app/statblocks/fs/fsLayoutToTemplate';
import type { FsImportResult, FsLayout } from '../../../../src/app/statblocks/fs/fsLayoutTypes';
import { FS_CHECKOUT, loadBundledLayouts } from './fsCheckout';
import { expectParses, lostCode } from './fsCodeKit';

/** At least this share of the blocks without JavaScript must show in full (§13.1, S7). */
const FULL_SHARE = 0.9;

describe.skipIf(!FS_CHECKOUT)('Fantasy Statblocks’ bundled layouts', () => {
  let imports: { layout: FsLayout; result: FsImportResult }[] = [];

  beforeAll(async () => {
    const layouts = await loadBundledLayouts(FS_CHECKOUT ?? '');
    const resolveLayout = (idOrName: string): FsLayout | null =>
      layouts.find((layout) => layout.id === idOrName || layout.name === idOrName) ?? null;
    imports = layouts.map((layout, index) => ({ layout, result: fsLayoutToTemplate(layout, { id: `bundled-${String(index).padStart(6, '0')}`, resolveLayout }) }));
  });

  it('finds the layouts', () => {
    expect(imports.length).toBeGreaterThan(0);
  });

  it('imports each into a template that parses and that the editor can work on', () => {
    for (const { result } of imports) expectParses(result.template);
  });

  it('keeps every piece of JavaScript it does not express as a pattern, option or formula', () => {
    for (const { layout, result } of imports) expect(lostCode(layout, result.template), layout.name).toEqual([]);
  });

  it(`shows at least ${FULL_SHARE * 100} % of the blocks without JavaScript in full`, () => {
    const rows = imports.map(({ layout, result: { report } }) => ({
      layout: layout.name,
      blocks: report.blocks,
      fields: report.fields,
      scripts: report.scripts.length,
      tracks: report.scripts.filter((script) => script.suggestion === 'track').length,
      dropped: report.dropped.length,
      partial: report.partial.length,
      plain: report.withoutCode.total,
      full: report.withoutCode.full,
    }));
    console.info(rows);
    for (const row of rows) expect(row.full / Math.max(1, row.plain), row.layout).toBeGreaterThanOrEqual(FULL_SHARE);
    const plain = rows.reduce((sum, row) => sum + row.plain, 0);
    const full = rows.reduce((sum, row) => sum + row.full, 0);
    console.info(`All bundled layouts: ${full} of ${plain} blocks without JavaScript in full (${((100 * full) / plain).toFixed(1)} %)`);
    expect(full / plain).toBeGreaterThanOrEqual(FULL_SHARE);
  });
});
