/**
 * Imports a Fantasy Statblocks layout as an Atlas template (§6.2): pure and
 * one way. Blocks map to the template's blocks, every key a block names
 * becomes a field (keys stay as FS wrote them, so existing notes render
 * without migration), and JavaScript is kept verbatim in script blocks and
 * `fsExtras`, never run. Layout-level keys the template does not model
 * (`diceParsing`, `cssProperties`, `forceColumns`) go to `importedFrom.extras`.
 * The name, image, type, level, hit points and description go to the header
 * Atlas draws (`fsHeader.ts`).
 */

import { isRecord, jsonRecordCopy, own } from '../format/jsonValues';
import { TEMPLATE_FORMAT, TEMPLATE_VERSION, type StatblockTemplate, type TemplateLayout } from '../model/templateTypes';
import { convertBlocks } from './fsBlocks';
import { withFsHeader } from './fsHeader';
import { FsFieldRegistry, FsLookupTables, FsReportTally, sequentialBlockIds, type ImportContext } from './fsImportState';
import type { FsImportOptions, FsImportResult, FsLayout } from './fsLayoutTypes';
import { textOf } from './fsBlockParts';
import { t } from '../../i18n';

export { suggestedTrackReplacement, type TrackReplacement } from './fsScripts';

/** Layout keys the template models, and FS's bookkeeping for its bundled layouts, which an export must not repeat. */
const READ_KEYS: ReadonlySet<string> = new Set(['name', 'id', 'blocks', 'columns', 'columnWidth', 'edited', 'removed', 'version', 'updatable']);
/** FS sizes columns in px, Atlas in em. */
const PX_PER_EM = 16;
/** Included layouts can repeat a small file many times over; past this many FS blocks the rest is left out. */
const MAX_BLOCKS = 2000;

/**
 * Whether a value is shaped like a layout FS's own import accepts: a name and
 * a list of blocks. The blocks themselves are not checked here; the converter
 * reads each one as untrusted.
 */
export function isFsLayout(value: unknown): value is FsLayout {
  return isRecord(value) && typeof own(value, 'name') === 'string' && Array.isArray(own(value, 'blocks'));
}

function maxColumnsOf(value: unknown, tally: FsReportTally): TemplateLayout['maxColumns'] {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 2;
  const columns = Math.round(value);
  if (columns > 3) tally.note(t('statblockEditor.fs.columns', { count: columns }));
  if (columns <= 1) return 1;
  return columns === 2 ? 2 : 3;
}

function columnWidthOf(value: unknown): Pick<TemplateLayout, 'columnWidth'> {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return {};
  return { columnWidth: Math.max(1, Math.round(value / PX_PER_EM)) };
}

/** The template a Fantasy Statblocks layout makes, and a report of what was kept, shown in part, or left out. */
export function fsLayoutToTemplate(layout: FsLayout, options: FsImportOptions): FsImportResult {
  const given: unknown = layout;
  const record = isRecord(given) ? given : {};
  const layoutId = textOf(record, 'id') ?? '';
  const layoutName = textOf(record, 'name') ?? '';
  const ctx: ImportContext = {
    fields: new FsFieldRegistry(),
    lookups: new FsLookupTables(),
    tally: new FsReportTally(),
    nextId: sequentialBlockIds(),
    resolveLayout: options.resolveLayout,
    including: [layoutId, layoutName].filter((name) => name !== ''),
    budget: MAX_BLOCKS,
  };
  const blocks = convertBlocks(own(record, 'blocks'), ctx, { depth: 0, parent: 'root' });
  const extras = jsonRecordCopy(Object.fromEntries(Object.entries(record).filter(([key]) => !READ_KEYS.has(key))));
  const fields = ctx.fields.fields();
  const lookups = ctx.lookups.all();
  const template: StatblockTemplate = withFsHeader({
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    id: options.id,
    importedFrom: { layoutId, layoutName, ...(extras && Object.keys(extras).length > 0 ? { extras } : {}) },
    fields,
    ...(lookups && { lookups }),
    layout: { maxColumns: maxColumnsOf(own(record, 'columns'), ctx.tally), ...columnWidthOf(own(record, 'columnWidth')), blocks },
  });
  return { template, report: ctx.tally.report(fields.length) };
}
