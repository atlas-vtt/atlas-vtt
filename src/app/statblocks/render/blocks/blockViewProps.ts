import type { TemplateBlock } from '../../model/templateTypes';
import type { BlockDisplay } from '../blockDisplay';

/** What every block view gets: its block, and how it shows (its values, its fallback, a prompt). */
export interface BlockViewProps<B extends TemplateBlock> {
  block: B;
  display: BlockDisplay;
}
