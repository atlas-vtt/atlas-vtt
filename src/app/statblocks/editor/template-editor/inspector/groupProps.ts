import type { StatblockTemplate, TemplateBlock } from '../../../model/templateTypes';
import type { EditorSession } from '../sessionTypes';

/** What every inspector group gets: the selected block as the template holds it now. */
export interface GroupProps {
  block: TemplateBlock;
  template: StatblockTemplate;
  session: EditorSession;
  /** A built-in, or a template of a newer Atlas: every control shows, disabled. */
  readOnly: boolean;
  /** The container the block stands in; null at the top level. */
  parent: TemplateBlock | null;
}
