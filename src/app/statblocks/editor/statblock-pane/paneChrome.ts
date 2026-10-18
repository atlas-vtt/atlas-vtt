import type { KeyboardEvent, MouseEvent } from 'react';
import type { TemplateBlock, TemplateField } from '../../model/templateTypes';
import type { BlockChrome, BlockDecoration } from '../../render/blockChrome';
import { METRIC_INDEX_ATTRIBUTE } from '../../render/blocks/MetricView';
import { LIVE_TABLE_ATTRIBUTE } from '../table/EditableTable';
import type { EditableSpots } from './editableSpots';
import type { EditTarget } from './paneEditContext';

/**
 * Clicks on these keep their own meaning: a link opens, a die rolls, a section folds, a Table's cell is typed
 * (`EditableTable`), a value's switch arms it for the next roll (`ArmSwitch`).
 */
const OWN_CLICKS = `a, button, input, textarea, [role="switch"], .atlas-dice-link, .internal-link, [${LIVE_TABLE_ATTRIBUTE}]`;

function clickedInside(target: EventTarget | null, selector: string): Element | null {
  const node = target as { closest?: (selector: string) => Element | null } | null;
  return typeof node?.closest === 'function' ? node.closest(selector) : null;
}

/** The ordinal of the entry clicked in an Entries block, as it shows; undefined outside an entry. */
function clickedEntry(event: MouseEvent<HTMLDivElement>): number | undefined {
  const drawn = '.atlas-sb-trait:not(.atlas-sb-pane-entry-editor--new)';
  const entry = clickedInside(event.target, drawn);
  if (!entry) return undefined;
  const index = [...event.currentTarget.querySelectorAll(drawn)].indexOf(entry);
  return index < 0 ? undefined : index;
}

/** The field of the Metric number clicked, where the pane edits it; undefined outside a number. */
function clickedNumber(event: MouseEvent<HTMLDivElement>, block: TemplateBlock, fields: readonly TemplateField[]): TemplateField | undefined {
  if (block.type !== 'metric') return undefined;
  const index = Number(clickedInside(event.target, `[${METRIC_INDEX_ATTRIBUTE}]`)?.getAttribute(METRIC_INDEX_ATTRIBUTE));
  const key = Number.isInteger(index) ? block.fields[index] : undefined;
  return key ? fields.find((field) => field.key === key) : undefined;
}

/**
 * How the pane dresses the card's blocks (§7.6): a block with values to edit
 * is a button that starts editing its first field (a Metric the number
 * clicked; a Table types the cell clicked itself), with a hover wash that
 * changes no box. The block being edited carries only a class.
 */
export function paneChrome(
  spots: EditableSpots,
  editing: EditTarget | null,
  writable: boolean,
  start: (target: EditTarget) => void,
): BlockChrome {
  return {
    decorate(block: TemplateBlock): BlockDecoration | null {
      const fields = spots.byBlock.get(block.id) ?? [];
      const [first] = fields;
      if (!first || !writable) return null;
      const begin = (entry?: number, field: TemplateField = first): void => start({ blockId: block.id, field: field.key, entry });
      // A Metric's numbers are filled in one at a time: a click on one types that one, also while another is typed.
      const beginAt = (event: MouseEvent<HTMLDivElement>): void => {
        const number = clickedNumber(event, block, fields);
        if (number) begin(undefined, number);
        else begin(clickedEntry(event));
      };
      if (editing?.blockId === block.id) {
        // A Table types its cells itself.
        if (spots.tables.has(block.id)) return { className: 'atlas-sb-pane-editing atlas-sb-pane-editing--table' };
        if (block.type === 'metric') {
          return {
            className: 'atlas-sb-pane-editing',
            handlers: {
              onClick: (event: MouseEvent<HTMLDivElement>) => {
                if (!clickedInside(event.target, `${OWN_CLICKS}, .atlas-sb-pane-editor`)) beginAt(event);
              },
            },
          };
        }
        // A list of abilities stays drawn while one is typed: a click on another one types that one.
        if (block.type !== 'entries') return { className: 'atlas-sb-pane-editing' };
        return {
          className: 'atlas-sb-pane-editing atlas-sb-pane-editing--list',
          handlers: {
            onClick: (event: MouseEvent<HTMLDivElement>) => {
              if (clickedInside(event.target, `${OWN_CLICKS}, .atlas-sb-pane-entry-editor`)) return;
              const entry = clickedEntry(event);
              if (entry !== undefined) begin(entry);
            },
          },
        };
      }
      return {
        className: 'atlas-sb-pane-value',
        tabIndex: 0,
        role: 'button',
        attributes: { 'aria-label': `Edit ${fields.map((field) => field.label).join(', ')}` },
        handlers: {
          onClick: (event: MouseEvent<HTMLDivElement>) => {
            if (!clickedInside(event.target, OWN_CLICKS)) beginAt(event);
          },
          onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            begin();
          },
        },
      };
    },
  };
}
