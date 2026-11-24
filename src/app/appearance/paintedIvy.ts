import { ivyPalette, repaintDrawing } from './ivyPaint';

/**
 * On `body` while the Medieval look's ivy is painted in a colour of the GM's: the look's panels then draw the
 * drawings `body` carries (`--atlas-ivy-painted-*`) in place of their own (styles/looks/atlas-looks.css).
 */
export const PAINTED_IVY_CLASS = 'atlas-ivy-painted';

/** The look's drawings, each read off a panel it decorates: the asset manager's kind or the command palette's. */
const DRAWINGS = [
  ['corner-back', 'atlas-asset-manager-modal'],
  ['corner-front', 'atlas-asset-manager-modal'],
  ['garland-back', 'atlas-asset-manager-modal'],
  ['garland-front', 'atlas-asset-manager-modal'],
  ['top-back', 'atlas-command-palette-window'],
  ['top-front', 'atlas-command-palette-window'],
] as const;

type DrawingName = (typeof DRAWINGS)[number][0];

const paintedProperty = (name: DrawingName): string => `--atlas-ivy-painted-${name}`;

/** The look's own drawings, read once: the stylesheet does not change while Atlas runs. */
let ownDrawings: ReadonlyMap<DrawingName, string> | null = null;
/** The drawings last painted, for the colour they were painted in: every window takes the same. */
let lastPainted: { colour: string; drawings: ReadonlyMap<DrawingName, string> } | null = null;

/**
 * Paints the ivy of `doc` in `colour` (`#rrggbb`), or gives it its own greens back for `''`. Call it only while the
 * Medieval look is on in `doc`, since the drawings are read off its panels; `''` may be given at any time.
 */
export function paintIvy(doc: Document, colour: string): void {
  const drawings = colour === '' ? null : paintedDrawings(doc, colour);
  if (!drawings) {
    doc.body.removeClass(PAINTED_IVY_CLASS);
    for (const [name] of DRAWINGS) doc.body.style.removeProperty(paintedProperty(name));
    return;
  }
  doc.body.setCssProps(Object.fromEntries(Array.from(drawings, ([name, drawing]) => [paintedProperty(name), drawing])));
  doc.body.addClass(PAINTED_IVY_CLASS);
}

function paintedDrawings(doc: Document, colour: string): ReadonlyMap<DrawingName, string> | null {
  if (lastPainted?.colour === colour) return lastPainted.drawings;
  const own = ownDrawings ?? readOwnDrawings(doc);
  if (!own) return null;
  const palette = ivyPalette(colour);
  const drawings = new Map(Array.from(own, ([name, drawing]) => [name, repaintDrawing(drawing, palette)]));
  lastPainted = { colour, drawings };
  return drawings;
}

/** The look's drawings as its panels define them, read off hidden probes before any painted ones stand over them. */
function readOwnDrawings(doc: Document): ReadonlyMap<DrawingName, string> | null {
  if (doc.body.hasClass(PAINTED_IVY_CLASS)) return null;
  const view = doc.defaultView ?? window;
  const read = new Map<DrawingName, string>();
  for (const [name, panelClass] of DRAWINGS) {
    const probe = doc.body.createDiv({ cls: panelClass });
    probe.hide();
    const drawing = view.getComputedStyle(probe).getPropertyValue(`--atlas-theme-ivy-${name}`).trim();
    probe.remove();
    if (!drawing) return null;
    read.set(name, drawing);
  }
  ownDrawings = read;
  return read;
}
