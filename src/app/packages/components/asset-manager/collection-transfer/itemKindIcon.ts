import { Dices, ScrollText, Shapes, type LucideIcon } from 'lucide-react';
import type { ItemKind } from '../../../../services/itemBundle/itemBundleFormat';

/** The glyph of each kind of single Atlas file, wherever one is shown on its own. */
export const ITEM_KIND_ICON: Readonly<Record<ItemKind, LucideIcon>> = {
  'statblock-template': ScrollText,
  'system-preset': Shapes,
  'dice-set': Dices,
};
