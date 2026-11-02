/** A box in the view's pixels. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Size {
  width: number;
  height: number;
}

/** Where the wizard's panel and its floating preview stand. */
export interface WizardLayout {
  panel: { left: number; top: number };
  preview: Box;
}

/** Room kept free at the view's edges. */
export const WIZARD_MARGIN = 16;
/** Between the panel and the preview. */
export const WIZARD_GAP = 12;
const PREVIEW_MAX_WIDTH = 640;
const PREVIEW_MIN_WIDTH = 220;
const PREVIEW_ASPECT = 4 / 3;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, Math.max(min, max)));

/** `start` moved just far enough that something `length` long stays `WIZARD_MARGIN` inside `extent`. */
const inside = (start: number, length: number, extent: number): number => clamp(start, WIZARD_MARGIN, extent - WIZARD_MARGIN - length);

/** The largest 4:3 box within `width` × `height`, up to `PREVIEW_MAX_WIDTH` wide. */
function fitted(width: number, height: number): Size {
  const w = Math.max(0, Math.min(PREVIEW_MAX_WIDTH, width, height * PREVIEW_ASPECT));
  return { width: Math.round(w), height: Math.round(w / PREVIEW_ASPECT) };
}

/**
 * Places the wizard in a view of `view`'s size. With an `anchor` (the note pin dropdown it takes
 * over) the panel stands where the dropdown stood and the preview beside it on the side with more
 * room, or above or below it where neither side holds a useful preview. Without one, panel and
 * preview stand side by side in the middle of the view. Panel and preview share their top line,
 * and everything stays `WIZARD_MARGIN` inside the view.
 */
export function wizardLayout(view: Size, panel: Size, anchor: Box | null): WizardLayout {
  const innerHeight = view.height - 2 * WIZARD_MARGIN;
  // The preview's top lines up with the panel's, so neither moves as a step makes the panel taller.
  const besideTop = (height: number, top: number): number => inside(top, height, view.height);

  if (!anchor) {
    const size = fitted(view.width - 2 * WIZARD_MARGIN - panel.width - WIZARD_GAP, innerHeight);
    if (size.width >= PREVIEW_MIN_WIDTH) {
      const left = Math.round((view.width - (panel.width + WIZARD_GAP + size.width)) / 2);
      const top = inside(Math.round((view.height - size.height) / 2), panel.height, view.height);
      return {
        panel: { left, top },
        preview: { left: left + panel.width + WIZARD_GAP, top: besideTop(size.height, top), ...size },
      };
    }
    return stacked(view, panel, (view.width - panel.width) / 2, (view.height - panel.height) / 2);
  }

  const left = inside(anchor.left, panel.width, view.width);
  const top = inside(anchor.top, panel.height, view.height);
  const roomLeft = left - WIZARD_GAP - WIZARD_MARGIN;
  const roomRight = view.width - WIZARD_MARGIN - (left + panel.width) - WIZARD_GAP;
  const toRight = roomRight >= roomLeft;
  const size = fitted(toRight ? roomRight : roomLeft, innerHeight);
  if (size.width < PREVIEW_MIN_WIDTH) return stacked(view, panel, left, top);
  return {
    panel: { left, top },
    preview: {
      left: toRight ? left + panel.width + WIZARD_GAP : left - WIZARD_GAP - size.width,
      top: besideTop(size.height, top),
      ...size,
    },
  };
}

/** A view too narrow for a preview beside the panel: the preview above or below it, where more room is. */
function stacked(view: Size, panel: Size, left: number, top: number): WizardLayout {
  const panelLeft = inside(left, panel.width, view.width);
  const panelTop = inside(top, panel.height, view.height);
  const above = panelTop - WIZARD_GAP - WIZARD_MARGIN;
  const below = view.height - WIZARD_MARGIN - (panelTop + panel.height) - WIZARD_GAP;
  const size = fitted(view.width - 2 * WIZARD_MARGIN, Math.max(above, below));
  const previewLeft = inside(panelLeft + panel.width / 2 - size.width / 2, size.width, view.width);
  return {
    panel: { left: panelLeft, top: panelTop },
    preview: {
      left: Math.round(previewLeft),
      top: below >= above ? panelTop + panel.height + WIZARD_GAP : panelTop - WIZARD_GAP - size.height,
      ...size,
    },
  };
}
