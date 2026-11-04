import type { SectionBlock } from '../../model/templateTypes';
import { valueText } from '../../values/valueText';
import type { SheetState } from '../sheetState';

/** What a Section is headed with: its heading property's value, else its own heading. */
export function sectionHeading(block: SectionBlock, state: SheetState): string {
  return (block.headingField ? valueText(state.reader(block.headingField)) : '') || block.heading || '';
}
