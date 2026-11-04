import type { ToolbarUnitId } from '../../../toolbar/toolbarCatalog'
import assets from '../../../assets/toolbar/assets.webp'
import dice from '../../../assets/toolbar/dice.webp'
import draw from '../../../assets/toolbar/draw.webp'
import fog from '../../../assets/toolbar/fog.webp'
import loot from '../../../assets/toolbar/loot.webp'
import measure from '../../../assets/toolbar/measure.webp'
import move from '../../../assets/toolbar/move.webp'
import palette from '../../../assets/toolbar/palette.webp'
import pin from '../../../assets/toolbar/pin.webp'
import text from '../../../assets/toolbar/text.webp'
import undo from '../../../assets/toolbar/undo.webp'
import wall from '../../../assets/toolbar/wall.webp'

/**
 * Each control (and the undo/redo bar) at work, as the toolbar editor's card shows it: 560 × 350 px
 * WebP, at most 40 KB each (`tests/unit/toolbarScreenshots.test.ts`), since
 * the build inlines them into `main.js`. Null where there is none; the card
 * then shows its text alone.
 */
export const TOOLBAR_SCREENSHOTS = {
  move, fog, draw, text, measure, wall, pin, audio: null, dice, loot, assets, palette, undo,
} satisfies Record<ToolbarUnitId, string | null>
