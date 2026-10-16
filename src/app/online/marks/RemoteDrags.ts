import { Container, Graphics, type Text } from 'pixi.js';
import { pathLengthInCells } from '../../grid/gridDistance';
import { tokenCenterShift } from '../../grid/gridPlacement';
import { formatDistance } from '../../grid/measurementFormat';
import { cssColorToHexNumber, getObsidianAccentColor } from '../../pixi/utils/colorUtils';
import { destroyTree } from '../../pixi/utils/destroyTree';
import { createMeasureLabelText, drawMeasureLabel, drawMeasurePath, drawMeasurePoint, pathMidpoint } from '../../pixi/utils/measureDrawing';
import { readableLabelFontSize } from './labelSize.ts';
import type { MeasureRules } from './RemoteMeasures.ts';

type Point = { readonly x: number; readonly y: number };

/** A drag's ruler to draw. */
export interface RemoteDrag {
  /** Which drag it is (its token): a drag keeps its drawing while its key stays. */
  readonly key: string;
  /** Where the drag began, each waypoint and the place the token would land on (world pixels). */
  readonly path: readonly Point[];
  /** The token's size as Atlas stores it (1 is one cell): an even footprint is measured from the cell it starts from. */
  readonly cells: number;
  /** Whether the token snaps to the grid. */
  readonly snaps: boolean;
}

/** Above the tokens' bars and nameplates, as the label of Atlas's own drag ruler. */
const LABEL_Z_INDEX = 800;

/** Whether a path measures anything: as Atlas's ruler, points within half a pixel of its landing are its landing. */
function measures(path: readonly Point[]): boolean {
  const landing = path.at(-1);
  return landing !== undefined && path.some(({ x, y }) => Math.abs(x - landing.x) >= 0.5 || Math.abs(y - landing.y) >= 0.5);
}

interface Drawn {
  readonly path: Graphics;
  readonly pill: Graphics;
  readonly text: Text;
  key: string;
  middle: Point | null;
}

/**
 * The length of a drag's path in cells, as Atlas's drag ruler measures it: a snapped token's points
 * taken back to the cell its footprint starts from (`tokenCenterShift`), then `pathLengthInCells` by
 * the collection's diagonal rule.
 */
export function dragPathCells({ grid, measurement }: MeasureRules, path: readonly Point[], cells: number, snaps: boolean): number {
  const shift = snaps ? tokenCenterShift(grid.type, grid.size, cells) : { x: 0, y: 0 };
  return pathLengthInCells(grid, path.map(({ x, y }) => ({ x: x - shift.x, y: y - shift.y })), measurement.diagonalRule);
}

/**
 * Drags made elsewhere, drawn as Atlas draws its own drag ruler: the path in the accent colour with
 * its start and waypoints marked, and the distance on a pill at its middle, worked out here by the
 * scene's rules. `paths` belongs just under the tokens, so a token covers its own landing; `labels`
 * above them.
 */
export class RemoteDrags {
  readonly paths = new Container({ label: 'remote-drag-paths', eventMode: 'none', interactiveChildren: false });
  readonly labels = new Container({ label: 'remote-drag-labels', zIndex: LABEL_Z_INDEX, eventMode: 'none', interactiveChildren: false });
  private readonly zoom: () => number;
  private readonly rules: () => MeasureRules | null;
  private readonly drawn = new Map<string, Drawn>();
  private drags: readonly RemoteDrag[] = [];

  constructor(zoom: () => number, rules: () => MeasureRules | null) {
    this.zoom = zoom;
    this.rules = rules;
  }

  /** Whether any ruler shows. */
  get showing(): boolean {
    return this.drawn.size > 0;
  }

  /** Every drag's ruler as it is now; a drag missing from them, or whose path ends where it began, has none. */
  update(drags: readonly RemoteDrag[]): void {
    this.drags = drags;
    const rules = this.rules();
    const shown = rules === null ? [] : drags.filter(({ path }) => measures(path));
    const keys = new Set(shown.map(({ key }) => key));
    for (const [key, drawn] of this.drawn) if (!keys.has(key)) this.remove(key, drawn);
    if (rules === null) return;
    const colour = cssColorToHexNumber(getObsidianAccentColor());
    for (const drag of shown) {
      const known = this.drawn.get(drag.key);
      const key = JSON.stringify([drag.path, drag.cells, drag.snaps, colour, rules]);
      if (known?.key === key) continue;
      this.draw(known ?? this.add(drag.key), drag, key, colour, rules);
    }
  }

  /** The rules changed: every ruler is measured again. */
  redraw(): void {
    for (const drawn of this.drawn.values()) drawn.key = '';
    this.update(this.drags);
  }

  /** The zoom changed: labels keep their size on screen. */
  rescale(): void {
    for (const drawn of this.drawn.values()) this.place(drawn);
  }

  clear(): void {
    this.drags = [];
    for (const [key, drawn] of this.drawn) this.remove(key, drawn);
  }

  destroy(): void {
    this.clear();
    destroyTree(this.paths);
    destroyTree(this.labels);
  }

  private add(key: string): Drawn {
    const drawn: Drawn = { path: new Graphics(), pill: new Graphics(), text: createMeasureLabelText(), key: '', middle: null };
    this.paths.addChild(drawn.path);
    this.labels.addChild(drawn.pill, drawn.text);
    this.drawn.set(key, drawn);
    return drawn;
  }

  private draw(drawn: Drawn, { path, cells, snaps }: RemoteDrag, key: string, colour: number, rules: MeasureRules): void {
    drawn.key = key;
    drawn.path.clear();
    drawMeasurePath(drawn.path, colour, path);
    // The token covers its landing; the start and the waypoints stay marked.
    for (const point of path.slice(0, -1)) drawMeasurePoint(drawn.path, colour, point);
    const distance = formatDistance(dragPathCells(rules, path, cells, snaps), rules.measurement);
    if (drawn.text.text !== distance) drawn.text.text = distance;
    drawn.middle = pathMidpoint(path);
    this.place(drawn);
  }

  private place(drawn: Drawn): void {
    if (drawn.middle === null) return;
    const zoom = this.zoom() || 1;
    drawn.text.style.fontSize = readableLabelFontSize(zoom);
    drawMeasureLabel(drawn.pill, drawn.text, drawn.middle, zoom);
  }

  private remove(key: string, drawn: Drawn): void {
    this.drawn.delete(key);
    destroyTree(drawn.path);
    destroyTree(drawn.pill);
    destroyTree(drawn.text);
  }
}
